import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {spawn} from 'node:child_process';import {once} from 'node:events';
const read=f=>readFileSync(new URL('../app/'+f,import.meta.url),'utf8'),ctx={};
vm.runInNewContext(read('words.js')+read('core.js'),ctx);const C=ctx.Core,WORDS=ctx.WORDS,HOUR=36e5;

test('fact decks cover the requested ranges with correct answers',()=>{
 const add=C.facts('add',false),sub=C.facts('sub',false),mul=C.facts('mul',false),div=C.facts('div',false);
 assert.equal(add.length,100);assert.equal(sub.length,190);assert.equal(mul.length,55);assert.equal(div.length,100);
 assert.ok(add.every(f=>f.ans===f.a+f.b&&f.ans<=20&&f.a>=1));assert.ok(sub.every(f=>f.ans===f.a-f.b&&f.ans>=1&&f.a<=20));
 assert.ok(mul.every(f=>f.ans===f.a*f.b&&f.b<=10));assert.ok(div.every(f=>f.ans*f.b===f.a&&f.b<=10&&f.ans<=10));
 assert.equal(C.facts('add',true).length,210);assert.ok(C.facts('sub',true).every(f=>f.b<=20&&f.ans<=20));
 for(const d of [add,sub,mul,div])assert.equal(new Set(d.map(f=>f.key)).size,d.length);
 assert.equal(add[0].rank,1);assert.ok(mul.at(-1).a>=6);
});

test('the number range splits adding and subtracting at 10',()=>{
 const low={range:'low'},high={range:'high'},add=C.items('add',{}),sub=C.items('sub',{});
 assert.equal(C.items('add',low).length,25);assert.equal(C.items('add',high).length,75);assert.equal(C.items('sub',low).length,45);assert.equal(C.items('sub',high).length,145);
 assert.ok(C.items('add',low).every(f=>f.ans<=10));assert.ok(C.items('add',high).every(f=>f.ans>10&&f.ans<=20));
 assert.ok(C.items('sub',low).every(f=>f.a<=10));assert.ok(C.items('sub',high).every(f=>f.a>10));
 for(const [all,m] of [[add,'add'],[sub,'sub']])assert.deepEqual([...C.items(m,low),...C.items(m,high)].map(f=>f.key).sort(),[...all].map(f=>f.key).sort(),'the two ranges cover every fact once');
 assert.equal(C.items('add',{range:'high',stretch:true}).length,185);
 assert.equal(C.items('mul',low).length,55);assert.equal(C.items('div',high).length,100);assert.equal(C.items('v1',low).length,40);
 assert.ok(C.deck('mix',low,{'sub:5-2':{n:1},'mul:2x3':{n:1}}).every(f=>f.op==='mul'||f.a<=10));
});

test('every card has a mnemonic whose hint hides the answer where possible and whose reveal is true',()=>{
 for(const op of ['add','sub','mul','div'])for(const f of C.facts(op,true)){
  const m=C.mnemonic(f);assert.ok(m.tag&&m.hint&&m.reveal,f.key);assert.ok(!/undefined|NaN/.test(m.hint+m.reveal),f.key+': '+m.hint+' / '+m.reveal);
  // Any "x op y = z" statement in a mnemonic must be arithmetically true.
  for(const [,x,o,y,z] of (m.hint+' '+m.reveal).matchAll(/(\d+) ([+−×÷]) (\d+) = (\d+)/g)){const r={'+':+x+ +y,'−':x-y,'×':x*y,'÷':x/y}[o];assert.equal(r,+z,`${f.key}: ${m.hint} / ${m.reveal}`);}
 }
 const f=k=>['add','sub','mul','div'].flatMap(o=>C.facts(o,false)).find(x=>x.key===k);
 assert.equal(C.mnemonic(f('add:6+8')).hint,'8 needs 2 to make 10. Break 6 into 2 and 4.');
 assert.equal(C.mnemonic(f('sub:13-5')).tag,'Hop to 10');assert.equal(C.mnemonic(f('mul:7x8')).tag,'Silly picture');assert.equal(C.mnemonic(f('div:56/7')).tag,'Flip it');
});

