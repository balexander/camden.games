// Tests for the scheduler (site/shared/srs.js).
// The first group is the contract: every algorithm must pass it unchanged, because the games rely on it.
// The second group pins down how the current algorithm (expanding spans, graded by speed) behaves. Replace it along with the algorithm.
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

/* ---------- the current algorithm: expanding spans, graded by speed ---------- */
// A card's span (s, in hours) is the gap it is expected to survive. These tests read the saved fields, which games never do.

const at=(c,a,t)=>S.review(c,a,t),span=c=>c.s,strong=c=>S.view(c).level===4;

test('spans: the first answer places a card, and a quick answer stretches the span by the gap it survived',()=>{
 let c=at(undefined,quick,now);assert.equal(span(c),48);assert.equal(c.d,now+2*DAY);assert.equal(S.view(c).level,3);
 assert.equal(span(at(undefined,{ok:true,ms:7000,fastMs:7500},now)),48,'the caller decides what counts as quick');
 const s=at(undefined,slow,now);assert.equal(span(s),8,'new and slow starts short');assert.equal(s.d,now+8*HOUR);assert.equal(S.view(s).level,2);
 c=at(c,quick,now+2*DAY);assert.equal(span(c),120,'2 days survived x 2.5 = 5 days');assert.equal(c.d,now+7*DAY);assert.ok(strong(c));
 // on time every time: 2, 5, 12.5, 31 days, then the 60-day ceiling
 const spans=[];let t=now+7*DAY;for(let i=0;i<4;i++){c=at(c,quick,t);spans.push(span(c));t=c.d;}
 assert.deepEqual(spans,[300,750,1440,1440]);assert.equal(S.view(c).strength,6);
 // early: the span cannot shrink, and an answer seconds later proves nothing, so it grows nothing
 const solid=at(at(undefined,quick,now),quick,now+2*DAY),early=at(solid,quick,now+2*DAY+60e3);
 assert.equal(span(early),120);assert.ok(early.d>=solid.d,'extra practice never brings a solid card forward');
 assert.equal(span(at(solid,{...quick,due:false},now+2*DAY+60e3)),120,'the due flag from the game changes nothing');
 assert.equal(span(at(solid,quick,now+2*DAY+3*DAY)),180,'three of the five days survived: 3 x 2.5');
 // late: the extra days count for half. Planned 5 days, came back after 15: (5 + 10/2) x 2.5 = 25 days
 assert.equal(span(at(solid,quick,now+2*DAY+15*DAY)),600);
});

test('spans: a slow right answer, or one that needed the hint, is not fluency',()=>{
 const solid=at(at(undefined,quick,now),quick,now+2*DAY),t=solid.d;
 const s1=at(solid,slow,t);assert.equal(span(s1),120,'the span holds');assert.equal(s1.d,t+2.5*DAY,'and the card comes back in half the time');
 assert.ok(strong(s1),'one slow answer is forgiven');assert.equal(S.view(s1).strength,S.view(solid).strength);
 const s2=at(s1,slow,s1.d);assert.equal(span(s2),120);assert.ok(!strong(s2),'two in a row is not strong');assert.equal(S.view(s2).level,3);
 assert.equal(plain(S.mastery({k0:s2},deck)).strong,0);
 const back=at(s2,quick,s2.d);assert.ok(strong(back),'a quick answer restores it');assert.equal(span(back),150,'and grows from the shorter gap: 2.5 days x 2.5');
 const h=at(solid,{...quick,hint:true},t);assert.equal(span(h),120,'right with the hint counts as slow');assert.equal(h.d,t+2.5*DAY);
 assert.equal(span(at(solid,{...quick,hint:false},t)),300);
 let c=at(undefined,slow,now);for(let i=0;i<6;i++)c=at(c,slow,c.d);
 assert.equal(span(c),8,'always slow: never spaced out');assert.equal(c.d-c.l,8*HOUR,'and never closer than 8 hours');assert.equal(S.view(c).level,2);
});

test('spans: a miss is relearned inside the round and costs most of the span, not all of it',()=>{
 let c;for(const t of [0,2,7,19.5].map(d=>now+d*DAY))c=at(c,quick,t);assert.equal(span(c),750);
 const t=c.d,m=at(c,miss,t);assert.equal(span(m),72,'a quarter of the span, three days at most');assert.equal(m.d,t);assert.equal(S.view(m).level,1);
 assert.equal(span(at(m,miss,t+5e3)),72,'missing again while relearning costs nothing more');
 const r=at(m,quick,t+20e3);assert.equal(S.view(r).level,3,'right once: relearned');assert.equal(span(r),72);assert.equal(r.d,t+20e3+3*DAY,'and spaced out on the shorter span');
 const sl=at(m,slow,t+20e3);assert.equal(S.view(sl).level,3);assert.equal(sl.d,t+20e3+1.5*DAY,'relearned slowly: back in half the time');
 assert.equal(at(r,miss,t+DAY).s,18,'a later miss cuts it again');
 assert.equal(span(at(at(undefined,quick,now),miss,now+2*DAY)),12);
 const fresh=at(undefined,miss,now);assert.equal(span(fresh),8);assert.equal(S.view(fresh).level,1);
 const got=at(fresh,quick,now+20e3);assert.equal(span(got),8);assert.equal(got.d,now+20e3+8*HOUR,'a new card that was missed is checked again within the day');assert.equal(S.view(got).level,2);
});

