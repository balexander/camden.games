// Pure game logic: math facts, vocabulary cards, mnemonics, spaced repetition. No DOM, so test/dash.test.mjs can run it.
// Loaded as a classic script after words.js (which defines WORDS) so the app also works opened straight from a file.
var Core=(()=>{
const HOUR=36e5,DAY=864e5;
// Leitner boxes. Box 1 comes back within the round; a fact is "strong" from box 4.
const INTERVALS=[0,0,8*HOUR,2*DAY,5*DAY,12*DAY,30*DAY],MAXBOX=6,STRONG=4;
const OPS={add:{sym:'+',name:'Add'},sub:{sym:'−',name:'Subtract'},mul:{sym:'×',name:'Multiply'},div:{sym:'÷',name:'Divide'}};

function addRank(s,b){const sum=s+b;
  if(s===1)return 1;if(s===2)return 2;if(s===b&&b<=5)return 3;if(sum===10)return 4;if(b===10)return 5;
  if(sum<10)return 6;if(s===b&&b<=10)return 7;if(b-s===1&&b<10)return 8;if(b===9)return 9;if(b<10)return 10;if(sum<=20)return 11;return 12;}
function mulRank(s,b){if(s===1)return 1;if(s===2)return 2;if(b===10)return 3;if(s===5||b===5)return 4;if(s===b)return 5;if(s===3)return 6;if(s===4)return 7;if(b===9)return 8;return 9;}
const cache={};
function facts(op,stretch){
  const id=op+(stretch?'+':'');if(cache[id])return cache[id];const out=[];
  if(op==='add')for(let a=1;a<=20;a++)for(let b=a;b<=20;b++){if(!stretch&&a+b>20)continue;out.push({key:`add:${a}+${b}`,op,a,b,ans:a+b,rank:addRank(a,b),size:a+b});}
  if(op==='sub')for(let a=1;a<=20;a++)for(let b=1;b<=20;b++){const c=a+b;if(!stretch&&c>20)continue;out.push({key:`sub:${c}-${a}`,op,a:c,b:a,ans:b,rank:addRank(Math.min(a,b),Math.max(a,b))+.5,size:c});}
  if(op==='mul')for(let a=1;a<=10;a++)for(let b=a;b<=10;b++)out.push({key:`mul:${a}x${b}`,op,a,b,ans:a*b,rank:mulRank(a,b),size:a*b});
  if(op==='div')for(let a=1;a<=10;a++)for(let b=1;b<=10;b++)out.push({key:`div:${a*b}/${a}`,op,a:a*b,b:a,ans:b,rank:mulRank(Math.min(a,b),Math.max(a,b))+.5,size:a*b});
  out.sort((x,y)=>x.rank-y.rank||x.size-y.size);return cache[id]=out;
}
const MODES={
  add:{subject:'math',sym:'+',name:'Add'},sub:{subject:'math',sym:'−',name:'Subtract'},mul:{subject:'math',sym:'×',name:'Multiply'},div:{subject:'math',sym:'÷',name:'Divide'},
  mix:{subject:'math',sym:'★',name:'Mix it up',of:['add','sub','mul','div']},
  v1:{subject:'words',sym:'1',name:'Starter words'},v2:{subject:'words',sym:'2',name:'Stretch words'},v3:{subject:'words',sym:'3',name:'Power words'},
  mine:{subject:'words',sym:'✎',name:'My words'},vmix:{subject:'words',sym:'★',name:'All my words',of:['v1','v2','v3','mine']}
};
// Vocabulary cards. Built-in words are keyed by the word, a grown-up's own words by their id.
function vocab(mode,custom){
  if(mode==='mine')return (custom||[]).map((c,i)=>({key:'my:'+c.id,kind:'vocab',op:'mine',w:c.w,pos:'',def:c.def,ex:'',cue:'',pic:c.hook||'',ans:c.def,rank:i,size:0}));
  const level=+mode.slice(1),id='v'+level;if(cache[id])return cache[id];
  const list=typeof WORDS==='undefined'?[]:WORDS[level]||[];
  return cache[id]=list.map(([w,pos,def,ex,cue,pic],i)=>({key:'w:'+w,kind:'vocab',op:mode,w,pos,def,ex,cue,pic,ans:def,rank:level*1000+i,size:0}));
}
// One mode's full deck. opts = {stretch, custom, range}.
// range narrows adding and subtracting by the biggest number on the card: 'low' is up to 10, 'high' is above 10.
function items(mode,opts={}){
  if(!OPS[mode])return vocab(mode,opts.custom);
  const all=facts(mode,opts.stretch),r=opts.range;if((mode!=='add'&&mode!=='sub')||(r!=='low'&&r!=='high'))return all;
  const id=mode+(opts.stretch?'+':'')+r;return cache[id]||(cache[id]=all.filter(f=>r==='low'?f.size<=10:f.size>10));
}
// A mix only uses decks the player has already started, so it never springs division on a beginner.
function deck(mode,opts={},cards={}){
  const of=MODES[mode].of;if(!of)return items(mode,opts);
  let on=of.filter(m=>items(m,opts).some(f=>cards[f.key]?.n));if(!on.length)on=[of[0]];
  return on.flatMap(m=>items(m,opts)).sort((x,y)=>x.rank-y.rank||x.size-y.size);
}
// Three meanings to pick from when the player answers alone: the right one plus two from the same kind of word.
function choices(f,pool,rnd=Math.random){
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const others=shuffle(pool.filter(x=>x.key!==f.key&&x.def!==f.def)),same=others.filter(x=>x.pos===f.pos);
  const wrong=[...new Set([...same,...others].map(x=>x.def))].slice(0,2);
  return shuffle([f.def,...wrong]);
}

const DOUBLES={1:'two eyes 👀',2:'the wheels on a car 🚗',3:'a bug with 3 legs on each side 🐞',4:'a spider with 4 legs on each side 🕷️',5:'the fingers on two hands 🖐️🖐️',6:'an egg carton with 2 rows of 6 🥚',7:'two weeks of days 📅',8:'a crayon box with 2 rows of 8 🖍️',9:'a big truck with 9 wheels on each side 🚛',10:'all your fingers and all your toes 🦶'};
// Silly pictures only for the handful of times facts that refuse to stick. Rhyme pegs: 6 = sticks, 7 = heaven.
const STORIES={
  '6x6':['It rhymes! "Six times six is thirty-…"','Six times six is thirty-six.'],
  '6x8':['It rhymes! "Six times eight is forty-…"','Six times eight is forty-eight.'],
  '7x8':['Say the digits in a row: 5, 6, 7, 8.','5-6-7-8: fifty-six is seven times eight.'],
  '8x8':['"I ate and ate and got sick on the floor…" 🤢','Eight times eight is sixty-four!'],
  '7x7':['Two heavens ☁️☁️ and a fort on a vine 🏰🌿.','Fort-on-a-vine sounds like forty-nine.'],
  '6x7':['Sticks 🥢 poke heaven ☁️ and out drops a warty shoe 🐸👟.','Warty shoe sounds like forty-two.']
};
function mnemonic(f){
  const {op,a,b,ans}=f,m=(tag,hint,reveal)=>({tag,hint,reveal});
  if(f.kind==='vocab')return m(f.cue.startsWith('Sounds like')?'Sound-alike':f.cue?'Word parts':f.pic?'Memory hook':'',f.cue,f.pic);
  if(op==='add'){const s=Math.min(a,b),g=Math.max(a,b),eq=`${a} + ${b} = ${ans}`;
    if(s===g&&s<=10)return m('Doubles',`Double ${s}! Picture ${DOUBLES[s]}.`,`Double ${s} is ${ans}.`);
    if(s===1)return m('One more',`One more than ${g}. It is just the next number.`,`The number after ${g} is ${ans}.`);
    if(s===2)return m('Count on',`Start at ${g} and count on 2.`,`${g}, ${g+1}, ${g+2}. ${eq}.`);
    if(ans===10)return m('Ten friends',`${s} and ${g} are ten friends. Together they fill the ten-frame.`,`${eq}. Ten friends!`);
    if(g===10)return m('Ten plus',`1 ten and ${s} ones. Write a 1, then a ${s}.`,`1 ten and ${s} ones is ${ans}.`);
    if(ans<10)return m('Count on',`Start at ${g}, the bigger number. Hop ${s} more.`,`From ${g}, hop ${s}: ${eq}.`);
    if(g-s===1&&g<10)return m('Near double',`Double ${s}, then 1 more.`,`${s} + ${s} = ${2*s}, and 1 more is ${ans}.`);
    if(g===9)return m('Nine trick',`9 is almost 10. Do 10 + ${s}, then step back 1.`,`10 + ${s} = ${10+s}, back 1 is ${ans}.`);
    if(g<10){const need=10-g,left=s-need;return m('Make 10',`${g} needs ${need} to make 10. Break ${s} into ${need} and ${left}.`,`${g} + ${need} = 10, then ${left} more is ${ans}.`);}
    if(ans<=20&&s<10){const ones=g-10;return ones+s===10?m('Make a ten',`${ones} and ${s} are ten friends. Add that ten to the other ten.`,`${ones} + ${s} = 10, and 10 + 10 = 20.`):m('Keep the ten',`Park the 10. Just add the ones: ${ones} + ${s}.`,`${ones} + ${s} = ${ones+s}. Put the ten back: ${ans}.`);}
    const tg=Math.floor(g/10)*10,ts=Math.floor(s/10)*10,og=g%10,os=s%10;
    return m('Tens and ones',`Tens first: ${ts?`${tg} + ${ts}`:tg}. Then ones: ${og} + ${os}. Glue them together.`,`${tg+ts} and ${og+os} make ${ans}.`);
  }
  if(op==='sub'){const c=a,t=b,eq=`${c} − ${t} = ${ans}`;
    if(t===1)return m('One less',`One less than ${c}. The number just before it.`,`The number before ${c} is ${ans}.`);
    if(t===2)return m('Count back',`Start at ${c} and count back 2.`,`${c}, ${c-1}, ${c-2}. ${eq}.`);
    if(ans<=2)return m('Neighbors',`${t} and ${c} live close together. Count up from ${t} to ${c}.`,`${t} is ${ans} away from ${c}. ${eq}.`);
    if(c===2*t)return m('Half',`${c} is a double. What is half of ${c}?`,`${t} + ${t} = ${c}, so ${eq}.`);
    if(t===10)return m('Drop the ten',`Take away the ten. Which ones are left?`,`${c} is 1 ten and ${ans} ones. ${eq}.`);
    if(c===10)return m('Ten friends',`Who is ${t}'s ten friend? ${t} + ? = 10`,`${t} + ${ans} = 10, so ${eq}.`);
    if(c<10)return m('Think addition',`${t} + ? = ${c}. Count up from ${t}.`,`${t} + ${ans} = ${c}, so ${eq}.`);
    if(c<=20&&t===9)return m('Nine trick',`Take away 10, then give 1 back.`,`${c} − 10 = ${c-10}, plus 1 is ${ans}.`);
    if(c<=20&&t<10){const ones=c-10;if(t<=ones)return m('Keep the ten',`Leave the 10 alone. Just do ${ones} − ${t}.`,`${ones} − ${t} = ${ones-t}. ${eq}.`);
      const rest=t-ones;return m('Hop to 10',`Hop back ${ones} to land on 10. Then hop back ${rest} more.`,`${c} − ${ones} = 10, then 10 − ${rest} = ${ans}.`);}
    if(c<20&&t>10)return m('Drop both tens',`Both numbers have a ten. Drop them: ${c-10} − ${t-10}.`,`${c-10} − ${t-10} = ${ans}. ${eq}.`);
    return m('Count up',`Count up from ${t}: first to the next ten, then on to ${c}.`,`${t} + ${ans} = ${c}, so ${eq}.`);
  }
  if(op==='mul'){const s=Math.min(a,b),g=Math.max(a,b),eq=`${a} × ${b} = ${ans}`,st=STORIES[`${s}x${g}`];
    if(st)return m('Silly picture',st[0],`${st[1]} ${eq}.`);
    if(s===1)return m('Ones',`One group of ${g}. It stays the same.`,eq+'.');
    if(s===2)return m('Doubles',`Double ${g}. That is ${g} + ${g}.`,`${g} + ${g} = ${ans}.`);
    if(g===10)return m('Tens',`${s} tens. Write ${s}, then stick a 0 on the end.`,`${s} tens is ${ans}.`);
    if(s===5||g===5){const o=s===5?g:s;return m('Fives',`Count by 5s, ${o} times. Or take half of ${o*10}.`,`Half of ${o*10} is ${ans}.`);}
    if(g===9)return m('Nine trick',`Do ${s} × 10, then take away ${s}.`,`${s*10} − ${s} = ${ans}. Its digits add up to 9.`);
    if(s===3&&g===3)return m('Square',`A 3-by-3 square, like a tic-tac-toe board.`,`Tic-tac-toe has 9 boxes. ${eq}.`);
    if(s===3)return m('Double plus one',`Double ${g}, then add one more ${g}.`,`${2*g} + ${g} = ${ans}.`);
    if(s===4)return m('Double-double',`Double ${g}, then double it again.`,`${g} → ${2*g} → ${ans}.`);
    return m('Break it up',`Do 5 × ${g}, then add ${s-5} more ${g}s.`,`${5*g} + ${(s-5)*g} = ${ans}.`);
  }
  const c=a,d=b,eq=`${c} ÷ ${d} = ${ans}`;
  if(d===1)return m('Ones',`Dividing by 1 changes nothing.`,eq+'.');
  if(ans===1)return m('Itself',`A number divided by itself makes just one group.`,eq+'.');
  if(d===2)return m('Half',`Half of ${c}. What doubles to make ${c}?`,`${ans} + ${ans} = ${c}, so ${eq}.`);
  if(d===10)return m('Tens',`How many tens are in ${c}? Chop off the 0.`,eq+'.');
  if(d===5)return m('Fives',`Count by 5s up to ${c}. How many counts?`,`${ans} fives make ${c}. ${eq}.`);
  const st=STORIES[`${Math.min(d,ans)}x${Math.max(d,ans)}`];
  return m('Flip it',`Think times: ${d} × ? = ${c}.`,`${st?st[1]+' ':''}${d} × ${ans} = ${c}, so ${eq}.`);
}

// A meaning takes longer to say than a number.
const fastMs=f=>f.kind==='vocab'?8000:String(f.ans).length>1?6000:5000;
// Returns the updated card. `due` is false for extra practice of a card that was not due yet.
function grade(card,f,ok,ms,now,due=true,slack=0){
  const c=card?{...card}:{b:0,d:0,n:0,c:0,ms:0},isNew=!c.n;c.n++;c.l=now;
  if(!ok){c.b=1;c.d=now;return c;}
  c.c++;c.ms=c.ms?Math.round(c.ms*.6+ms*.4):Math.round(ms);
  const fast=ms<=fastMs(f)+slack;
  if(isNew)c.b=fast?3:2;                       // already known: skip the beginner boxes
  else if(due||c.b<=2){if(fast||c.b<=1)c.b=Math.min(MAXBOX,c.b+1);}   // slow but right: stay put
  else return c;                               // early review of a solid card: schedule untouched
  c.d=now+INTERVALS[c.b];return c;
}
// Order: cards that are due (weakest box first), then a new card if few are shaky, then extra practice.
// New cards come in random order unless sess.order is 'easy', which introduces the easiest first.
function pickNext(cards,dk,sess,now,rnd=Math.random){
  const recent=sess.recent||[],avail=dk.filter(f=>!recent.includes(f.key)),pool=avail.length?avail:dk;
  const seen=pool.filter(f=>cards[f.key]?.n),by=(x,y)=>cards[x.key].b-cards[y.key].b||cards[x.key].d-cards[y.key].d;
  const from=(list,n)=>list[Math.floor(rnd()*Math.min(n,list.length))],easy=sess.order==='easy',any=list=>from(list,easy?2:list.length);
  const due=seen.filter(f=>cards[f.key].d<=now).sort(by);
  if(due.length)return {fact:easy?from(due,3):any(due.filter(f=>cards[f.key].b===cards[due[0].key].b)),due:true,isNew:false};
  const shaky=dk.filter(f=>cards[f.key]?.n&&cards[f.key].b<=1).length,unseen=pool.filter(f=>!cards[f.key]?.n);
  if(unseen.length&&shaky<5&&(sess.newHard||0)<6)return {fact:any(unseen),due:true,isNew:true};
  const rest=seen.sort(by);
  if(rest.length)return {fact:from(rest,4),due:false,isNew:false};
  if(unseen.length)return {fact:any(unseen),due:true,isNew:true};
  return {fact:from(pool,pool.length),due:false,isNew:false};
}
function mastery(cards,dk){let strong=0,learning=0;for(const f of dk){const c=cards[f.key];if(c?.n){if(c.b>=STRONG)strong++;else learning++;}}return {strong,learning,total:dk.length};}
const dayKey=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function dayStreak(days,now){let n=0,t=now;if(!days[dayKey(t)])t-=DAY;while(days[dayKey(t)]){n++;t-=DAY;}return n;}
const LEVELS=[[0,'Rookie'],[40,'Counter'],[120,'Hopper'],[250,'Sprinter'],[500,'Ace'],[900,'Whiz'],[1500,'Champ'],[2500,'Legend']];
function level(stars){let i=0;while(i+1<LEVELS.length&&stars>=LEVELS[i+1][0])i++;return {n:i+1,name:LEVELS[i][1],next:LEVELS[i+1]?.[0]??null};}

/* ---------- saved data: validation and the CSV file ---------- */
// Each setting's allowed values; the first is the default.
const SETTINGS={secs:[60,30,90,120],hints:['always','fade','off'],stretch:[false,true],sound:[true,false],answer:['coach','type'],peek:[true,false],round:['speed','practice'],order:['random','easy'],range:['all','low','high']};
const ID=/^[\w-]{1,40}$/,num=v=>Number.isFinite(+v)?+v:0,obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
// Saved data comes back from browser storage, an account store or a CSV file, so every field is checked before use.
// Returns a complete player, or null when the record is not a player at all.
function cleanPlayer(p){
  if(!p||typeof p!=='object'||!ID.test(String(p.id))||typeof p.name!=='string'||!p.name.trim())return null;
  const raw=obj(p.set),set={};for(const [k,list] of Object.entries(SETTINGS))set[k]=list.includes(raw[k])?raw[k]:list[0];
  if(raw.secs===0&&!raw.round)set.round='practice';   // older saves stored "no clock" as 0 seconds
  const cards={};for(const [k,c] of Object.entries(obj(p.cards)))if(c&&typeof c==='object')cards[String(k).slice(0,60)]={b:Math.max(0,Math.min(MAXBOX,num(c.b))),d:num(c.d),n:num(c.n),c:num(c.c),ms:num(c.ms),l:num(c.l)};
  const best={};for(const [k,v] of Object.entries(obj(p.best)))best[String(k).slice(0,20)]=num(v);
  const days={};for(const [k,v] of Object.entries(obj(p.days)))if(/^\d{4}-\d\d-\d\d$/.test(k))days[k]=num(v);
  const rounds=(Array.isArray(p.rounds)?p.rounds:[]).filter(r=>r&&Object.hasOwn(MODES,r.mode)).map(r=>({t:num(r.t),mode:r.mode,secs:num(r.secs),score:num(r.score??r.right),right:num(r.right),wrong:num(r.wrong),range:r.range==='low'||r.range==='high'?r.range:'all'})).slice(-400);
  return {id:String(p.id),name:p.name.trim().slice(0,14),av:typeof p.av==='string'?[...p.av].slice(0,4).join(''):'',created:num(p.created),updated:num(p.updated),subject:p.subject==='words'?'words':'math',set,cards,rounds,best,stars:num(p.stars),days};
}
function cleanWords(list){
  const seen=new Set(),str=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
  return (Array.isArray(list)?list:[]).map(w=>w&&ID.test(String(w.id))&&{id:String(w.id),w:str(w.w,30),def:str(w.def,80),hook:str(w.hook,140)}).filter(w=>w&&w.w&&w.def&&!seen.has(w.id)&&seen.add(w.id)).slice(0,300);
}
// One CSV holds everything. The "record" column says what a row is: a player, one round played, one card's progress, or one of the grown-up's own words.
const COLS=['record','player_id','player','key','when','mode','seconds','right','wrong','box','due','seen','correct','avg_ms','details'];
const iso=t=>t>0?new Date(t).toISOString():'',cell=v=>{v=v==null?'':String(v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
function toCSV(data){
  const rows=[COLS],row=o=>rows.push(COLS.map(c=>o[c]??''));
  for(const p of (data.players||[]).map(cleanPlayer).filter(Boolean)){
    const who={player_id:p.id,player:p.name};
    row({record:'player',...who,when:iso(p.created),details:JSON.stringify({av:p.av,subject:p.subject,updated:p.updated,stars:p.stars,set:p.set,best:p.best,days:p.days})});
    for(const r of p.rounds)row({record:'round',...who,key:r.range==='all'?'':r.range,when:iso(r.t),mode:r.mode,seconds:r.secs,right:r.right,wrong:r.wrong});
    for(const [k,c] of Object.entries(p.cards))row({record:'card',...who,key:k,when:iso(c.l),box:c.b,due:iso(c.d),seen:c.n,correct:c.c,avg_ms:c.ms});
  }
  for(const w of cleanWords(data.words))row({record:'word',key:w.id,details:JSON.stringify({w:w.w,def:w.def,hook:w.hook})});
  return rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
function parseCSV(text){
  const rows=[];let row=[],v='',q=false;text=String(text).replace(/^﻿/,'');
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){v+='"';i++;}else q=false;}else v+=ch;}
    else if(ch==='"')q=true;else if(ch===','){row.push(v);v='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(v);v='';if(row.length>1||row[0])rows.push(row);row=[];}
    else v+=ch;}
  row.push(v);if(row.length>1||row[0])rows.push(row);return rows;
}
// Reads a file written by toCSV. Throws when the text is not one.
function fromCSV(text){
  const rows=parseCSV(text),head=rows.shift()||[],at=Object.fromEntries(head.map((h,i)=>[h.trim(),i]));
  if(!['record','player_id','details'].every(c=>c in at))throw Error('not a Fact Dash file');
  const time=s=>Date.parse(s)||0,json=s=>{try{return obj(JSON.parse(s));}catch{return {};}},players=new Map(),words=[];
  const get=id=>{if(!players.has(id))players.set(id,{id,name:'',cards:{},rounds:[]});return players.get(id);};
  for(const r of rows){const f=c=>r[at[c]]??'';
    if(f('record')==='word'){words.push({id:f('key'),...json(f('details'))});continue;}
    if(!ID.test(f('player_id')))continue;const p=get(f('player_id'));p.name=p.name||f('player');
    if(f('record')==='player')Object.assign(p,json(f('details')),{id:p.id,name:f('player'),created:time(f('when'))});
    else if(f('record')==='round')p.rounds.push({t:time(f('when')),mode:f('mode'),secs:+f('seconds'),right:+f('right'),wrong:+f('wrong'),range:f('key')});
    else if(f('record')==='card'&&f('key'))p.cards[f('key')]={b:+f('box'),d:time(f('due')),n:+f('seen'),c:+f('correct'),ms:+f('avg_ms'),l:time(f('when'))};}
  const out={players:[...players.values()].map(cleanPlayer).filter(Boolean),words:cleanWords(words)};
  if(!out.players.length&&!out.words.length)throw Error('no saved data in this file');
  return out;
}
// Signing in to the site. The name is lower-cased, and may be an email address. The password never leaves the device:
// it is stretched into a key here (slow on purpose, so a stolen copy of the server's records is hard to guess from) and only the key is sent.
const cleanLogin=t=>{const n=String(t??'').trim().toLowerCase();return /^[a-z0-9][a-z0-9._@+-]{2,63}$/.test(n)?n:'';};
async function passKey(name,password){
  const e=new TextEncoder(),k=await crypto.subtle.importKey('raw',e.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:e.encode('factdash:'+name),iterations:300000},k,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
return {OPS,MODES,INTERVALS,MAXBOX,STRONG,DAY,SETTINGS,cleanPlayer,cleanWords,toCSV,fromCSV,cleanLogin,passKey,facts,items,deck,choices,mnemonic,grade,pickNext,mastery,dayKey,dayStreak,level,fastMs};
})();
