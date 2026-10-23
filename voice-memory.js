/* Only explicitly taught phrases persist. Recordings and raw transcripts do not. */
(function(root){
  'use strict';
  const STORAGE_KEY='cellar.voiceCorrections.v1',LIMIT=500;
  const key=s=>root.CellarVoiceParser.key(s);
  function clean(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Invalid voice correction.');
    const result={};
    for(const field of ['phrase','name']){
      if(typeof item[field]!=='string'||!key(item[field])||item[field].length>120||/[\r\n\u0000-\u001f]/.test(item[field]))throw Error('Use a short name or phrase (up to 120 characters).');
      result[field]=item[field].trim().replace(/\s+/g,' ');
    }
    result.type=item.type||'';result.subtype=item.subtype||'';
    if(!['','Red','White','Rosé','Sparkling','Dessert','Fortified','Orange','Other'].includes(result.type)||typeof result.subtype!=='string'||result.subtype.length>80||/[\r\n\u0000-\u001f]/.test(result.subtype))throw Error('Choose a valid wine type and style.');
    if(!result.type)result.subtype='';
    return result;
  }
  function validate(data){
    if(!data||data.version!==1||!Array.isArray(data.entries)||data.entries.length>LIMIT)throw Error('Invalid voice corrections backup.');
    const map=new Map();for(const item of data.entries){const e=clean(item);map.set(key(e.phrase),e);}return [...map.values()];
  }
  function read(){const raw=root.localStorage.getItem(STORAGE_KEY);return raw?validate(JSON.parse(raw)):[];}
  function list(){try{return read();}catch(_){return [];}}
  function problem(){try{read();return '';}catch(_){return 'Saved corrections could not be read. Export your data if possible, then clear corrections or restore a valid backup.';}}
  function write(entries){
    if(entries.length>LIMIT)throw Error('Memory is full. Forget an unused correction first.');
    try{root.localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,entries}));}catch(_){throw Error('Could not save corrections. Check device storage.');}
    if(root.dispatchEvent)root.dispatchEvent(new CustomEvent('cellar-voice-memory'));
  }
  function remember(item,previous){const e=clean(item);write([...read().filter(x=>![key(e.phrase),key(previous)].includes(key(x.phrase))),e]);}
  function mergePlan(data){const incoming=validate(data),existing=read(),map=new Map(existing.map(e=>[key(e.phrase),e]));for(const e of incoming)if(!map.has(key(e.phrase)))map.set(key(e.phrase),e);if(map.size>LIMIT)throw Error('Too many voice corrections.');return [...map.values()];}
  root.CellarVoiceMemory={key:STORAGE_KEY,list,problem,remember,validate,mergePlan,write,exportData:()=>({version:1,entries:read()}),forget:phrase=>write(read().filter(e=>key(e.phrase)!==key(phrase))),clear:()=>write([])};
})(typeof window==='undefined'?globalThis:window);