test('grading moves cards through the boxes',()=>{
 const f=C.facts('mul',false).find(x=>x.key==='mul:6x7'),now=1e12;
 let c=C.grade(undefined,f,true,2000,now);assert.equal(c.b,3);assert.equal(c.d,now+C.INTERVALS[3]);
 assert.equal(C.grade(undefined,f,true,9000,now).b,2);
 assert.equal(C.grade(undefined,f,true,7000,now,true,1500).b,3,'spoken answers get extra time');
 c=C.grade(undefined,f,false,2000,now);assert.equal(c.b,1);assert.equal(c.d,now);
 c=C.grade(c,f,true,9000,now);assert.equal(c.b,2);assert.equal(c.d,now+8*HOUR);
 assert.equal(C.grade(c,f,true,9000,now+9*HOUR).b,2,'slow answers do not promote');
 const solid={b:4,d:now+C.DAY,n:5,c:5,ms:2000};
 assert.equal(C.grade(solid,f,true,1000,now,false).d,solid.d,'early review leaves the schedule alone');
 assert.equal(C.grade(solid,f,false,1000,now,false).b,1);
 assert.equal(C.grade({b:6,d:0,n:9,c:9,ms:1},f,true,1000,now).b,6);
});

test('the picker prefers due cards, limits new facts, and avoids immediate repeats',()=>{
 const dk=C.facts('add',false),now=1e12,first=()=>0;
 assert.equal(C.pickNext({},dk,{recent:[]},now,first).fact.key,dk[0].key);
 const cards={[dk[10].key]:{b:2,d:now-1,n:2,c:1},[dk[11].key]:{b:1,d:now-1,n:1,c:0}};
 let p=C.pickNext(cards,dk,{recent:[]},now,first);assert.equal(p.fact.key,dk[11].key);assert.equal(p.due,true);
 assert.equal(C.pickNext(cards,dk,{recent:[dk[11].key]},now,first).fact.key,dk[10].key);
 const shaky=Object.fromEntries(dk.slice(0,5).map(f=>[f.key,{b:1,d:now,n:1,c:0}]));
 p=C.pickNext(shaky,dk,{recent:dk.slice(0,3).map(f=>f.key)},now,first);assert.ok(!p.isNew,'no new facts while five are shaky');
 const later=Object.fromEntries(dk.slice(0,3).map(f=>[f.key,{b:3,d:now+C.DAY,n:1,c:1}]));
 assert.equal(C.pickNext(later,dk,{recent:[],newHard:6},now,first).due,false);
 assert.equal(C.pickNext(later,dk,{recent:[]},now,first).isNew,true);
 // new cards come from anywhere in the deck by default, and from the easy end only when asked
 const last=()=>.999,spread=new Set();for(let i=0;i<40;i++)spread.add(C.pickNext({},dk,{recent:[]},now,()=>i/40).fact.rank);
 assert.equal(C.pickNext({},dk,{recent:[]},now,last).fact.key,dk.at(-1).key);assert.ok(spread.size>=6,'first cards span many kinds of fact');
 assert.equal(C.pickNext({},dk,{recent:[],order:'easy'},now,last).fact.key,dk[1].key);
 const sameBox=Object.fromEntries(dk.slice(0,8).map((f,i)=>[f.key,{b:i<2?1:3,d:now-i,n:1,c:1}]));
 for(const r of [first,last,()=>.5])assert.equal(sameBox[C.pickNext(sameBox,dk,{recent:[]},now,r).fact.key].b,1,'missed cards still come back before solid ones');
});

test('mix, mastery, streaks and levels',()=>{
 assert.ok(C.deck('mix',{},{}).every(f=>f.op==='add'));
 assert.deepEqual([...new Set(C.deck('mix',{},{'mul:2x3':{n:1}}).map(f=>f.op))],['mul']);
 assert.deepEqual({...C.mastery({'mul:1x1':{n:1,b:4},'mul:1x2':{n:1,b:2}},C.facts('mul',false))},{strong:1,learning:1,total:55});
 const now=new Date(2026,10,10,12).getTime(),k=d=>C.dayKey(now-d*C.DAY);
 assert.equal(C.dayStreak({[k(0)]:1,[k(1)]:2,[k(3)]:1},now),2);assert.equal(C.dayStreak({[k(1)]:2},now),1);assert.equal(C.dayStreak({},now),0);
 assert.equal(C.level(0).name,'Rookie');assert.equal(C.level(40).n,2);assert.equal(C.level(9999).next,null);
});

