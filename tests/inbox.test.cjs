const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto,randomUUID,createHash}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb');
const core=require('../inbox-core.js');
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const bottle=()=>({id:randomUUID(),name:'William Fèvre Chablis 2022',category:'wine',type:'White',subtype:'Chablis',price:65,rating:null,cellar:true,notes:'Online note: citrus and apple.\nCrisp acidity with a mineral finish.',yearBought:2025,tastingSources:[{title:'Producer tasting sheet',url:'https://example.com/tasting',summary:'Citrus and apple.\nCrisp, mineral finish.'}]});
const payload=()=>({version:1,id:randomUUID(),bottles:[bottle()]});
const packet=p=>({id:p.id,path:'inbox/'+p.id+'.json',sha:'b'.repeat(40),size:2000});
let identityPromise;
async function identity(){return identityPromise??=(async()=>{const k=await webcrypto.subtle.generateKey({name:'RSA-OAEP',hash:'SHA-256',modulusLength:3072,publicExponent:new Uint8Array([1,0,1])},false,['encrypt','decrypt']);const publicKey=await webcrypto.subtle.exportKey('jwk',k.publicKey);return {publicKey,privateKey:k.privateKey,keyId:await core.keyId(publicKey)};})();}
const publicFile=i=>({type:'cellar-public-key',version:1,keyId:i.keyId,publicKey:i.publicKey});

