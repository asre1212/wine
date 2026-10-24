/* Whisper runs locally in a worker. Network is restricted to GET model/runtime
   downloads; audio is only passed in memory, never to fetch or persistent storage. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let worker, pending, seq=0, recorder, stream, chunks=[], timer, canceled=false, generation=0;
const status=s=>$('voice-status').textContent=s;
let editingPhrase=null, lastParsed=null;

function call(op,audio){
 if(!worker){
  worker=new Worker(new URL('voice-worker.js?v=2.7.1', document.baseURI),{type:'module'});
  worker.onmessage=({data})=>{if(data.progress){status(data.progress);return;}if(pending&&data.id===pending.id){clearTimeout(pending.timeout);const p=pending;pending=null;data.error?p.reject(new Error(data.error)):p.resolve(data);}};
  worker.onerror=()=>abortWorker('Speech engine unavailable. Retry online, or type the entry.');
 }
 return new Promise((resolve,reject)=>{const id=++seq;pending={id,resolve,reject,timeout:setTimeout(()=>abortWorker('Speech engine timed out. Retry or type the entry.'),240000)};worker.postMessage({id,op,audio},audio?[audio.buffer]:[]);});
}
function abortWorker(message){if(worker)worker.terminate();worker=null;if(pending){clearTimeout(pending.timeout);pending.reject(new Error(message));pending=null;}}
function micState(state){
 const button=$('voice-record'),recording=state==='recording';
 const label=recording?'Stop voice recording':state==='busy'?'Processing voice entry':'Start voice recording';
 button.disabled=state==='busy';button.setAttribute('aria-pressed',String(recording));button.setAttribute('aria-label',label);button.title=label;
}
function controls(on){$('voice-load').disabled=on;$('voice-parse').disabled=on;$('voice-text').disabled=on;$('entryForm').querySelector('[type=submit]').disabled=on;micState(on?'busy':'idle');}
async function loadModel(){if(location.protocol==='file:'){status('Open the Safari or Home Screen web app to download and run local Whisper.');return;}const gen=generation;controls(true);status('Downloading speech files; first setup needs internet.');try{await call('load');if(gen===generation)status('Speech model ready on this device.');}catch(e){if(gen===generation)status(e.message);}finally{if(gen===generation)controls(false);}}
function release(){clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;}
function toggleRecording(){
 $('voice-panel').hidden=false;$('voice-record').setAttribute('aria-expanded','true');
 if(recorder?.state==='recording')stop();else start();
}
async function start(){
 if(!window.isSecureContext){status('Open the HTTPS app in Safari to use the microphone, or type below.');return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Microphone unavailable here. Type your entry below.');return;}
 controls(true);canceled=false;const gen=++generation;
 try{
  const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
  if(gen!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;
  chunks=[];const activeRecorder=new MediaRecorder(stream);recorder=activeRecorder;
  recorder.ondataavailable=e=>{if(gen===generation&&e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{if(gen!==generation)return;release();if(canceled){chunks=[];controls(false);return;}transcribe(activeRecorder.mimeType,gen);};
  recorder.onerror=()=>{if(gen!==generation)return;canceled=true;release();controls(false);status('Recording failed. Please retry.');};
  recorder.start();micState('recording');status('Recording locally… tap the microphone again to stop. Maximum 30 seconds.');timer=setTimeout(stop,30000);
 }catch(e){if(gen!==generation)return;release();controls(false);status(e.name==='NotAllowedError'?'Microphone permission denied. Allow it in Settings, or type the entry.':e.message);}
}
function stop(){if(recorder?.state==='recording'){micState('busy');recorder.stop();}}
async function transcribe(mimeType,gen){
 let ctx;
 try{
  status('Transcribing on your device…');
  const blob=new Blob(chunks,{type:mimeType});chunks=[];
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
  if(gen!==generation)return;
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const pcm=(await offline.startRendering()).getChannelData(0);
  if(gen!==generation)return;
  let energy=0;for(const x of pcm)energy+=x*x;
  if(Math.sqrt(energy/pcm.length)<0.002)throw new Error('No clear speech detected. Try again closer to the microphone.');
  const r=await call('transcribe',pcm);
  if(gen!==generation)return;
  $('voice-text').value=r.text.trim();
  parse();
 }catch(e){if(gen===generation)status(e.message);}finally{if(ctx)await ctx.close();if(gen===generation)controls(false);}
}
function parse(){
 const raw=$('voice-text').value;
 if(!raw.trim()){status('Speak or type one bottle first.');return;}
 lastParsed=CellarVoiceParser.parse(raw,CellarVoiceMemory.list());
 CellarVoiceApp.apply(lastParsed.fields);
 $('voice-teach-current').hidden=!lastParsed.spokenName;
 status([...lastParsed.corrections,...lastParsed.warnings,'Review the bottle fields below, then tap Save.'].join(' · '));
}
function showPanel(){ $('voice-panel').hidden=false;$('voice-record').setAttribute('aria-expanded','true'); }
function styles(current=''){
 const type=$('voice-memory-type').value,select=$('voice-memory-style');select.replaceChildren(new Option('No style mapping',''));
 for(const name of CellarVoiceApp.styles[type]||[])select.add(new Option(name,name));
 if(current&&![...select.options].some(o=>o.value===current))select.add(new Option(current,current));
 select.value=current;select.disabled=!type;
}
function resetMemory(){editingPhrase=null;$('voice-memory-form').reset();styles();$('voice-memory-save').textContent='Remember phrase';$('voice-memory-cancel').hidden=true;}
function editMemory(entry){
 showPanel();$('voice-memory').open=true;editingPhrase=entry.phrase;
 $('voice-memory-phrase').value=entry.phrase;$('voice-memory-name').value=entry.name;$('voice-memory-type').value=entry.type;styles(entry.subtype);
 $('voice-memory-save').textContent='Save correction';$('voice-memory-cancel').hidden=false;$('voice-memory-phrase').focus();
}
function renderMemory(){
 const entries=CellarVoiceMemory.list(),box=$('voice-memory-list');box.replaceChildren();
 $('voice-memory-count').textContent=`${CellarVoiceParser.dictionary().length} common phrases · ${entries.length} saved corrections`;
 $('voice-memory-clear').hidden=!entries.length&&!CellarVoiceMemory.problem();
 for(const entry of entries.sort((a,b)=>a.phrase.localeCompare(b.phrase))){
  const row=document.createElement('div');row.className='voice-dictionary-row';
  const title=document.createElement('strong');title.textContent=`${entry.phrase} → ${entry.name}`;
  const type=document.createElement('p');type.textContent=[entry.type,entry.subtype].filter(Boolean).join(' · ');
  const actions=document.createElement('div');actions.className='voice-actions';
  const edit=document.createElement('button');edit.type='button';edit.className='btn-ghost';edit.textContent='Edit';edit.onclick=()=>editMemory(entry);
  const forget=document.createElement('button');forget.type='button';forget.className='btn-ghost';forget.textContent='Forget';forget.setAttribute('aria-label',`Forget ${entry.phrase}`);
  forget.onclick=()=>{try{CellarVoiceMemory.forget(entry.phrase);if(editingPhrase===entry.phrase)resetMemory();$('voice-memory-status').textContent='Correction forgotten.';}catch(e){$('voice-memory-status').textContent=e.message;}};
  actions.append(edit,forget);row.append(title,type,actions);box.append(row);
 }
 const problem=CellarVoiceMemory.problem();if(problem)$('voice-memory-status').textContent=problem;
}
function renderDictionary(){
 const query=CellarVoiceParser.key($('voice-dictionary-search').value),box=$('voice-dictionary-list');box.replaceChildren();
 for(const item of CellarVoiceParser.dictionary().filter(e=>e.aliases.some(a=>a.includes(query)))){
  const row=document.createElement('div');row.className='voice-dictionary-row';
  const name=document.createElement('strong');name.textContent=item.name;
  const detail=document.createElement('p');detail.textContent=[item.type,item.subtype].filter(Boolean).join(' · ')||'Name / region spelling';
  row.append(name,detail);box.append(row);
 }
 if(!box.childNodes.length)box.textContent='No match. Teach your own phrase above.';
}
function cancel(clear=false){
 generation++;canceled=true;stop();release();chunks=[];abortWorker('Canceled.');controls(false);
 if(clear){$('voice-text').value='';lastParsed=null;$('voice-teach-current').hidden=true;}
 status('Stopped. Audio discarded.');
}
function hide(){cancel();$('voice-panel').hidden=true;$('voice-record').setAttribute('aria-expanded','false');}
function init(){
 $('voice-load').onclick=loadModel;$('voice-record').onclick=toggleRecording;$('voice-open').onclick=showPanel;
 $('voice-cancel').onclick=hide;$('voice-parse').onclick=parse;
 $('voice-text').oninput=()=>{$('voice-teach-current').hidden=true;lastParsed=null;};
 $('voice-memory-type').add(new Option('Spelling only',''));
 for(const type of CellarVoiceApp.types.wine)$('voice-memory-type').add(new Option(type,type));
 for(const item of CellarVoiceParser.dictionary())$('voice-names').append(new Option(item.name,item.name));
 $('voice-memory-type').onchange=()=>styles();$('voice-memory-cancel').onclick=resetMemory;
 $('voice-teach-current').onclick=()=>{
  if(!lastParsed)return;const form=$('entryForm');
  resetMemory();showPanel();$('voice-memory').open=true;
  $('voice-memory-phrase').value=lastParsed.spokenName.slice(0,120);$('voice-memory-name').value=form.elements.name.value;
  if(form.elements.category.value==='wine'){$('voice-memory-type').value=form.elements.type.value;styles(form.elements.subtype.value);}
  $('voice-memory-phrase').focus();$('voice-memory-status').textContent='Use just the recurring name or phrase; remove vintage/year if you want it to apply to other vintages.';
 };
 $('voice-memory-form').onsubmit=e=>{
  e.preventDefault();e.stopPropagation();
  try{CellarVoiceMemory.remember({phrase:$('voice-memory-phrase').value,name:$('voice-memory-name').value,type:$('voice-memory-type').value,subtype:$('voice-memory-style').value},editingPhrase);resetMemory();$('voice-memory-status').textContent='Remembered on this device. Tap Fill bottle fields to apply it to this entry.';}
  catch(error){$('voice-memory-status').textContent=error.message;}
 };
 $('voice-memory-clear').onclick=()=>{if(!confirm('Clear all taught voice phrases? Your bottles stay saved.'))return;try{CellarVoiceMemory.clear();resetMemory();$('voice-memory-status').textContent='Corrections cleared.';}catch(e){$('voice-memory-status').textContent=e.message;}};
 $('voice-dictionary').ontoggle=renderDictionary;$('voice-dictionary-search').oninput=renderDictionary;
 window.addEventListener('cellar-voice-memory',renderMemory);
 window.addEventListener('storage',e=>{if(e.key===CellarVoiceMemory.key||e.key===null)renderMemory();});
 window.addEventListener('cellar-entry-close',()=>{cancel(true);hide();});
 window.addEventListener('cellar-entry-reset',()=>{cancel(true);hide();resetMemory();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||pending||recorder?.state==='recording'))cancel();});
 window.addEventListener('pagehide',()=>cancel(true));resetMemory();renderMemory();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