test('vocabulary decks are complete and every cue hides the meaning',()=>{
 const all=[1,2,3].flatMap(l=>WORDS[l]);assert.equal(all.length,120);assert.equal(new Set(all.map(w=>w[0])).size,120);assert.equal(new Set(all.map(w=>w[2])).size,120);
 for(const [w,pos,def,ex,cue,pic] of all){
  assert.ok(['adj','verb','noun'].includes(pos),w);assert.ok(def&&ex&&cue&&pic,w);assert.ok(def.length<=45,w+' meaning is short enough to say');
  assert.ok(/^(Sounds like "|Word parts: )/.test(cue),w+': '+cue);
  assert.ok(ex.toLowerCase().includes(w.replace(/[ey]$/,'')),w+' appears in its sentence');
  assert.ok(!ex.toLowerCase().includes(def.toLowerCase())&&!cue.toLowerCase().includes(def.toLowerCase()),w+' is not defined by its own cue');
 }
 const v1=C.items('v1'),f=v1[2];assert.equal(f.key,'w:fragile');assert.equal(f.ans,'easy to break');
 assert.deepEqual({...C.mnemonic(f)},{tag:'Sound-alike',hint:'Sounds like "fridge aisle".',reveal:f.pic});assert.equal(C.mnemonic(v1.find(x=>x.w==='predict')).tag,'Word parts');
 assert.equal(C.fastMs(f),8000);assert.equal(C.grade(undefined,f,true,7500,1e12).b,3);
});

test('own words, word mixes and multiple choice',()=>{
 const custom=[{id:'a1',w:'migrate',def:'to move to a new place',hook:'My grate rolls away.'},{id:'a2',w:'orbit',def:'to travel around something'}];
 const mine=C.items('mine',{custom});assert.deepEqual(mine.map(f=>f.key),['my:a1','my:a2']);
 assert.deepEqual({...C.mnemonic(mine[0])},{tag:'Memory hook',hint:'',reveal:'My grate rolls away.'});assert.equal(C.mnemonic(mine[1]).tag,'');
 assert.ok(C.deck('vmix',{custom},{}).every(f=>f.op==='v1'));
 assert.deepEqual([...new Set(C.deck('vmix',{custom},{'my:a2':{n:1},'w:absurd':{n:2}}).map(f=>f.op))].sort(),['mine','v3']);
 for(const f of [...C.items('v2'),...mine]){const ch=C.choices(f,[...C.items('v2'),...mine]);assert.equal(ch.length,3);assert.equal(new Set(ch).size,3);assert.ok(ch.includes(f.def));}
 const adj=C.items('v1')[0],defs=Object.fromEntries(C.items('v1').map(f=>[f.def,f.pos]));
 assert.ok(C.choices(adj,C.items('v1')).every(d=>defs[d]==='adj'),'wrong choices are the same kind of word');
 assert.equal(C.pickNext({},mine,{recent:[]},1e12,()=>0).fact.key,'my:a1');
});

test('the installable app shell is complete and serves only its own files',async t=>{
 const html=read('index.html'),sw=read('sw.js'),man=JSON.parse(read('manifest.webmanifest'));
 assert.equal(man.display,'standalone');for(const i of man.icons)assert.ok(readFileSync(new URL('../app/'+i.src,import.meta.url)).length>500);
 for(const f of ['manifest.webmanifest','icons/apple-touch-icon.png','words.js','core.js'])assert.ok(html.includes(`"${f}"`),f);
 for(const f of sw.match(/const SHELL=\[(.*?)\]/)[1].replace(/'/g,'').split(',').filter(f=>f!=='./'))assert.ok(readFileSync(new URL('../app/'+f,import.meta.url)).length>0,f);
 const port=14318,origin=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['serve.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DASH_PORT:String(port)},stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());
 await once(child.stdout,'data');
 for(const [p,type] of [['/','text/html'],['/core.js','text/javascript'],['/sw.js','text/javascript'],['/manifest.webmanifest','application/manifest+json'],['/icons/icon-192.png','image/png']]){const r=await fetch(origin+p);assert.equal(r.status,200,p);assert.ok(r.headers.get('content-type').startsWith(type),p);}
 for(const p of ['/serve.mjs','/../serve.mjs','/%2e%2e/package.json','/icons/../../serve.mjs','/test/app.test.mjs'])assert.equal((await fetch(origin+p)).status,404,p);
});

test('saved data survives a CSV file round trip and bad data is cleaned on the way in',()=>{
 const now=1.79e12,db={players:[
  {id:'a1',name:'Sam, "the" kid',av:'🦖',created:now,updated:now+5,subject:'words',set:{secs:90,hints:'fade',stretch:true,sound:false,answer:'type',peek:false,round:'practice'},
   cards:{'mul:6x7':{b:3,d:now+C.DAY,n:4,c:3,ms:2100,l:now},'w:fragile':{b:1,d:now,n:1,c:0,ms:0,l:now},'my:w1':{b:2,d:now,n:2,c:1,ms:5000,l:now}},
   rounds:[{t:now,mode:'mul',secs:60,score:9,right:9,wrong:2},{t:now+500,mode:'add',secs:60,score:7,right:7,wrong:1,range:'low'},{t:now+1000,mode:'v1',secs:0,score:11,right:11,wrong:4}],best:{'mul:60':9,'v1:0':11},stars:27,days:{'2026-11-10':2}},
  {id:'b2',name:'Mia\nJo',av:'🐼',created:now,cards:{},rounds:[],best:{},stars:0,days:{}}],
  words:[{id:'w1',w:'migrate',def:'to move, far away',hook:'My "grate" rolls away.'}]};
 const csv=C.toCSV(db),lines=csv.trim().split('\r\n');
 assert.equal(lines[0],'record,player_id,player,key,when,mode,seconds,right,wrong,box,due,seen,correct,avg_ms,details');
 assert.ok(lines.some(l=>l.startsWith('round,a1,"Sam, ""the"" kid",,'+new Date(now).toISOString()+',mul,60,9,2')),'a round is one readable row');
 const back=C.fromCSV(csv),plain=v=>JSON.parse(JSON.stringify(v));
 assert.deepEqual(plain(back.players),plain(db.players.map(C.cleanPlayer)));assert.deepEqual(plain(back.words),plain(db.words));
 assert.deepEqual(plain(C.fromCSV('﻿'+csv.replace(/\r\n/g,'\n')).players),plain(back.players),'spreadsheet line endings and byte-order mark are fine');
 for(const bad of ['','hello','name,score\nSam,3',lines[0]])assert.throws(()=>C.fromCSV(bad));
 // cleaning: defaults filled, old "no clock" saves become practice, junk dropped
 const old=C.cleanPlayer({id:'x',name:' Sam ',set:{secs:0,hints:'loud'},cards:{'add:1+1':{b:99,n:'3'},junk:null},rounds:[{mode:'nope'},{mode:'add',t:5,right:'4'}],stars:'<b>',av:'<img src=x>'});
 assert.deepEqual(plain(old.set),{secs:60,hints:'always',stretch:false,sound:true,answer:'coach',peek:true,round:'practice',order:'random',range:'all'});
 assert.equal(old.name,'Sam');assert.equal(old.stars,0);assert.equal(old.av.length,4);assert.equal(old.cards['add:1+1'].b,C.MAXBOX);assert.equal(old.cards['add:1+1'].n,3);assert.equal(old.cards.junk,undefined);
 assert.deepEqual(plain(old.rounds),[{t:5,mode:'add',secs:0,score:4,right:4,wrong:0,range:'all'}]);
 for(const bad of [null,{},{id:'ok'},{id:'has space',name:'A'},{id:'x',name:'  '},{id:'../x',name:'A'}])assert.equal(C.cleanPlayer(bad),null);
 assert.equal(C.cleanPlayer({id:'x',name:'A',rounds:[{mode:'constructor'}]}).rounds.length,0);
 assert.deepEqual(plain(C.cleanWords([{id:'a',w:'x',def:'y'},{id:'a',w:'dup',def:'y'},{id:'b',w:'',def:'y'},{id:'c d',w:'x',def:'y'},'junk'])),[{id:'a',w:'x',def:'y',hook:''}]);
});
