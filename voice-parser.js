/* Local text interpretation. Built-in aliases supplement, never train, Whisper. */
(function (root) {
  'use strict';
  const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // A producer can make many styles: only unambiguous wine/appellation cues carry a type.
  const entries = [
    ['Promontory', 'promontary|promontori|promon tory', 'Red', 'Red Blend'],
    ['Penultimate', 'pen ultimate'], ['Harlan Estate', 'harlan estates|harlen estate'],
    ['Opus One', 'opus won|opus 1'], ['Dominus', 'dominus estate'], ['Screaming Eagle', 'screaming eagles'],
    ['Scarecrow', 'scare crow'], ['Schrader', 'schraeder'], ['Schramsberg', 'schrams burg'],
    ['Stag’s Leap Wine Cellars', 'stags leap wine cellars|stag s leap wine cellars'],
    ['Stags’ Leap Winery', 'stags leap winery'], ['Caymus', 'cay mas'],
    ['Shafer', 'shaffer'], ['Joseph Phelps', 'josef phelps'], ['Insignia', ''],
    ['Far Niente', 'far niente|far ne ente'], ['Nickel & Nickel', 'nickel and nickel'],
    ['Silver Oak', 'silver oak cellars'], ['Duckhorn', 'duck horn'], ['Rombauer', 'rom bauer'],
    ['Mayacamas', 'maya camas'], ['Heitz Cellar', 'heitz cellars|heights cellar'], ['Spottswoode', 'spots wood'],
    ['Chateau Montelena', 'chateau montelina'], ['Quintessa', 'quintesa'], ['BOND', ''],
    ['William Fèvre', 'william fevre|william fever|william fev|william fevra|william fev re|william favre'],
    ['François Raveneau', 'francois raveneau|francois raveno'], ['Raveneau', 'raveno'],
    ['Vincent Dauvissat', 'vincent dauvissat|vincent dovissat'], ['Dauvissat', 'dovissat'],
    ['Louis Michel', 'louis michel'], ['La Chablisienne', 'la chablisienne'],
    ['Louis Jadot', 'louis jado'], ['Joseph Drouhin', 'joseph droin'], ['Louis Latour', 'louis la tour'],
    ['Domaine Leflaive', 'domaine leflaive|domain leflave'], ['Olivier Leflaive', 'olivier leflaive'],
    ['Domaine de la Romanée-Conti', 'domaine de la romanee conti|domain romanee conti|drc'],
    ['Dujac', 'du jac'], ['Armand Rousseau', 'armand rousseau'], ['Comte Georges de Vogüé', 'comte georges de vogue'],
    ['Château Margaux', 'chateau margaux|chateau margo'], ['Château Lafite Rothschild', 'chateau lafite rothschild'],
    ['Château Mouton Rothschild', 'chateau mouton rothschild'], ['Château Latour', 'chateau la tour'],
    ['Château Haut-Brion', 'chateau haut brion|chateau o brion'], ['Pétrus', 'petrus'],
    ['Château Cheval Blanc', 'chateau cheval blanc'], ['Château d’Yquem', 'chateau dyquem|chateau d yquem'],
    ['E. Guigal', 'e guigal|guigal'], ['Château de Beaucastel', 'chateau de beaucastel'],
    ['Château Rayas', 'chateau rayas'], ['Domaine Tempier', 'domaine tempier'],
    ['Domaine Huet', 'domaine huet'], ['Didier Dagueneau', 'didier dagueneau'],
    ['Trimbach', ''], ['Hugel', ''], ['Krug', ''], ['Bollinger', ''],
    ['Dom Pérignon', 'dom perignon|dom perinyon'], ['Louis Roederer', 'louis roederer'],
    ['Veuve Clicquot', 'veuve clicquot|veuve cliquot|veuve clicko'], ['Billecart-Salmon', 'billecart salmon'],
    ['Napa Valley', 'napa|nappa|nappa valley'], ['Oakville', 'oak ville'], ['Rutherford', ''],
    ['Yountville', 'yount ville'], ['St. Helena', 'saint helena|st helena'], ['Calistoga', ''],
    ['Howell Mountain', 'howell mountain'], ['Mount Veeder', 'mount veeder|mount veder'],
    ['Spring Mountain', 'spring mountain'], ['Diamond Mountain', 'diamond mountain'],
    ['Carneros', 'los carneros'], ['Sonoma', ''], ['France', 'french wine'],
    ['Burgundy', 'bourgogne'], ['Bordeaux', 'bordo'], ['Chablis', 'shablis|shablee|sha blee|chablee', 'White', 'Chablis'],
    ['Petit Chablis', 'petit shablis|petite chablis', 'White', 'Chablis'],
    ['Meursault', 'mersault|mer so', 'White', 'White Burgundy'],
    ['Puligny-Montrachet', 'puligny montrachet|pulini mon trashay', 'White', 'White Burgundy'],
    ['Chassagne-Montrachet', 'chassagne montrachet|shasagne montrachet'],
    ['Gevrey-Chambertin', 'gevrey chambertin'], ['Vosne-Romanée', 'vosne romanee|vone romanee'],
    ['Chambolle-Musigny', 'chambolle musigny'], ['Nuits-Saint-Georges', 'nuits saint georges'],
    ['Pommard', ''], ['Volnay', ''], ['Côte de Beaune', 'cote de beaune'], ['Côte de Nuits', 'cote de nuits'],
    ['Pauillac', 'poyac'], ['Saint-Émilion', 'saint emilion|st emilion'], ['Pomerol', ''],
    ['Saint-Julien', 'saint julien|st julien'], ['Saint-Estèphe', 'saint estephe|st estephe'],
    ['Pessac-Léognan', 'pessac leognan'], ['Rhône', 'rhone'], ['Côte-Rôtie', 'cote rotie'],
    ['Châteauneuf-du-Pape', 'chateauneuf du pape|chateau neuf du pape'],
    ['Hermitage', ''], ['Loire Valley', 'loire|loire valley'], ['Sancerre', 'san serre'],
    ['Pouilly-Fumé', 'pouilly fume'], ['Pouilly-Fuissé', 'pouilly fuisse', 'White', 'White Burgundy'],
    ['Vouvray', ''], ['Alsace', ''], ['Provence', ''], ['Beaujolais', 'bo jo lay'],
    ['Champagne', 'shampagne', 'Sparkling', 'Champagne'], ['Premier Cru', 'premier crew|premiere cru|1er cru'],
    ['Grand Cru', 'grand crew'], ['Les Clos', 'les clos'], ['Bougros', ''], ['Les Preuses', ''],
    ['Vaulorent', ''], ['Montée de Tonnerre', 'montee de tonnerre'], ['Vaillons', ''], ['Montmains', ''],
    ['Cabernet Sauvignon', 'cabernet savignon|cabernet sovignon|cab sauv|cab sav', 'Red', 'Cabernet Sauvignon'],
    ['Cabernet Franc', 'cab franc', 'Red'], ['Pinot Noir', 'pinot noar|pino noir', 'Red', 'Pinot Noir'],
    ['Merlot', 'merlo', 'Red', 'Merlot'], ['Syrah', 'shiraz', 'Red', 'Syrah / Shiraz'],
    ['Zinfandel', 'zin', 'Red', 'Zinfandel'], ['Malbec', '', 'Red', 'Malbec'],
    ['Chardonnay', 'chardonay|shardonnay', 'White', 'Chardonnay'],
    ['Sauvignon Blanc', 'sauvignon blank|savignon blanc', 'White', 'Sauvignon Blanc'],
    ['Chenin Blanc', 'chenin blank', 'White', 'Chenin Blanc'], ['Riesling', 'reesling', 'White', 'Riesling'],
    ['Pinot Gris', 'pinot grigio', 'White', 'Pinot Grigio / Pinot Gris'],
    ['Viognier', 'vee oh nyay', 'White', 'Viognier'], ['Sauternes', '', 'Dessert', 'Sauternes'],
    ['White Burgundy', '', 'White', 'White Burgundy'], ['Red Burgundy', '', 'Red', 'Pinot Noir'],
    ['Bordeaux Blend', '', 'Red', 'Bordeaux Blend'], ['Red Blend', '', 'Red', 'Red Blend'],
    ['Provence Rosé', 'provence rose', 'Rosé', 'Provence Rosé'], ['Rosé', 'rose wine', 'Rosé'],
    ['Red wine', '', 'Red'], ['White wine', '', 'White'], ['Sparkling wine', '', 'Sparkling']
  ].map(([name, aliases = '', type = '', subtype = '']) => ({name, aliases: [...new Set([name, ...aliases.split('|').filter(Boolean)].map(key))], type, subtype}));

  function dictionary() { return entries.map(e => ({...e, aliases: [...e.aliases]})); }
  function normalize(text, memories = []) {
    const source = String(text || '');
    // Preserve original positions while folding accents; match whole token sequences.
    const tokens = [...source.matchAll(/[\p{L}\p{N}]+/gu)].map(m => ({start:m.index,end:m.index+m[0].length,value:key(m[0])}));
    const aliases = new Map();
    for (const entry of entries) for (const alias of entry.aliases) aliases.set(alias, entry);
    for (const item of memories) aliases.set(key(item.phrase), {...item, name:item.name, personal:true});
    const options = [...aliases].map(([alias, entry]) => ({parts:alias.split(' '),entry})).sort((a,b) => b.parts.length-a.parts.length);
    const matches = [], corrections = []; let output='', end=0;
    for (let i=0;i<tokens.length;) {
      const found=options.find(o=>o.parts.every((p,j)=>tokens[i+j]?.value===p));
      if (!found) {i++;continue;}
      const last=tokens[i+found.parts.length-1], original=source.slice(tokens[i].start,last.end);
      output+=source.slice(end,tokens[i].start)+found.entry.name;
      if (original!==found.entry.name) corrections.push(`${original} → ${found.entry.name}`);
      matches.push(found.entry);end=last.end;i+=found.parts.length;
    }
    return {text:output+source.slice(end),matches,corrections:[...new Set(corrections)]};
  }
  const small={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
  function numberValue(value) {
    let s=String(value).toLowerCase().trim().replace(/,/g,'').replace(/\b(?:for|fore)\b/g,'four');
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    if (/\band a (?:half|quarter)\b/.test(s)) return numberValue(s.split(/\band a\b/)[0])+(/half/.test(s)?0.5:0.25);
    if (/\bpoint\b/.test(s)) {
      const parts=s.split(/\bpoint\b/), fraction=parts[1].trim().split(/[ -]+/);
      const digits=fraction.every(w=>/^\d$/.test(w)||small[w]<10)?fraction.map(w=>small[w]??w).join(''):String(numberValue(parts[1]));
      return Number(`${numberValue(parts[0])}.${digits}`);
    }
    const words=s.split(/[ -]+/).filter(w=>w!=='and');
    if (!words.length||words.some(w=>small[w]===undefined&&!['hundred','thousand'].includes(w))) return NaN;
    let total=0,n=0;
    for (const w of words) {if(w==='thousand'){total+=(n||1)*1000;n=0;}else if(w==='hundred')n=(n||1)*100;else n+=small[w];}
    return total+n;
  }
  const numeric='(?:\\d+(?:[.,]\\d+)*|(?:'+Object.keys(small).sort((a,b)=>b.length-a.length).join('|')+'|for|fore|hundred|thousand|point|and|a|half|quarter)(?:[ -]+(?:'+Object.keys(small).sort((a,b)=>b.length-a.length).join('|')+'|hundred|thousand|point|and|a|half|quarter))*)';
  function parse(text, memories = []) {
    const original=String(text||'').trim(), result={}, warnings=[];
    if(!original) return {fields:{},warnings:['Say one bottle at a time.'],corrections:[],spokenName:''};
    // Notes stay literal, except explicit taught/built-in spelling corrections.
    const note=original.match(/\b(?:notes?|tasting notes?)\s*[:,-]?\s+([\s\S]*)/i);
    let body=note?original.slice(0,note.index):original;
    body=body.replace(/\b(\d+)\s+point\s+(\d+)\b/gi, '$1.$2');
    if(note)result.notes=normalize(note[1].trim(),memories).text;
    function take(regex,field,min,max) {
      body=body.replace(regex,(whole,value)=>{const n=numberValue(value);if(Number.isFinite(n)&&n>=min&&n<=max)result[field]=n;else warnings.push(`Review ${field}: ${value}`);return ' ';});
    }
    take(new RegExp('\\b(?:rating|rated|rate(?: it)?)\\s*[:,-]?\\s*('+numeric+')(?:\\s*(?:out of|/)\\s*(?:5|five))?','gi'),'rating',0,5);
    take(new RegExp('('+numeric+')\\s*(?:out of|/)\\s*(?:5|five)\\b','gi'),'rating',0,5);
    take(new RegExp('\\b(?:price|costs?|paid)\\s*[:,-]?\\s*\\$?\\s*('+numeric+')(?:\\s*dollars?)?','gi'),'price',0,1000000);
    take(new RegExp('\\$\\s*('+numeric+')|(?!)','gi'),'price',0,1000000);
    take(new RegExp('('+numeric+')\\s+dollars?\\b','gi'),'price',0,1000000);
    for(const [label,field] of [['(?:bought|purchased)(?: in)?','yearBought'],['(?:tasted|drank)(?: in)?','yearDrank'],['price year','priceYear']]) {
      take(new RegExp('\\b'+label+'\\s*[:,-]?\\s*((?:19|20)\\d{2})\\b','gi'),field,1900,2100);
    }
    if(/\b(?:want to try|wish ?list)\b/i.test(body)) {result.wantToTry=true;result.cellar=false;body=body.replace(/\b(?:want to try|wish ?list)\b/gi,' ');}
    else if(/\b(?:in (?:my |the )?cellar|untasted|not tasted)\b/i.test(body)){result.cellar=true;result.wantToTry=false;body=body.replace(/\b(?:in (?:my |the )?cellar|untasted|not tasted)\b/gi,' ');}
    else if(result.rating!==undefined||result.yearDrank!==undefined){result.cellar=false;result.wantToTry=false;}
    if((result.cellar||result.wantToTry)&&result.rating!==undefined){delete result.rating;warnings.push('Untasted/wishlist bottle: rating left blank.');}
    body=body.replace(/^\s*(?:add(?: a bottle of)?|wine(?: name)?(?: is)?|name(?: is)?)\s*[:,-]?\s+/i,'').replace(/\bvintage\s*[:,-]?\s*/gi,'').replace(/(?:,\s*)+/g,', ').replace(/\s+/g,' ').replace(/^[\s,;:.—-]+|[\s,;:.—-]+$/g,'');
    // A sentence after the name is treated as free tasting notes when no label is used.
    const sentence=body.search(/\.(?=\s+[A-Za-z])/);
    if(sentence>=0&&!/\b(?:St|E)$/i.test(body.slice(0,sentence))){if(!result.notes)result.notes=body.slice(sentence+1).trim();body=body.slice(0,sentence);}
    const normalized=normalize(body,memories),name=normalized.text.trim();
    if(name)result.name=name;
    const typed=normalized.matches.filter(m=>m.type);
    const personal=typed.filter(m=>m.personal);
    const candidates=personal.length?personal:typed;
    const types=[...new Set(candidates.map(m=>m.type))];
    if(types.length===1){result.type=types[0];const styles=[...new Set(candidates.filter(m=>m.subtype).map(m=>m.subtype))];
      // Chablis is a selectable style in this app, more specific than Chardonnay.
      if(styles.includes('Chablis')&&styles.every(s=>['Chablis','Chardonnay'].includes(s)))result.subtype='Chablis';
      else if(styles.length===1)result.subtype=styles[0];else if(styles.length>1)warnings.push('Several styles mentioned; choose the style.');
    }else if(types.length>1)warnings.push('Several wine types mentioned; choose the type.');
    else if(name)warnings.push('Choose the wine type/style if not already set.');
    if(!name)warnings.push('Enter the bottle name.');
    if(name.length>120)warnings.push('Shorten the bottle name to 120 characters.');
    return {fields:result,corrections:normalized.corrections,warnings,spokenName:body};
  }
  root.CellarVoiceParser={key,dictionary,normalize,numberValue,parse};
})(typeof window==='undefined'?globalThis:window);