test('spans: cards saved as Leitner boxes are converted, and a card stays small and plain',()=>{
 const old=b=>S.clean({b,d:now+DAY,n:6,c:4,ms:3100,l:now-DAY});
 assert.deepEqual([1,2,3,4,5,6].map(b=>old(b).s),[8,8,48,120,288,720],'each box becomes the gap it used to wait');
 assert.deepEqual([1,2,3,4,5,6].map(b=>S.view(old(b)).level),[1,2,3,4,4,4]);
 assert.deepEqual([1,2,3,4,5,6].map(b=>S.view(old(b)).strength),[1,2,3,4,5,6],'strength is still the box number');
 assert.deepEqual(plain(S.view(old(5))),{seen:6,correct:4,avgMs:3100,last:now-DAY,due:now+DAY,level:4,strength:5},'counts, speed and due date are kept');
 assert.equal(old(1).t,1,'box 1 was "just missed": still being relearned');assert.equal(S.clean({b:0,n:2}).t,1);
 assert.equal(S.clean({b:99,n:'3'}).s,720);assert.equal(S.clean({b:99,n:'3'}).n,3);assert.equal(S.view(S.clean({b:3,n:0})).level,0,'never seen is blank whatever the box says');
 // a converted card carries on: box 4 (5 days) answered quickly on time goes to 12.5 days
 const c=S.clean({b:4,d:now,n:5,c:5,ms:2000,l:now-5*DAY});assert.equal(at(c,quick,now).s,300);
 assert.equal(at({b:4,d:now,n:5,c:5,ms:2000,l:now-5*DAY},quick,now).s,300,'review() takes an old card as it is');
 // converting twice changes nothing, and a new card read by the first version of this file still means the same thing
 for(const b of [1,2,3,4,5,6]){assert.deepEqual(plain(S.clean(plain(old(b)))),plain(old(b)));const {b:bx,d,n,c:r,ms,l}=old(b);assert.deepEqual(plain(S.clean({b:bx,d,n,c:r,ms,l})),plain(old(b)));}
 assert.deepEqual(plain(S.clean({s:1e9,t:9,q:-4,n:2.4,c:'x',d:'soon',ms:null,l:5})),{s:1440,t:1,q:0,b:1,d:0,n:2,c:0,ms:0,l:5},'out-of-range values are pulled back in');
 let big;for(let i=0;i<40;i++)big=at(big,i%7?quick:miss,now+i*DAY);
 assert.ok(JSON.stringify(big).length<90,'under 90 bytes a card, so 2,000 cards fit in a fifth of the 1 MB limit');
 assert.ok(Object.values(big).every(Number.isInteger));
});

test('spans: the picker limits new cards, orders them and keeps related cards apart',()=>{
 assert.equal(S.pick({},deck,{recent:[]},now,first).fact.key,'k0');
 const relearn=at(undefined,miss,now-1),young=at(undefined,slow,now-DAY),solid=at(undefined,quick,now-3*DAY);
 assert.equal(S.pick({k10:young,k11:relearn,k12:solid},deck,{recent:[]},now,first).fact.key,'k11');
 // shaky = being relearned, or not yet proven over two days
 const five=list=>Object.fromEntries(deck.slice(0,5).map((f,i)=>[f.key,list(i)]));
 assert.ok(!S.pick(five(()=>relearn),deck,{recent:['k0','k1','k2']},now,first).isNew,'no new cards while five are shaky');
 const fresh=at(undefined,slow,now);
 assert.equal(S.pick(five(()=>fresh),deck,{recent:[]},now,first).due,false,'five slow new cards are practised again before any more arrive');
 assert.equal(S.pick(five(i=>i<4?fresh:at(undefined,quick,now)),deck,{recent:[]},now,first).isNew,true,'four shaky cards leave room for one more');
 const later=five(()=>at(undefined,quick,now));
 assert.equal(S.pick(later,deck,{recent:[],newHard:6},now,first).due,false,'no new cards after six went badly');
 assert.equal(S.pick(later,deck,{recent:[]},now,first).isNew,true);
 // new cards come from anywhere in the deck by default, and from the start of it only when asked
 const spread=new Set();for(let i=0;i<40;i++)spread.add(S.pick({},deck,{recent:[]},now,()=>i/40).fact.rank);
 assert.equal(S.pick({},deck,{recent:[]},now,last).fact.key,'k99');assert.ok(spread.size>=6,'first cards span the deck');
 assert.equal(S.pick({},deck,{recent:[],order:'easy'},now,last).fact.key,'k1');
 const mixed=Object.fromEntries(deck.slice(0,8).map((f,i)=>[f.key,i<2?relearn:solid]));
 for(const order of ['random','easy'])for(const r of [first,last,()=>.5])assert.equal(S.view(mixed[S.pick(mixed,deck,{recent:[],order},now,r).fact.key]).level,1,'missed cards come back before solid ones');
 // families: 6 x 7 was just asked, so 42 / 7 waits a turn unless it is the only choice
 const fam=[{key:'mul:6x7',family:'6,7'},{key:'div:42/7',family:'6,7'},{key:'div:42/6',family:'6,7'},{key:'mul:3x4',family:'3,4'},{key:'add:1+1'}];
 for(const r of [first,last,()=>.5]){
  const p=S.pick({},fam,{recent:['mul:6x7']},now,r).fact;assert.ok(p.family!=='6,7','a new card from another family: '+p.key);
  const all=Object.fromEntries(fam.map(f=>[f.key,solid]));assert.ok(S.pick(all,fam,{recent:['mul:6x7']},now,r).fact.family!=='6,7','a due card from another family');
 }
 assert.equal(S.pick({},fam.slice(0,2),{recent:['mul:6x7']},now,first).fact.key,'div:42/7','with no other choice the relative is asked');
 assert.equal(S.pick({'div:42/7':relearn,'mul:3x4':solid},fam,{recent:['mul:6x7']},now,first).fact.key,'div:42/7','a missed card is not held back for a solid one');
});
