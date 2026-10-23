/* Device connection and review queue. Nothing is imported without the user's acceptance. */
(function () {
  'use strict';
  const core=window.CellarInboxCore, $=id=>document.getElementById(id);
  let keyPromise, checking=false, connecting=false, pending=[];
  async function deviceIdentity() {
    if(keyPromise)return keyPromise;
    keyPromise=(async()=>{
      if(!crypto.subtle)throw Error('Encrypted delivery needs HTTPS and a current browser.');
      const db=await new Promise((resolve,reject)=>{
        const r=indexedDB.open('cellar.delivery.v1',1);
        r.onupgradeneeded=()=>r.result.createObjectStore('settings');
        r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
      });
      try {
        const existing=await new Promise((resolve,reject)=>{
          const r=db.transaction('settings').objectStore('settings').get('identity');
          r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
        });
        if(existing)return existing;
        const keys=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
        const publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
        const generated={privateKey:keys.privateKey,publicKey,keyId:await core.keyId(publicKey)};
        // Another tab may have created the identity while RSA generation was running.
        return await new Promise((resolve,reject)=>{
          const tx=db.transaction('settings','readwrite'), store=tx.objectStore('settings'), r=store.get('identity');let chosen;
          r.onsuccess=()=>{chosen=r.result||generated;if(!r.result)store.put(chosen,'identity');};
          tx.oncomplete=()=>resolve(chosen);tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};
        });
      } finally {db.close();}
    })().catch(e=>{keyPromise=null;throw e;});
    return keyPromise;
  }
  const client=core.client({storage:localStorage,fetch:(...args)=>fetch(...args),identity:deviceIdentity});
  function status(message){$('inboxStatus').textContent=message;}
  function connectionState(){
    const connected=!!client.config();
    $('inboxConnection').textContent=connected?'Connected on this device':'Connect this device once to receive batches from chat.';
    $('inboxToken').placeholder=connected?'Token saved locally; leave blank to keep':'GitHub fine-grained token';
    $('inboxDisconnect').hidden=!connected;
    $('inboxCheck').disabled=!connected||checking||connecting;
  }
  function renderPending(){
    const list=$('inboxList');list.replaceChildren();
    for(const packet of pending){
      const row=document.createElement('div');row.className='inbox-item';
      const label=document.createElement('span');label.textContent='Wine batch · '+packet.id.slice(0,8);
      const button=document.createElement('button');button.type='button';button.className='btn-ghost';button.textContent='Review batch';button.disabled=checking;
      button.onclick=async()=>{
        button.disabled=true;status('Opening encrypted batch…');
        try {
          const payload=await client.read(packet);
          if(CellarBatchApp.openDelivery(packet,payload)){
            status(payload.bottles.length+' bottles ready below. Edit and review, then accept to save locally.');
            $('batchReviewTitle').scrollIntoView?.({behavior:'smooth',block:'start'});
          }
        }catch(e){status(e.message);}finally{button.disabled=false;}
      };
      row.append(label,button);list.append(row);
    }
    $('inboxBadge').textContent=pending.length ? String(pending.length) : '';
    $('inboxBadge').hidden=!pending.length;
  }
  async function check(){
    if(checking||connecting||!client.config())return;
    checking=true;connectionState();status('Checking deliveries and retrying cleanup…');
    let removed=0;const errors=[];
    try {
      const files=await client.list();pending=[];
      // Retry receipts even if a previous deletion already removed the active file.
      // The exact accepted blob SHA is required; changed files cannot be removed.
      const receipts=core.readCollection(localStorage).receipts;
      for(const receipt of receipts.filter(r=>files.some(f=>f.id===r.id&&f.sha===r.sha))){
        try{await client.cleanup(receipt);removed++;}catch(e){errors.push('Saved batch cleanup: '+e.message);}
      }
      pending=files.filter(packet=>!core.accepted(localStorage,packet));
      status((pending.length ? pending.length+' batch'+(pending.length===1?'':'es')+' waiting for review.' : 'No batches waiting for review.')+(removed?' '+removed+' accepted batch'+(removed===1?'':'es')+' removed from GitHub.':'')+(errors.length?' '+errors.join(' '):''));
    }catch(e){status(e.message);}finally{checking=false;connectionState();renderPending();}
  }
  function init(){
    $('inboxConnect').onclick=async()=>{
      if(connecting||checking)return;
      connecting=true;$('inboxConnect').disabled=true;connectionState();status('Connecting this device…');
      try {
        const token=$('inboxToken').value;
        try{await client.pair(token);}catch(e){
          if(e.code!=='OTHER_DEVICE')throw e;
          if(!confirm('Replace the other device’s delivery connection? Queued batches for that device must be resent. Saved bottles stay on their original device.')){status('Connection unchanged.');return;}
          await client.pair(token,true);
        }
        $('inboxToken').value='';$('inboxSetup').open=false;
        status('Connected. Upload a wine list in chat and ask to send it to the wine app.');
      }catch(e){status(e.message);}finally{connecting=false;$('inboxConnect').disabled=false;connectionState();}
    };
    $('inboxDisconnect').onclick=()=>{
      client.disconnect();$('inboxToken').value='';pending=[];renderPending();connectionState();
      status('Disconnected on this device. Saved bottles and the local receiving key are kept.');
    };
    $('inboxCheck').onclick=check;
    $('settingsBtn').addEventListener('click',()=>{connectionState();check();});
    window.addEventListener('cellar-delivery-accepted',async event=>{
      const {packet,count}=event.detail;
      pending=pending.filter(x=>x.id!==packet.id);renderPending();
      status(count+' bottles saved locally. Removing the accepted GitHub delivery…');
      try{await client.cleanup(packet);status(count+' bottles saved locally. GitHub inbox file deleted.');}
      catch(e){status('Saved locally. GitHub cleanup pending; Check deliveries will retry without adding duplicates. '+e.message);}
    });
    window.addEventListener('online',check);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
    connectionState();check();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
