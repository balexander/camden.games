// Tests for the scheduler (site/shared/srs.js).
// The first group is the contract: every algorithm must pass it unchanged, because the games rely on it.
// The second group pins down how the current algorithm (Leitner boxes) behaves. Replace it along with the algorithm.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ctx={};vm.runInNewContext(readFileSync(new URL('../site/shared/srs.js',import.meta.url),'utf8'),ctx);
const S=ctx.SRS,HOUR=36e5,DAY=864e5,now=1e12,plain=v=>JSON.parse(JSON.stringify(v));
const deck=Array.from({length:100},(_,i)=>({key:'k'+i,rank:i%12})),first=()=>0,last=()=>.999;
const quick={ok:true,ms:2000,fastMs:6000},slow={ok:true,ms:9000,fastMs:6000},miss={ok:false,ms:2000,fastMs:6000};

/* ---------- the contract ---------- */

test('contract: the scheduler offers exactly the five functions the games use',()=>{
 assert.deepEqual(Object.keys(S).sort(),['clean','mastery','pick','review','view']);
});

test('contract: a card survives being saved and loaded, and junk is refused',()=>{
 let c;for(const a of [quick,miss,slow,quick,quick])c=S.review(c,a,now);
 const saved=JSON.parse(JSON.stringify(c));
 assert.deepEqual(plain(S.clean(saved)),plain(c),'clean() keeps a card that review() made');
 assert.deepEqual(plain(S.view(S.clean(saved))),plain(S.view(c)));
 for(const bad of [null,undefined,'card',7,[],true])assert.equal(S.clean(bad),null,String(bad));
 assert.ok(S.clean({}),'an empty object becomes a blank card and does not throw');
 // Cards saved by the first version of the site (Leitner boxes) must load in every later version.
 const v1=S.clean({b:3,d:now+2*DAY,n:4,c:3,ms:2100,l:now});assert.ok(v1);
 assert.equal(S.view(v1).seen,4);assert.equal(S.view(v1).correct,3);assert.equal(S.view(v1).last,now);assert.ok(S.view(v1).level>=1);
});

test('contract: view() describes a card for display without the game looking inside it',()=>{
 assert.deepEqual(plain(S.view(undefined)),{seen:0,correct:0,avgMs:0,last:0,due:0,level:0,strength:0});
 let c=S.review(undefined,quick,now),v=S.view(c);
 assert.equal(v.seen,1);assert.equal(v.correct,1);assert.equal(v.avgMs,2000);assert.equal(v.last,now);assert.ok(v.due>now,'a quick right answer is not due straight away');
 assert.ok(v.level>=1&&v.level<=4&&Number.isInteger(v.level));
 const m=S.view(S.review(c,miss,now+DAY));assert.equal(m.seen,2);assert.equal(m.correct,1);assert.equal(m.level,1,'a card just missed is level 1');assert.ok(m.due<=now+DAY,'and is due again at once');
 assert.ok(m.strength<v.strength,'a miss lowers strength');
 for(let i=0;i<12;i++)c=S.review(c,quick,S.view(c).due);
 assert.equal(S.view(c).level,4,'steady quick right answers reach strong');assert.ok(S.view(c).strength>v.strength);
});

test('contract: review() does not change the card it was given',()=>{
 const c=S.review(undefined,quick,now),copy=plain(c);S.review(c,miss,now+DAY);S.review(c,quick,now+DAY);assert.deepEqual(plain(c),copy);
});

test('contract: pick() returns a card from the deck, asks due cards first and avoids immediate repeats',()=>{
 for(const r of [first,last,()=>.5]){const p=S.pick({},deck,{recent:[]},now,r);assert.ok(deck.includes(p.fact));assert.equal(p.isNew,true);}
 const cards={k10:S.review(undefined,quick,now-40*DAY),k11:S.review(undefined,miss,now-HOUR)};
 let p=S.pick(cards,deck,{recent:[]},now,first);assert.equal(p.fact.key,'k11','the missed card comes before the solid one');assert.equal(p.due,true);assert.equal(p.isNew,false);
 assert.equal(S.pick(cards,deck,{recent:['k11']},now,first).fact.key,'k10','a card just asked is skipped');
 const one=[deck[0]];assert.equal(S.pick({k0:S.review(undefined,quick,now)},one,{recent:['k0']},now,first).fact.key,'k0','a one-card deck still gives a card');
 const later={k0:S.review(undefined,quick,now),k1:S.review(undefined,quick,now)};
 p=S.pick(later,deck.slice(0,2),{recent:[]},now,first);assert.equal(p.due,false,'with nothing due and nothing new, a card is offered as extra practice');
});

