// Tests for Big Hops' logic (site/big-hops/game.js): turning facts into hops, scoring a trip, what the scheduler is told, and saved data.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ctx={};for(const f of ['shared/srs.js','shared/words.js','shared/core.js','big-hops/game.js'])vm.runInContext(readFileSync(new URL('../site/'+f,import.meta.url),'utf8'),vm.createContext(ctx));
const H=ctx.Hops,C=ctx.Core,S=ctx.SRS,plain=v=>JSON.parse(JSON.stringify(v));
const ALL=[...C.items('add'),...C.items('sub')],FACTS=ALL.filter(f=>f.op==='add'||f.b<=H.MOST),fact=key=>FACTS.find(f=>f.key===key);
const walk=(q,stops)=>{const s=H.begin(q);const seen=stops.map(v=>H.hop(q,s,v));return {s,seen};};

test('every adding and subtracting fact within 20 fits on the line',()=>{
 assert.equal(ALL.length,290);assert.equal(FACTS.length,245);
 for(const f of ALL)assert.equal(!!H.ask(f),FACTS.includes(f),f.key+': only trips of up to '+H.MOST+' pebbles are asked');
 for(const f of FACTS)for(const r of [0,.25,.5,.75,.999]){const q=H.ask(f,()=>r);
  assert.ok(q,f.key);assert.equal(q.ans,f.ans);assert.equal(q.from+q.dir*q.n,q.ans,f.key);
  assert.ok(q.lo>=0&&q.hi<=H.TOP&&q.lo<=Math.min(q.from,q.ans)&&q.hi>=Math.max(q.from,q.ans),f.key+' shows the start and the answer');
  assert.ok(q.hi-q.lo+1>=H.STONES&&q.hi-q.lo+1<=H.MOST+5,f.key+' shows enough stones, and few enough to tap');
  if(q.ans<H.TOP-1&&q.ans>1)assert.ok(q.dir>0?q.hi>q.ans:q.lo<q.ans,f.key+' has a stone past the answer');}
 const q=H.ask(fact('add:3+8'),()=>.9);assert.equal(q.from,8,'adding starts on the bigger number');assert.equal(q.n,3);assert.equal(q.text,'8 + 3');
 assert.equal(H.ask(fact('add:3+8'),()=>.1).text,'3 + 8');
 const t=H.ask(fact('sub:13-5'),()=>.5);assert.deepEqual([t.from,t.n,t.dir,t.ans,t.text],[13,5,-1,8,'13 − 5']);
 assert.equal(H.ask(C.items('mul')[5]),null);assert.equal(H.ask(C.items('add',{stretch:true}).find(f=>f.ans>20)),null);assert.equal(H.ask(null),null);
});

test('hops spend pebbles, and too far is a miss',()=>{
 const q=H.ask(fact('add:6+8'),()=>.5);let {s,seen}=walk(q,[10,14]);
 assert.deepEqual(seen,['hop','landed']);assert.deepEqual(plain(s),{pos:14,left:0,hops:[[8,10],[10,14]],over:'landed'});
 assert.equal(H.hop(q,s,15),'ignored','nothing happens after landing');
 ({s,seen}=walk(q,[8,7,9,9,3.5,99]));assert.deepEqual(seen,['ignored','ignored','hop','ignored','ignored','ignored']);assert.equal(s.left,5);
 ({s,seen}=walk(q,[15]));assert.deepEqual(seen,['far']);assert.equal(s.over,'missed');assert.equal(s.hops.length,0);
 const b=H.ask(fact('sub:13-5'),()=>.5);({s,seen}=walk(b,[14,10,8]));assert.deepEqual(seen,['ignored','hop','landed']);assert.equal(s.pos,8);
 assert.deepEqual(walk(b,[10,7]).seen,['hop','far']);
});

test('fewer hops earn more, and going through a landmark earns as much as knowing it',()=>{
 const q=H.ask(fact('add:6+8'),()=>.5),r=stops=>plain(H.rate(q,walk(q,stops).s.hops));
 assert.deepEqual(r([14]),{kind:'known',gems:3});
 assert.deepEqual(r([10,14]),{kind:'smart',gems:3});
 assert.deepEqual(r([11,14]),{kind:'chunks',gems:2});
 assert.deepEqual(r([10,12,14]),{kind:'chunks',gems:2});
 assert.deepEqual(r([9,10,11,12,13,14]),{kind:'ones',gems:1});
 const b=H.ask(fact('sub:13-5'),()=>.5);assert.equal(H.rate(b,walk(b,[10,8]).s.hops).kind,'smart');assert.equal(H.rate(b,walk(b,[11,8]).s.hops).kind,'chunks');
});

