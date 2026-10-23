const test=require('node:test'),assert=require('node:assert/strict');
require('../voice-parser.js');require('../voice-memory.js');require('../tasting.js');
const P=global.CellarVoiceParser,M=global.CellarVoiceMemory,T=global.CellarTasting;
const data=new Map();global.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
test('wine dictation fills current form fields and preserves vintage',()=>{
 const p=P.parse('William fever shablis 2022, rating four point seven five, price sixty dollars. Notes crisp and mineral.');
 assert.equal(p.fields.name,'William Fèvre Chablis 2022');assert.equal(p.fields.type,'White');assert.equal(p.fields.subtype,'Chablis');
 assert.equal(p.fields.rating,4.75);assert.equal(p.fields.price,60);assert.equal(p.fields.notes,'crisp and mineral.');
 assert.equal(p.fields.yearBought,undefined);
});
test('common number phrases do not corrupt bottle names',()=>{
 assert.equal(P.parse('Opus One 2018, $350, 4.5/5').fields.name,'Opus One 2018');
 for(const [spoken,n] of [['sixty',60],['six hundred and fifty',650],['one thousand two hundred',1200],['four point seven five',4.75],['four and a half',4.5],['four point seventy five',4.75]])assert.equal(P.numberValue(spoken),n);
 assert.equal(P.parse('Promontory Napa 2018 rating four and a half price one thousand dollars').fields.price,1000);
});
test('all common dictionary names and aliases resolve deterministically',()=>{
 for(const e of P.dictionary())for(const alias of e.aliases)assert.equal(P.normalize(alias).text,e.name,alias);
 assert.equal(P.normalize('Caymusette').text,'Caymusette');
 assert.equal(P.normalize('William Fèvre').text,'William Fèvre');
});
test('status, years, unknowns and conflicting styles require conservative review',()=>{
 assert.deepEqual(P.parse('Promontory 2018 in cellar bought in 2024').fields,{yearBought:2024,cellar:true,wantToTry:false,name:'Promontory 2018',type:'Red',subtype:'Red Blend'});
 assert.equal(P.parse('Chablis 2021 want to try rating five').fields.rating,undefined);
 assert.equal(P.parse('New unknown wine 2022').fields.type,undefined);
 assert.equal(P.parse('Chablis Chardonnay 2022').fields.subtype,'Chablis');
 assert.ok(P.parse('Chablis Pinot Noir').warnings.some(x=>x.includes('Several')));
 assert.equal(P.parse('Chardonnay 2022 price year 2025 price 60').fields.priceYear,2025);
});
test('teaching persists, overrides built-ins, merges safely and can be forgotten',()=>{
 M.clear();M.remember({phrase:'William fever',name:'William Fèvre',type:'White',subtype:'Chablis'});
 assert.equal(P.parse('William fever 2021',M.list()).fields.subtype,'Chablis');
 M.remember({phrase:'house bottle',name:'Promontory',type:'Red',subtype:'Red Blend'});
 assert.equal(P.parse('house bottle 2018',M.list()).fields.name,'Promontory 2018');
 const backup=JSON.parse(JSON.stringify(M.exportData()));M.clear();M.write(M.mergePlan(backup));assert.equal(M.list().length,2);
 const plan=M.mergePlan({version:1,entries:[{phrase:'house bottle',name:'Different',type:''}]});assert.equal(plan.find(e=>e.phrase==='house bottle').name,'Promontory');
 M.remember({phrase:'my red',name:'Promontory',type:'Red'},'house bottle');assert.equal(M.list().some(e=>e.phrase==='house bottle'),false);
 assert.throws(()=>M.validate({version:1,entries:[{phrase:'bad',name:'x',type:'Invalid'}]}));
 assert.throws(()=>M.validate({version:1,entries:[{phrase:'bad\nphrase',name:'x'}]}));
 const set=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota')};assert.throws(()=>M.remember({phrase:'another',name:'Bottle'}),/storage/);localStorage.setItem=set;
 M.forget('my red');assert.equal(M.list().length,1);M.clear();
});
test('tasting match respects exact years and does not conflate producers',()=>{
 assert.equal(T.match('William Fevre Chablis 2020','William Fèvre 2020 Les Clos Chablis').all,true);
 assert.equal(T.match('Promontory 2020','Promontory 2018 Napa Valley').vintageMismatch,true);
 assert.equal(T.match('Promontory 2020','Promontory Napa Valley').vintageMismatch,true);
 assert.equal(T.match('William Fevre','William Hill 2018 Chardonnay').all,false);
 assert.equal(T.rowCandidate({row_idx:1,row:{title:'Promontory 2018',description:'Plum and cedar'}},'train','Promontory 2020'),null);
});
test('two-line summary uses source descriptors, avoids negations and fabrications',()=>{
 const summary=T.summarize('Black cherry, cassis and cedar aromas. Full-bodied, firm tannins and a long finish.');
 assert.equal(summary.split('\n').length,2);assert.ok(summary.includes('black cherry'));assert.ok(summary.includes('firm tannins'));assert.ok(!summary.includes('citrus'));
 assert.ok(!T.summarize('Not sweet or oaky. Crisp lemon flavors.').includes('sweet'));
 assert.throws(()=>T.summarize('A family winery established in 1985.'));
 for(const bad of ['http://example.com','https://127.0.0.1','https://example.local','https://user:pass@example.com','javascript:alert(1)'])assert.throws(()=>T.sourceURL(bad));
});
test('voice fetch guard blocks uploads and personal inference requests',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const calls=[];const self={fetch:(...args)=>{calls.push(args);return Promise.resolve({ok:true});},postMessage:()=>{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../voice-worker.js'),'utf8'),{self,URL});
 assert.throws(()=>self.fetch('https://huggingface.co/model',{method:'POST',body:'audio'}),/blocked/);
 assert.throws(()=>self.fetch('https://example.com/transcribe'),/blocked/);
 self.fetch('https://huggingface.co/model');assert.equal(calls.length,1);assert.equal(calls[0][1].credentials,'omit');
});
