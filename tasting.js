/* Optional online lookup. Only the bottle name / supplied source URL leaves the device.
   Summaries remain drafts until explicit approval; nothing auto-saves a bottle. */
(function(root){
 'use strict';
 const DATASET='spawn99/wine-reviews';
 const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const stop=new Set(['the','a','of','from','wine','wines','domaine','domain','chateau','estate','winery','cellars','cellar','de','la','le','du','des','and','in','vintage']);
 function match(query,title){
  const tokens=[...new Set(key(query).split(' ').filter(t=>!stop.has(t)))],hay=new Set(key(title).split(' '));
  const year=String(query).match(/\b(?:19|20)\d{2}\b/),sourceYear=String(title).match(/\b(?:19|20)\d{2}\b/);
  const vintageMismatch=!!(year&&(!sourceYear||year[0]!==sourceYear[0]));
  const hits=tokens.filter(t=>hay.has(t)).length;
  return {score:tokens.length?hits/tokens.length:0,all:!!tokens.length&&hits===tokens.length&&!vintageMismatch,vintageMismatch,year:sourceYear?.[0]||''};
 }
 // Extract a small vocabulary of sensory descriptors, not copied review sentences.
 const flavors=['black currant','blackcurrant','red currant','cassis','blackberry','black cherry','red cherry','cherry','blueberry','raspberry','strawberry','plum','cranberry','pomegranate','apple','pear','peach','apricot','nectarine','lemon','lime','grapefruit','citrus','orange peel','pineapple','mango','lychee','melon','fig','raisin','violet','rose petal','floral','white flower','honeysuckle','honey','almond','hazelnut','walnut','brioche','toast','vanilla','cocoa','chocolate','coffee','tobacco','cedar','leather','earth','mushroom','truffle','black pepper','pepper','licorice','spice','herb','mint','eucalyptus','smoke','flint','chalk','mineral','saline'];
 const structures=[['full-bodied','full body'],['medium-bodied','medium body'],['light-bodied','light body'],['firm tannins','firm tannins'],['silky tannins','silky tannins'],['fine tannins','fine tannins'],['soft tannins','soft tannins'],['grippy','grippy texture'],['velvety','velvety texture'],['silky','silky texture'],['creamy','creamy texture'],['crisp','crisp'],['racy acidity','racy acidity'],['bright acidity','bright acidity'],['fresh acidity','fresh acidity'],['high acidity','high acidity'],['balanced','balanced'],['long finish','long finish'],['lingering','lingering finish'],['dry','dry'],['sweet','sweet']];
 function hasWord(s,w){return new RegExp('(^|[^a-z])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:s|ies)?(?=$|[^a-z])','i').test(s);}
 function summarize(text){
  // Skip negated clauses rather than converting "not fruity" into "fruity".
  const s=String(text||'').toLowerCase().split(/[.!?;\n]+/).filter(c=>!(/\b(?:not|no|without|lacks?|lacking|little)\b/.test(c))).join('. ');
  const picked=[];
  for(const word of flavors)if(hasWord(s,word)&&!picked.some(p=>p.includes(word)))picked.push(word);
  const texture=[];for(const [phrase,label] of structures)if(hasWord(s,phrase)&&!texture.some(p=>p.includes(label)))texture.push(label);
  if(!picked.length&&!texture.length)throw Error('No clear tasting descriptors found. Paste the tasting-note paragraph below.');
  return `Flavors: ${picked.slice(0,5).join(', ')||'not specified'}.\nStructure: ${texture.slice(0,3).join(', ')||'not specified in source'}.`;
 }
 function sourceURL(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.port||/^(?:\d|localhost|127\.|10\.|192\.168\.)/.test(u.hostname)||/\.(?:local|internal)$/.test(u.hostname))throw Error('Use an HTTPS link to a public winery or review page.');
  u.hash='';return u.href;
 }
 function rowCandidate(item,split,query){
  const row=item.row;if(!row||typeof row.title!=='string'||typeof row.description!=='string')return null;
  const identity=match(query,row.title);
  if(identity.score<0.45||identity.vintageMismatch)return null;
  const url=new URL('https://datasets-server.huggingface.co/rows');
  url.search=new URLSearchParams({dataset:DATASET,config:'default',split,offset:String(item.row_idx),length:'1'});
  return {title:row.title,text:row.description,url:url.href,source:'Wine review catalog · '+(row.taster_name||'reviewer not listed'),identity};
 }
 root.CellarTasting={key,match,summarize,sourceURL,rowCandidate};
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id);
 let controller,seq=0,selected=null,approved=[];
 const status=s=>$('tasting-status').textContent=s;
 function name(){return $('entryForm').elements.name.value.trim();}
 function invalidate(){
  seq++;if(controller)controller.abort();controller=null;selected=null;
  $('tasting-review').hidden=true;$('tasting-results').replaceChildren();$('tasting-approve').disabled=true;
  $('tasting-find').disabled=false;$('tasting-fetch').disabled=false;
 }
 function reset(){invalidate();approved=[];$('tasting-url').value='';$('tasting-paste').value='';$('tasting-status').textContent='';$('tasting-tools').open=false;}
 async function getJSON(url,signal){
  const response=await fetch(url,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',headers:{Accept:'application/json'},signal});
  if(!response.ok)throw Error(response.status===429?'Lookup is busy. Try again shortly, or paste source notes.':`Source unavailable (${response.status}). Try a source link or paste its tasting notes.`);
  const data=await response.json();return data;
 }
 function begin(){invalidate();controller=new AbortController();const current=seq,signal=controller.signal;const ownController=controller,timer=setTimeout(()=>ownController.abort(),35000);$('tasting-find').disabled=true;$('tasting-fetch').disabled=true;return {current,signal,timer,query:name()};}
 function finish(job){clearTimeout(job.timer);if(job.current===seq){$('tasting-find').disabled=false;$('tasting-fetch').disabled=false;}}
 function show(candidate,query){
  if(name()!==query){invalidate();status('Bottle name changed. Search again.');return;}
  let summary;try{summary=summarize(candidate.text);}catch(e){status(e.message);return;}
  selected={...candidate,query};$('tasting-review').hidden=false;$('tasting-summary').value=summary;
  $('tasting-title').textContent=candidate.title;$('tasting-source').href=candidate.url;$('tasting-source').textContent=candidate.source;
  $('tasting-confirm').checked=false;$('tasting-approve').disabled=true;
  $('tasting-match').textContent=candidate.identity?.all?'Name terms match. Verify cuvée and vintage before approval.':'Possible match. Check the exact producer, cuvée and vintage against the source.';
 }
 async function search(){
  if(name().length<3){status('Enter a producer and wine name first; include vintage if known.');return;}
  const job=begin();status('Searching online tasting reviews…');
  try{
   const responses=await Promise.allSettled(['train','validation','test'].map(async split=>{
    const url=new URL('https://datasets-server.huggingface.co/search');url.search=new URLSearchParams({dataset:DATASET,config:'default',split,query:job.query,length:'30'});
    const data=await getJSON(url.href,job.signal);return (data.rows||[]).map(row=>rowCandidate(row,split,job.query)).filter(Boolean);
   }));
   if(job.current!==seq||name()!==job.query)return;
   const found=new Map();for(const r of responses)if(r.status==='fulfilled')for(const c of r.value)if(!found.has(c.title))found.set(c.title,c);
   const candidates=[...found.values()].sort((a,b)=>b.identity.score-a.identity.score).slice(0,8);
   const box=$('tasting-results');box.replaceChildren();
   for(const c of candidates){const button=document.createElement('button');button.type='button';button.className='tasting-result';button.textContent=c.title;button.onclick=()=>show(c,job.query);box.append(button);}
   if(!candidates.length){status(responses.every(r=>r.status==='rejected')?'Online catalog is unavailable. Try a winery/review link below, or paste its tasting notes.':'No matching bottle/vintage in this historical review catalog. Try a winery/review link below.');$('tasting-tools').open=true;}
   else {status('Choose the exact bottle below. Older catalog reviews may not cover recent vintages.');if(candidates.length===1&&candidates[0].identity.all)show(candidates[0],job.query);}
  }catch(e){if(job.current===seq)status(e.name==='AbortError'?'Lookup timed out. Try again or paste source notes.':e.message);}finally{finish(job);}
 }
 async function fromLink(){
  let url;try{url=sourceURL($('tasting-url').value);}catch(e){status(e.message);return;}
  if(name().length<3){status('Enter the bottle name first.');return;}
  const job=begin();status('Reading source tasting notes…');
  try{
   const response=await getJSON('https://r.jina.ai/'+url,job.signal),data=response.data||response;
   if(job.current!==seq)return;
   const title=String(data.title||''),text=String(data.content||'');
   if(!title||!text)throw Error('This page could not be read. Paste its tasting-note paragraph below.');
   const identity=match(job.query,title);
   if(!identity.all)throw Error('The page title does not match this bottle and vintage. Use a specific bottle page, or paste its tasting notes and verify the source.');
   // Prefer the tasting-notes section; never summarize an entire product listing.
   const lines=text.split('\n'),start=lines.findIndex(l=>/^#{1,6}\s+.*(?:tasting|winemaker.*notes|wine description)/i.test(l));
   let passage='';if(start>=0){for(let i=start+1;i<lines.length;i++){if(/^#{1,6}\s+/.test(lines[i])&&passage.trim())break;passage+=lines[i]+'\n';if(passage.length>1800)break;}}
   if(!passage.trim())throw Error('No distinct tasting-note section found. Paste the tasting paragraph below for a reliable summary.');
   show({title,text:passage.slice(0,1800),url,source:new URL(url).hostname,identity},job.query);status('Review the two-line suggestion and source before approving.');
  }catch(e){if(job.current===seq)status(e.name==='AbortError'?'Source timed out. Paste its tasting notes below.':e.message);}finally{finish(job);}
 }
 function pasted(){
  let url;try{url=sourceURL($('tasting-url').value);}catch(e){status('Add the source page link so the notes stay attributed.');return;}
  const query=name(),text=$('tasting-paste').value.trim();if(!query||!text){status('Enter the bottle name and paste the source tasting notes.');return;}
  invalidate();show({title:query+' · pasted source',text,url,source:new URL(url).hostname,identity:{all:false}},query);status('Verify that the pasted notes describe this exact bottle and vintage.');
 }
 function approve(){
  if(!selected||!$('tasting-confirm').checked||name()!==selected.query){invalidate();return;}
  const lines=$('tasting-summary').value.trim().split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(lines.length!==2||lines.some(s=>s.length>180)){status('Keep the summary to two short lines (up to 180 characters each).');return;}
  const text=lines.join('\n'),field=$('entryForm').elements.notes;
  const source={title:selected.title,url:selected.url,summary:text,approvedAt:new Date().toISOString()};
  if(approved.some(s=>s.url===source.url&&s.summary===text)){status('Already added to this draft.');return;}
  const next=[field.value.trim(),text].filter(Boolean).join('\n\n');
  if(next.length>field.maxLength){status('Notes are full. Shorten them before adding this summary.');return;}
  field.value=next;approved.push(source);const box=$('tasting-saved-sources'),p=document.createElement('p'),a=document.createElement('a');a.href=source.url;a.textContent='Notes source: '+source.title;a.target='_blank';a.rel='noopener noreferrer';p.append(a);box.append(p);$('tasting-review').hidden=true;selected=null;status('Approved and added to Notes. Tap Save to log the bottle.');
 }
 function init(){
  $('tasting-find').onclick=search;$('tasting-fetch').onclick=fromLink;$('tasting-condense').onclick=pasted;$('tasting-approve').onclick=approve;
  $('tasting-confirm').onchange=()=>{$('tasting-approve').disabled=!$('tasting-confirm').checked;};
  $('tasting-reject').onclick=()=>{selected=null;$('tasting-review').hidden=true;status('Suggestion discarded. Notes unchanged.');};
  $('entryForm').elements.name.addEventListener('input',()=>{invalidate();status('Name changed. Search again when ready.');});
  window.addEventListener('cellar-draft-changed',()=>{invalidate();status('Bottle fields updated. Find tasting notes when ready.');});
  window.addEventListener('cellar-entry-reset',reset);window.addEventListener('cellar-entry-close',reset);
  window.addEventListener('pagehide',invalidate);
  root.CellarTasting.approvedSources=()=>approved.filter(s=>$('entryForm').elements.notes.value.includes(s.summary));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window==='undefined'?globalThis:window);