test('the trick for every fact is a trip of one or two hops that scores full marks',()=>{
 for(const f of FACTS){const q=H.ask(f,()=>.5),t=H.trick(q),{s,seen}=walk(q,t.stops);
  assert.equal(seen.at(-1),'landed',f.key);assert.ok(t.stops.length<=2&&seen.every(x=>x!=='ignored'&&x!=='far'),f.key);
  assert.ok(['known','smart'].includes(H.rate(q,s.hops).kind),f.key);
  assert.ok(t.hint&&t.say&&!/undefined|NaN|-\d/.test(t.hint+t.say),f.key+': '+t.hint+' / '+t.say);
  assert.ok(!new RegExp(`\\b${q.ans}\\b`).test(t.hint)||[q.from,q.n,10,q.from-10,20].includes(q.ans),f.key+' hint gives the answer away: '+t.hint);}
 assert.equal(H.trick(H.ask(fact('add:6+8'),()=>.5)).say,'8 needs 2 to make 10. Then 4 more lands on 14.');
 assert.equal(H.trick(H.ask(fact('add:3+14'),()=>.5)).hint,'Keep the ten. Just do 4 + 3.');
 assert.equal(H.trick(H.ask(fact('sub:13-5'),()=>.5)).say,'Back 3 to 10. Then 2 more back lands on 8.');
});

test('the scheduler hears known, worked out, or missed',()=>{
 const f=fact('add:6+8'),q=H.ask(f,()=>.5),fast=C.fastMs(f),now=1e12;
 const known=H.answer(q,walk(q,[14]).s,2000,fast),worked=H.answer(q,walk(q,[10,14]).s,2000,fast),slow=H.answer(q,walk(q,[14]).s,fast+1,fast),far=H.answer(q,walk(q,[15]).s,2000,fast);
 assert.deepEqual(plain(known),{ok:true,ms:2000,fastMs:fast,hint:false});assert.equal(worked.hint,true);assert.equal(far.ok,false);
 const due=a=>S.view(S.review(undefined,a,now)).due;
 assert.ok(due(known)>due(worked),'one quick hop waits longer than a trip that was worked out');
 assert.equal(due(worked),due(slow),'several hops count the same as one slow hop');
 assert.equal(S.view(S.review(undefined,far,now)).level,1);
 // A fact answered in several hops every time never becomes strong; answered in one quick hop it does.
 let a,b,t=now;for(let i=0;i<6;i++){a=S.review(a,worked,t);b=S.review(b,known,t);t=Math.max(S.view(a).due,S.view(b).due);}
 assert.ok(S.view(a).level<4);assert.equal(S.view(b).level,4);
});

test('gems unlock hoppers, and saved data is checked',()=>{
 assert.equal(H.FRIENDS[0][0],0);for(let i=1;i<H.FRIENDS.length;i++)assert.ok(H.FRIENDS[i][0]>H.FRIENDS[i-1][0]);
 assert.equal(H.friends(0),1);assert.equal(H.friends(14),1);assert.equal(H.friends(15),2);assert.equal(H.friends(1e6),H.FRIENDS.length);
 assert.equal(H.nextFriend(0),15);assert.equal(H.nextFriend(1e6),null);
 assert.deepEqual(plain(H.clean(undefined)),{gems:0,best:0,rounds:0,ops:'both',pal:0});
 assert.deepEqual(plain(H.clean({gems:41.2,best:'20',rounds:-3,ops:'mul',pal:9,extra:1})),{gems:41,best:20,rounds:0,ops:'both',pal:2});
 assert.deepEqual(plain(H.clean({gems:16,ops:'sub',pal:1})),{gems:16,best:0,rounds:0,ops:'sub',pal:1});
 assert.deepEqual(plain(H.clean([1])),plain(H.clean({})));
 const kept=C.cleanPlayer({id:'x',name:'A',games:{'big-hops':H.clean({gems:16,pal:1})}}).games['big-hops'];assert.deepEqual(plain(H.clean(kept)),plain(H.clean({gems:16,pal:1})));
});