test('contract: mastery() counts a deck',()=>{
 const strong=S.clean({b:4,d:now,n:5,c:5,ms:1,l:now}),learning=S.review(undefined,miss,now);
 assert.equal(S.view(strong).level,4);
 assert.deepEqual(plain(S.mastery({k0:strong,k1:learning,zz:strong},deck)),{strong:1,learning:1,total:100});
 assert.deepEqual(plain(S.mastery({},deck)),{strong:0,learning:0,total:100});
});

/* ---------- the current algorithm: Leitner boxes ---------- */

test('Leitner: answers move cards through the boxes',()=>{
 let c=S.review(undefined,quick,now);assert.equal(c.b,3);assert.equal(c.d,now+2*DAY);
 assert.equal(S.review(undefined,slow,now).b,2);
 assert.equal(S.review(undefined,{ok:true,ms:7000,fastMs:7500},now).b,3,'the caller decides what counts as quick');
 c=S.review(undefined,miss,now);assert.equal(c.b,1);assert.equal(c.d,now);
 c=S.review(c,slow,now);assert.equal(c.b,2);assert.equal(c.d,now+8*HOUR);
 assert.equal(S.review(c,slow,now+9*HOUR).b,2,'slow answers do not promote');
 const solid={b:4,d:now+DAY,n:5,c:5,ms:2000};
 assert.equal(S.review(solid,{ok:true,ms:1000,fastMs:6000,due:false},now).d,solid.d,'early review leaves the schedule alone');
 assert.equal(S.review(solid,{ok:false,ms:1000,fastMs:6000,due:false},now).b,1);
 assert.equal(S.review({b:6,d:0,n:9,c:9,ms:1},{ok:true,ms:1000,fastMs:6000},now).b,6);
 assert.equal(S.clean({b:99,n:'3'}).b,6);assert.equal(S.clean({b:99,n:'3'}).n,3);
 assert.deepEqual([1,2,3,4,5,6].map(b=>S.view({b,n:1}).level),[1,2,3,4,4,4]);
});

test('Leitner: the picker limits new cards and orders them',()=>{
 assert.equal(S.pick({},deck,{recent:[]},now,first).fact.key,'k0');
 const cards={k10:{b:2,d:now-1,n:2,c:1},k11:{b:1,d:now-1,n:1,c:0}};
 assert.equal(S.pick(cards,deck,{recent:[]},now,first).fact.key,'k11');
 const shaky=Object.fromEntries(deck.slice(0,5).map(f=>[f.key,{b:1,d:now,n:1,c:0}]));
 assert.ok(!S.pick(shaky,deck,{recent:['k0','k1','k2']},now,first).isNew,'no new cards while five are shaky');
 const later=Object.fromEntries(deck.slice(0,3).map(f=>[f.key,{b:3,d:now+DAY,n:1,c:1}]));
 assert.equal(S.pick(later,deck,{recent:[],newHard:6},now,first).due,false,'no new cards after six went badly');
 assert.equal(S.pick(later,deck,{recent:[]},now,first).isNew,true);
 // new cards come from anywhere in the deck by default, and from the start of it only when asked
 const spread=new Set();for(let i=0;i<40;i++)spread.add(S.pick({},deck,{recent:[]},now,()=>i/40).fact.rank);
 assert.equal(S.pick({},deck,{recent:[]},now,last).fact.key,'k99');assert.ok(spread.size>=6,'first cards span the deck');
 assert.equal(S.pick({},deck,{recent:[],order:'easy'},now,last).fact.key,'k1');
 const sameBox=Object.fromEntries(deck.slice(0,8).map((f,i)=>[f.key,{b:i<2?1:3,d:now-i,n:1,c:1}]));
 for(const r of [first,last,()=>.5])assert.equal(sameBox[S.pick(sameBox,deck,{recent:[]},now,r).fact.key].b,1,'missed cards still come back before solid ones');
});