test('actual AES-GCM/RSA delivery and assistant CLI preserve Unicode, metadata, and sources',async()=>{
 const i=await identity(),p=payload(),envelope=await core.encryptDelivery(publicFile(i),p);
 assert.equal(JSON.stringify(envelope).includes(p.bottles[0].name),false);
 assert.deepEqual(await core.decryptDelivery(envelope,i),core.validatePayload(p));
 assert.equal(i.privateKey.extractable,false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cellar-test-'));
 try{fs.writeFileSync(path.join(dir,'key.json'),JSON.stringify(publicFile(i)));fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify(p));
 execFileSync(process.execPath,[path.join(__dirname,'../scripts/create-delivery.mjs'),path.join(dir,'key.json'),path.join(dir,'input.json'),path.join(dir,p.id+'.json')]);
 const delivered=JSON.parse(fs.readFileSync(path.join(dir,p.id+'.json')));assert.deepEqual(await core.decryptDelivery(delivered,i),core.validatePayload(p));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('wrong device, altered ciphertext and altered envelope ID cannot decrypt',async()=>{
 const i=await identity(),p=payload(),e=await core.encryptDelivery(publicFile(i),p);
 await assert.rejects(core.decryptDelivery(e,{...i,keyId:'wrong'}),/different device/);
 await assert.rejects(core.decryptDelivery({...e,data:core.b64(new Uint8Array(60))},i),/could not be decrypted/);
 await assert.rejects(core.decryptDelivery({...e,id:randomUUID()},i),/could not be decrypted/);
});
test('validation rejects ambiguous or unsafe structured fields before delivery',()=>{
 const p=payload();
 for(const change of [{rating:6},{price:-1},{yearBought:2020.5},{cellar:'yes'},{cellar:true,wantToTry:true},{rating:4,cellar:true},{name:''},{category:'wrong'},{tastingSources:[{title:'x',url:'javascript:alert(1)',summary:'x'}]}])assert.throws(()=>core.validatePayload({...p,bottles:[{...p.bottles[0],...change}]}));
 assert.throws(()=>core.validatePayload({...p,bottles:[p.bottles[0],p.bottles[0]]}),/Duplicate/);
 assert.throws(()=>core.validatePayload({...p,bottles:[]}));
});
test('atomic receipt and bottle save migrates legacy data, survives edits/deletion, restores backups',()=>{
 const s=memory(),p=payload(),f=packet(p);s.setItem(core.COLLECTION_KEY,JSON.stringify([{id:'old',name:'Existing'}]));
 assert.equal(core.accept(s,f,p.bottles).count,1);assert.equal(core.readCollection(s).bottles.length,2);assert.equal(core.accepted(s,f),true);
 core.saveBottles(s,[]);assert.equal(core.accept(s,f,p.bottles).count,0);assert.equal(core.readCollection(s).bottles.length,0);
 const restored=memory();core.saveBottles(restored,[],core.readCollection(s).receipts);assert.equal(core.accepted(restored,f),true);
 assert.throws(()=>core.accept(s,{...f,sha:'c'.repeat(40)},p.bottles),/already used/);
});
test('full or corrupted local storage cannot acknowledge or delete an unaccepted batch',async()=>{
 const s=memory(),p=payload(),f=packet(p);let deletes=0;
 const client=core.client({storage:s,identity,fetch:async()=>{deletes++;throw Error('Must not call GitHub');}});
 s.setItem=()=>{throw Error('Quota exceeded');};
 assert.throws(()=>core.accept(s,f,p.bottles),/Quota/);assert.equal(core.accepted(s,f),false);
 await assert.rejects(client.cleanup(f),/before deleting/);assert.equal(deletes,0);
 const bad=memory();bad.setItem(core.COLLECTION_KEY,'broken');assert.throws(()=>core.accept(bad,f,p.bottles));assert.equal(bad.getItem(core.COLLECTION_KEY),'broken');
});
test('existing bottle IDs never overwrite saved notes',()=>{
 const s=memory(),p=payload(),f=packet(p);core.saveBottles(s,[{...p.bottles[0],notes:'My existing notes'}]);
 assert.throws(()=>core.accept(s,f,p.bottles),/already exists/);assert.equal(core.readCollection(s).bottles[0].notes,'My existing notes');assert.equal(core.accepted(s,f),false);
});

function server(storage){
 const files=new Map(),calls=[];let deleteFailure=false;
 const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
 function set(file,data){const text=JSON.stringify(data),sha=createHash('sha1').update(text).digest('hex');files.set(file,{name:path.basename(file),path:file,type:'file',sha,size:Buffer.byteLength(text),encoding:'base64',content:Buffer.from(text).toString('base64')});return files.get(file);}
 async function fetch(url,options){const file=new URL(url).pathname.split('/contents/')[1];calls.push({file,options});
  if(options.method==='PUT'){const body=JSON.parse(options.body);set(file,JSON.parse(Buffer.from(body.content,'base64')));return response(201,{});}
  if(options.method==='DELETE'){
   assert.equal(core.readCollection(storage).receipts.some(r=>r.path===file&&r.sha===JSON.parse(options.body).sha),true,'delete must follow durable receipt');
   if(deleteFailure)return response(503,{});
   if(!files.has(file))return response(404,{});
   if(files.get(file).sha!==JSON.parse(options.body).sha)return response(409,{});
   files.delete(file);return response(200,{});
  }
  if(file==='inbox')return response(200,[...files.values()].filter(f=>f.path.startsWith('inbox/')));
  if(file==='README.md')return response(200,{});
  return files.has(file)?response(200,files.get(file)):response(404,{});
 }
 return {files,calls,fetch,set,failDeletes:value=>deleteFailure=value};
}
async function until(fn){for(let n=0;n<150;n++){if(fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Timed out waiting for UI');}
async function ui(){
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{url:'https://asre1212.github.io/wine/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,$=id=>w.document.getElementById(id);
 w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;Object.defineProperty(w,'crypto',{value:webcrypto});w.indexedDB=new IDBFactory();
 const github=server(w.localStorage);w.fetch=github.fetch;
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 for(const file of ['inbox-core.js','app.js','inbox.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
 await until(()=>$('appVersion').textContent==='2.7.1');
 return {dom,w,$,github};
}
async function connect(context){const {$,github}=context;$('inboxToken').value='test-token-not-a-secret';$('inboxConnect').click();await until(()=>$('inboxConnection').textContent==='Connected on this device');return JSON.parse(Buffer.from(github.files.get('delivery-key.json').content,'base64'));}
async function queue(context,key){const p=payload(),e=await core.encryptDelivery(key,p);context.github.set('inbox/'+p.id+'.json',e);context.$('inboxCheck').click();await until(()=>context.$('inboxList').querySelector('button'));return p;}

test('pair → queue → edit/review → accept → delete, with sources and status retained',async()=>{
 const c=await ui(),{w,$,github,dom}=c;try{
 const key=await connect(c),p=await queue(c,key);
 assert.equal(w.localStorage.getItem(core.COLLECTION_KEY),null);assert.equal($('inboxToken').value,'');
 $('inboxList').querySelector('button').click();await until(()=>$('batchReviewList').children.length===1);
 assert.equal($('saveBatchBtn').disabled,true);assert.equal(github.files.has('inbox/'+p.id+'.json'),true);
 assert.equal($('batchReviewList').querySelector('a').href,'https://example.com/tasting');
 $('reviewAllBatchBtn').click();assert.equal($('saveBatchBtn').disabled,false);
 const input=$('batchReviewList').querySelector('[data-batch-field="notes"]');input.value='My correction.\nCrisp mineral finish.';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal($('saveBatchBtn').disabled,true);
 $('reviewAllBatchBtn').click();$('saveBatchBtn').click();await until(()=>$('inboxStatus').textContent.includes('file deleted'));
 const collection=core.readCollection(w.localStorage);assert.equal(collection.bottles.length,1);assert.equal(collection.receipts.length,1);
 assert.equal(collection.bottles[0].notes,input.value);assert.equal(collection.bottles[0].yearBought,2025);assert.equal(collection.bottles[0].cellar,true);assert.equal(collection.bottles[0].tastingSources[0].url,'https://example.com/tasting');assert.equal(github.files.has('inbox/'+p.id+'.json'),false);
 assert.ok(github.calls.every(c=>c.options.cache==='no-store'&&c.options.credentials==='omit'&&!JSON.stringify(c.options.body||'').includes('My correction')));
 // Backups include receipts, without credentials or private keys.
 let blob;w.URL.createObjectURL=b=>{blob=b;return 'blob:test';};$('exportJsonBtn').click();const text=await new Promise(resolve=>{const r=new w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(blob);});const backup=JSON.parse(text);assert.equal(backup.deliveryReceipts.length,1);assert.equal(backup.bottles.length,1);assert.ok(!text.includes('test-token'));assert.ok(!text.includes('privateKey'));
 }finally{dom.window.close();}
});
test('closing review leaves remote file; cleanup failure retries without reimport after local deletion',async()=>{
 const c=await ui(),{w,$,github,dom}=c;try{
 const key=await connect(c),p=await queue(c,key);$('inboxList').querySelector('button').click();await until(()=>$('batchReviewList').children.length);
 $('cancelBatchBtn').click();assert.equal(w.localStorage.getItem(core.COLLECTION_KEY),null);assert.equal(github.files.has('inbox/'+p.id+'.json'),true);
 $('inboxList').querySelector('button').click();await until(()=>$('batchReviewList').children.length);github.failDeletes(true);
 $('reviewAllBatchBtn').click();$('saveBatchBtn').click();await until(()=>$('inboxStatus').textContent.includes('cleanup pending'));
 assert.equal(core.readCollection(w.localStorage).bottles.length,1);assert.equal(github.files.has('inbox/'+p.id+'.json'),true);
 core.saveBottles(w.localStorage,[]);github.failDeletes(false);$('inboxCheck').click();await until(()=>$('inboxStatus').textContent.includes('removed from GitHub'));
 assert.equal(core.readCollection(w.localStorage).bottles.length,0);assert.equal(github.files.has('inbox/'+p.id+'.json'),false);
 }finally{dom.window.close();}
});
test('UI local save failure keeps review and remote delivery; changed remote SHA cannot be deleted',async()=>{
 const c=await ui(),{w,$,github,dom}=c;try{
 const key=await connect(c),p=await queue(c,key);$('inboxList').querySelector('button').click();await until(()=>$('batchReviewList').children.length);
 $('reviewAllBatchBtn').click();const original=w.Storage.prototype.setItem;
 w.Storage.prototype.setItem=function(k,v){if(k===core.COLLECTION_KEY)throw Error('Quota exceeded');return original.call(this,k,v);};
 $('saveBatchBtn').click();assert.equal(w.localStorage.getItem(core.COLLECTION_KEY),null);assert.equal($('batchReviewList').children.length,1);assert.equal(github.calls.filter(x=>x.options.method==='DELETE').length,0);
 w.Storage.prototype.setItem=original;
 // Concurrent replacement of the remote blob cannot delete the replacement.
 github.set('inbox/'+p.id+'.json',{changed:true});$('saveBatchBtn').click();await until(()=>$('inboxStatus').textContent.includes('cleanup pending'));
 assert.equal(core.readCollection(w.localStorage).bottles.length,1);assert.equal(github.files.has('inbox/'+p.id+'.json'),true);
 }finally{dom.window.close();}
});

test('review can skip a duplicate and preserves want-to-try; receipt survives later manual edits',async()=>{
 const c=await ui(),{w,$,dom}=c;try{
 const p=payload();p.bottles.push({...bottle(),id:randomUUID(),name:'Promontory 2019',cellar:false,wantToTry:true});
 w.CellarBatchApp.openDelivery(packet(p),p);
 const skip=$('batchReviewList').querySelector('[data-batch-field="skip"]');skip.checked=true;skip.dispatchEvent(new w.Event('change',{bubbles:true}));
 $('reviewAllBatchBtn').click();$('saveBatchBtn').click();await until(()=>$('inboxStatus').textContent.includes('cleanup pending'));
 let collection=core.readCollection(w.localStorage);assert.equal(collection.bottles.length,1);assert.equal(collection.bottles[0].name,'Promontory 2019');assert.equal(collection.bottles[0].wantToTry,true);
 $('addBtn').click();const form=$('entryForm');form.elements.name.value='Manual bottle';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>core.readCollection(w.localStorage).bottles.length===2);collection=core.readCollection(w.localStorage);assert.equal(collection.receipts.length,1);
 }finally{dom.window.close();}
});
test('service worker never caches GitHub requests or encrypted inbox files',()=>{
 const listeners={};const context={URL,self:{addEventListener:(name,fn)=>listeners[name]=fn}};
 require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),context);
 for(const url of ['https://api.github.com/repos/asre1212/wine/contents/inbox','https://asre1212.github.io/wine/inbox/test.json','https://asre1212.github.io/wine/delivery-key.json']){
  let intercepted=false;listeners.fetch({request:{method:'GET',url,mode:'cors'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 }
});
