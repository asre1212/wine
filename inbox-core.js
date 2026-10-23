/* Encrypted chat deliveries. Shared validation is also used by the assistant CLI. */
(function (root) {
  'use strict';
  const REPO = 'asre1212/wine', BRANCH = 'main';
  const COLLECTION_KEY = 'cellar.bottles.v1', CONFIG_KEY = 'cellar.inbox.connection.v1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SHA = /^[0-9a-f]{40}$/i;
  const TYPES = {
    wine: ['Red','White','Rosé','Sparkling','Dessert','Fortified','Orange','Other'],
    sake: ['Junmai','Junmai Ginjo','Junmai Daiginjo','Ginjo','Daiginjo','Honjozo','Nigori','Sparkling','Koshu','Other'],
    liquor: ['Bourbon','Whiskey','Scotch','Rye','Irish Whiskey','Japanese Whisky','Rum','Gin','Vodka','Tequila','Mezcal','Cognac','Brandy','Port','Liqueur','Other']
  };
  function string(value, max, label, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error('Invalid ' + label + '.');
    return value.trim();
  }
  function numeric(value, max, label) {
    if (value == null || value === '') return null;
    if (!['string','number'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > max) throw Error('Invalid ' + label + '.');
    return Number(value);
  }
  function validateBottle(x) {
    if (!x || !UUID.test(x.id)) throw Error('Each delivered bottle needs a unique UUID.');
    const category = x.category || 'wine', type = x.type || 'Other';
    if (!TYPES[category]?.includes(type)) throw Error('Invalid bottle category or type.');
    const result = {id:x.id, category, type, name:string(x.name,300,'bottle name',true), subtype:string(x.subtype,100,'style'), notes:string(x.notes,5000,'notes'), rating:numeric(x.rating,5,'rating'), price:numeric(x.price,10000000,'price')};
    for (const flag of ['cellar','wantToTry']) {
      if (x[flag] != null && typeof x[flag] !== 'boolean') throw Error('Invalid bottle status.');
      result[flag] = x[flag] === true;
    }
    if (result.cellar && result.wantToTry || (result.cellar || result.wantToTry) && result.rating !== null) throw Error('Untasted bottles cannot have a rating.');
    for (const key of ['priceYear','yearBought','yearDrank']) {
      result[key] = numeric(x[key],9999,key);
      if (result[key] !== null && (!Number.isInteger(result[key]) || result[key] < 1000)) throw Error('Invalid ' + key + '.');
    }
    result.tastingSources = [];
    if (x.tastingSources != null) {
      if (!Array.isArray(x.tastingSources) || x.tastingSources.length > 20) throw Error('Invalid tasting sources.');
      result.tastingSources = x.tastingSources.map(source => {
        const url = new URL(source.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw Error('Tasting sources must use HTTPS.');
        return {title:string(source.title,300,'source title',true), url:url.href, summary:string(source.summary,1200,'source summary',true)};
      });
    }
    return result;
  }
  function validatePayload(payload) {
    if (payload?.version !== 1 || !UUID.test(payload.id) || !Array.isArray(payload.bottles) || !payload.bottles.length || payload.bottles.length > 500) throw Error('A batch must contain 1–500 bottles and a delivery UUID.');
    const bottles = payload.bottles.map(validateBottle);
    if (new Set(bottles.map(x=>x.id)).size !== bottles.length) throw Error('Duplicate bottle IDs in batch.');
    return {version:1,id:payload.id,bottles};
  }
  function validateReceipt(x) {
    if (!x || !UUID.test(x.id) || x.path !== 'inbox/'+x.id+'.json' || !SHA.test(x.sha) || !Number.isFinite(x.acceptedAt)) throw Error('Invalid delivery receipt.');
    return {id:x.id,path:x.path,sha:x.sha,acceptedAt:x.acceptedAt};
  }
  function readCollection(storage) {
    const value = JSON.parse(storage.getItem(COLLECTION_KEY) || '[]');
    if (Array.isArray(value)) return {version:2,bottles:value,receipts:[]};
    if (value?.version !== 2 || !Array.isArray(value.bottles) || !Array.isArray(value.receipts)) throw Error('Local collection is unreadable. Restore a backup before saving.');
    return {...value,receipts:value.receipts.map(validateReceipt)};
  }
  function writeCollection(storage, collection) {
    // One atomic localStorage write contains both the bottles and durable receipts.
    storage.setItem(COLLECTION_KEY, JSON.stringify(collection.receipts.length ? collection : collection.bottles));
  }
  function saveBottles(storage, bottles, restoredReceipts = []) {
    const current = readCollection(storage), receipts = new Map(current.receipts.map(x=>[x.id,x]));
    restoredReceipts.map(validateReceipt).forEach(x=>{if (!receipts.has(x.id)) receipts.set(x.id,x);});
    writeCollection(storage,{version:2,bottles,receipts:[...receipts.values()]});
  }
  function accepted(storage, packet) {
    return readCollection(storage).receipts.some(x=>x.id===packet.id && x.path===packet.path && x.sha===packet.sha);
  }
  function accept(storage, packet, bottles) {
    validatePayload({version:1,id:packet.id,bottles});
    const receipt = validateReceipt({...packet,acceptedAt:Date.now()}), current = readCollection(storage);
    const prior = current.receipts.find(x=>x.id===packet.id);
    if (prior) {
      if (prior.sha !== packet.sha || prior.path !== packet.path) throw Error('This delivery ID was already used. Ask for a new batch.');
      return {bottles:current.bottles,count:0};
    }
    const ids = new Set(current.bottles.map(x=>x.id));
    if (bottles.some(x=>!UUID.test(x.id) || ids.has(x.id)) || new Set(bottles.map(x=>x.id)).size !== bottles.length) throw Error('A bottle ID already exists. Ask for a new batch; existing bottles were not overwritten.');
    const next = current.bottles.concat(bottles);
    writeCollection(storage,{version:2,bottles:next,receipts:current.receipts.concat(receipt)});
    return {bottles:next,count:bottles.length};
  }
  const b64 = bytes => {let s='';for (const b of new Uint8Array(bytes)) s+=String.fromCharCode(b);return btoa(s);};
  const un64 = s => {if(typeof s!=='string')throw Error('Invalid encrypted data.');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
  const encode = x => new TextEncoder().encode(x);
  const decode = x => new TextDecoder().decode(x);
  async function keyId(publicKey) {
    const hash = await crypto.subtle.digest('SHA-256',encode(publicKey.n+':'+publicKey.e));
    return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function aad(envelope) {return encode(['cellar-delivery',1,envelope.id,envelope.keyId].join(':'));}
  async function encryptDelivery(keyFile, input) {
    if (keyFile?.version!==1 || keyFile.type!=='cellar-public-key' || keyFile.publicKey?.d || keyFile.keyId!==await keyId(keyFile.publicKey)) throw Error('Use this wine app’s public delivery key.');
    const payload = validatePayload(input);
    const publicKey = await crypto.subtle.importKey('jwk',keyFile.publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
    const aes = await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const envelope = {type:'cellar-delivery',version:1,id:payload.id,keyId:keyFile.keyId};
    envelope.key = b64(await crypto.subtle.encrypt({name:'RSA-OAEP'},publicKey,await crypto.subtle.exportKey('raw',aes)));
    envelope.iv = b64(iv);
    envelope.data = b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(envelope)},aes,encode(JSON.stringify(payload))));
    if (JSON.stringify(envelope).length > 900000) throw Error('Batch is too large. Split it into smaller batches.');
    return envelope;
  }
  async function decryptDelivery(envelope, identity) {
    if (envelope?.type!=='cellar-delivery' || envelope.version!==1 || !UUID.test(envelope.id)) throw Error('Unsupported delivery.');
    if (envelope.keyId!==identity.keyId) throw Error('Batch belongs to a different device. Ask for it to be resent after connecting this device.');
    const iv=un64(envelope.iv);
    if (iv.length!==12 || typeof envelope.data!=='string' || envelope.data.length>900000) throw Error('Invalid encrypted delivery size.');
    let payload;
    try {
      const raw = await crypto.subtle.decrypt({name:'RSA-OAEP'},identity.privateKey,un64(envelope.key));
      const aes = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
      payload = JSON.parse(decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(envelope)},aes,un64(envelope.data))));
    } catch {throw Error('Batch could not be decrypted. It was not saved or deleted.');}
    if (payload.id!==envelope.id) throw Error('Delivery ID mismatch.');
    return validatePayload(payload);
  }
  function client({storage,fetch:fetcher,identity}) {
    function config() {const c=JSON.parse(storage.getItem(CONFIG_KEY)||'null');return c?.token ? c : null;}
    function disconnect() {storage.removeItem(CONFIG_KEY);}
    async function request(path,options={},token=config()?.token) {
      if (!token) throw Error('Connect this device to GitHub first.');
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
      try {
        const response=await fetcher('https://api.github.com/repos/'+REPO+'/contents/'+path,{...options,cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}});
        if (!response.ok) {const e=Error('GitHub '+response.status+'. Check the connection and Contents read/write permission.');e.status=response.status;throw e;}
        return response.status===204 ? null : response.json();
      } finally {clearTimeout(timer);}
    }
    async function pair(token,replace=false) {
      token=token.trim()||config()?.token;
      if (!token) throw Error('Enter a fine-grained token for asre1212/wine.');
      const local=await identity();let sha;
      try {
        const existing=await request('delivery-key.json?ref='+BRANCH,{},token);sha=existing.sha;
        const other=JSON.parse(decode(un64(existing.content.replace(/\s/g,''))));
        if (other.type!=='cellar-public-key' || other.keyId!==local.keyId) {
          if (!replace) {const e=Error('Another device is connected.');e.code='OTHER_DEVICE';throw e;}
        }
      } catch(e) {if(e.status!==404)throw e;}
      const content=b64(encode(JSON.stringify({type:'cellar-public-key',version:1,keyId:local.keyId,publicKey:local.publicKey},null,2)+'\n'));
      await request('delivery-key.json',{method:'PUT',body:JSON.stringify({message:'Connect wine delivery public key',branch:BRANCH,content,...(sha?{sha}:{})})},token);
      storage.setItem(CONFIG_KEY,JSON.stringify({token}));
    }
    async function list() {
      let files;
      try {files=await request('inbox?ref='+BRANCH);}catch(e){if(e.status===404)return [];throw e;}
      if(!Array.isArray(files)) throw Error('GitHub inbox is not a folder.');
      return files.filter(f=>f.type==='file' && UUID.test(f.name.replace(/\.json$/,'')) && f.name.endsWith('.json')).map(f=>{
        if (f.path!=='inbox/'+f.name || !SHA.test(f.sha)) throw Error('Invalid inbox file.');
        return {id:f.name.slice(0,-5),path:f.path,sha:f.sha,size:f.size};
      });
    }
    async function read(packet) {
      if(packet.size>900000)throw Error('Batch is too large. Ask for smaller batches.');
      const file=await request(packet.path+'?ref='+BRANCH);
      if(file.sha!==packet.sha)throw Error('Batch changed. Check deliveries again.');
      if(file.encoding!=='base64'||file.size>900000)throw Error('Unsupported batch size or encoding.');
      const envelope=JSON.parse(decode(un64(file.content.replace(/\s/g,''))));
      if(envelope.id!==packet.id)throw Error('Batch filename does not match its delivery ID.');
      return decryptDelivery(envelope,await identity());
    }
    async function cleanup(packet) {
      if(!accepted(storage,packet))throw Error('Save and accept this exact batch locally before deleting it.');
      try {await request(packet.path,{method:'DELETE',body:JSON.stringify({message:'Remove accepted encrypted wine batch',sha:packet.sha,branch:BRANCH})});}
      catch(e) {
        if(e.status!==404)throw e;
        // A 404 may also mean a revoked token. Confirm repo access before treating it as gone.
        await request('README.md?ref='+BRANCH);
      }
    }
    return {config,disconnect,pair,list,read,cleanup};
  }
  const api={REPO,BRANCH,COLLECTION_KEY,CONFIG_KEY,TYPES,validateBottle,validatePayload,validateReceipt,readCollection,saveBottles,accepted,accept,b64,un64,keyId,encryptDelivery,decryptDelivery,client};
  root.CellarInboxCore=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
