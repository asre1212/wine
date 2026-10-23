// Run with jsdom 26 installed in the test environment. No microphone/audio leaves this test.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,20));
async function setup(){
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{url:'https://asre1212.github.io/wine/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.confirm=()=>true;w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){w.lastDownload=this.download;};
 w.isSecureContext=true;
 w.fetch=async()=>{throw Error('Unexpected network');};
 for(const file of ['app.js','voice-parser.js','voice-memory.js','voice.js','tasting.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
 await tick();return {dom,w,$:id=>w.document.getElementById(id),form:w.document.getElementById('entryForm')};
}
function input(w,el,value){el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('voice draft, explicit teaching, save and reopen retain wine fields',async()=>{
 const {dom,w,$,form}=await setup();try{
 $('addBtn').click();$('voice-open').click();input(w,$('voice-text'),'William fever shablis 2022 rating four point seven five price sixty dollars notes crisp and mineral');$('voice-parse').click();
 assert.equal(form.elements.name.value,'William Fèvre Chablis 2022');assert.equal(form.elements.type.value,'White');assert.equal(form.elements.subtype.value,'Chablis');assert.equal(form.elements.price.value,'60');
 assert.equal(w.localStorage.getItem('cellar.bottles.v1'),null);
 input(w,form.elements.name,'My Fèvre Chablis 2022');$('voice-teach-current').click();input(w,$('voice-memory-phrase'),'my shablis');input(w,$('voice-memory-name'),'William Fèvre Chablis');
 $('voice-memory-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.CellarVoiceMemory.list().length,1);assert.equal(w.localStorage.getItem('cellar.bottles.v1'),null);
 input(w,$('voice-text'),'my shablis 2020 rated four and a half');$('voice-parse').click();assert.equal(form.elements.name.value,'William Fèvre Chablis 2020');assert.equal(form.elements.rating.value,'4.5');
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();const saved=JSON.parse(w.localStorage.getItem('cellar.bottles.v1'));assert.equal(saved.length,1);assert.equal(saved[0].subtype,'Chablis');assert.equal(saved[0].rating,4.5);assert.equal(saved[0].price,60);
 assert.equal($('voice-text').value,'');assert.equal($('voice-panel').hidden,true);
 }finally{dom.window.close();}
});
test('online result needs match confirmation and approval; save alone excludes suggestion',async()=>{
 const {dom,w,$,form}=await setup();try{
 $('addBtn').click();input(w,form.elements.name,'Promontory 2018');input(w,form.elements.notes,'My own note.');
 const requests=[];w.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({rows:[{row_idx:5,row:{title:'Promontory 2018 Napa Valley',description:'Black cherry, plum and cedar aromas. Firm tannins, full-bodied with a long finish.',taster_name:'Test reviewer'}},{row_idx:6,row:{title:'Promontory 2020 Napa Valley',description:'Citrus, crisp.'}}]})};};
 $('tasting-find').click();await tick();assert.equal($('tasting-results').children.length,1);assert.equal($('tasting-review').hidden,false);assert.equal($('tasting-approve').disabled,true);assert.equal(form.elements.notes.value,'My own note.');
 assert.equal(requests.length,3);assert.ok(requests.every(r=>r.options.method==='GET'&&r.options.credentials==='omit'&&!r.url.includes('My own note')));
 $('tasting-approve').click();assert.equal(form.elements.notes.value,'My own note.');
 $('tasting-confirm').checked=true;$('tasting-confirm').dispatchEvent(new w.Event('change'));$('tasting-approve').click();
 assert.ok(form.elements.notes.value.startsWith('My own note.\n\nFlavors:'));assert.equal(w.CellarTasting.approvedSources().length,1);assert.equal(w.localStorage.getItem('cellar.bottles.v1'),null);
 $('tasting-approve').click();assert.equal(w.CellarTasting.approvedSources().length,1);
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();const record=JSON.parse(w.localStorage.getItem('cellar.bottles.v1'))[0];assert.equal(record.tastingSources.length,1);assert.ok(record.tastingSources[0].url.startsWith('https://datasets-server.huggingface.co/rows'));
 }finally{dom.window.close();}
});
test('stale lookup, discarded draft and HTML injection do not write notes',async()=>{
 const {dom,w,$,form}=await setup();try{
 $('addBtn').click();input(w,form.elements.name,'Promontory 2018');
 const resolves=[];w.fetch=()=>new Promise(resolve=>resolves.push(resolve));$('tasting-find').click();input(w,form.elements.name,'William Fèvre Chablis 2022');
 for(const resolve of resolves)resolve({ok:true,json:async()=>({rows:[{row_idx:1,row:{title:'Promontory 2018',description:'Blackberry, cedar and firm tannins.'}}]})});await tick();assert.equal($('tasting-results').children.length,0);assert.equal(form.elements.notes.value,'');
 input(w,$('tasting-url'),'https://winery.example/bottle');input(w,$('tasting-paste'),'Lemon, apple and mineral. Crisp, balanced, long finish.');$('tasting-condense').click();assert.equal($('tasting-review').hidden,false);$('tasting-reject').click();assert.equal(form.elements.notes.value,'');
 $('tasting-condense').click();form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(JSON.parse(w.localStorage.getItem('cellar.bottles.v1'))[0].notes,'');
 $('addBtn').click();input(w,form.elements.name,'<img src=x onerror=alert(1)>');assert.equal(w.document.querySelector('#tasting-results img'),null);
 }finally{dom.window.close();}
});
test('microphone start/stop, transcription, permission failure and cancellation',async()=>{
 const {dom,w,$,form}=await setup();try{
 let stopped=0,permission=0,workerTerminated=0;
 Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{permission++;return {getTracks:()=>[{stop:()=>stopped++}]};}},configurable:true});
 w.MediaRecorder=class {constructor(){this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new w.Blob(['test'])});this.onstop();}};
 w.Blob.prototype.arrayBuffer=async()=>new ArrayBuffer(10);
 w.AudioContext=class{async decodeAudioData(){return {duration:1};}async close(){}};
 w.OfflineAudioContext=class{createBufferSource(){return {connect(){},start(){}};}async startRendering(){return {getChannelData:()=>new Float32Array(16000).fill(0.1)};}};
 w.Worker=class{postMessage(data){setTimeout(()=>this.onmessage({data:{id:data.id,text:'Promontory Napa 2018 rating four point five'}}),1);}terminate(){workerTerminated++;}};
 $('addBtn').click();$('voice-record').click();await tick();assert.equal($('voice-record').getAttribute('aria-pressed'),'true');assert.equal(permission,1);
 $('voice-record').click();await tick();assert.equal(stopped,1);assert.equal(form.elements.name.value,'Promontory Napa Valley 2018');assert.equal(form.elements.rating.value,'4.5');assert.equal($('voice-record').disabled,false);
 $('voice-record').click();await tick();$('voice-cancel').click();assert.equal(stopped,2);assert.equal($('voice-panel').hidden,true);assert.ok(workerTerminated>=1);
 w.navigator.mediaDevices.getUserMedia=async()=>{const e=new Error('Denied');e.name='NotAllowedError';throw e;};$('voice-record').click();await tick();assert.ok($('voice-status').textContent.includes('permission denied'));assert.equal($('voice-record').disabled,false);
 }finally{dom.window.close();}
});
test('backup includes corrections and approved sources; old imports preserve corrections',async()=>{
 const {dom,w,$,form}=await setup();try{
 w.CellarVoiceMemory.remember({phrase:'my bottle',name:'Promontory',type:'Red'});
 let blob;w.URL.createObjectURL=value=>{blob=value;return 'blob:test';};$('exportJsonBtn').click();const text=await new Promise(resolve=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});const backup=JSON.parse(text);assert.equal(backup.version,5);assert.equal(backup.voiceCorrections.entries[0].name,'Promontory');
 async function importData(obj){Object.defineProperty($('importInput'),'files',{value:[new w.File([JSON.stringify(obj)],'backup.json',{type:'application/json'})],configurable:true});$('importInput').dispatchEvent(new w.Event('change',{bubbles:true}));await tick();}
 await importData({bottles:[{id:'old',name:'Legacy wine',category:'wine'}]});assert.equal(w.CellarVoiceMemory.list().length,1);assert.equal(JSON.parse(w.localStorage.getItem('cellar.bottles.v1')).length,1);
 await importData({bottles:[{id:'bad',name:'Should not import'}],voiceCorrections:{version:1,entries:[{phrase:'x',name:'bad',type:'bad'}]}});assert.equal(JSON.parse(w.localStorage.getItem('cellar.bottles.v1')).length,1);
 }finally{dom.window.close();}
});
