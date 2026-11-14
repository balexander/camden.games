// The scheduler: spaced repetition for every game on the site. It decides which card to ask next and what an answer does to a card.
// This file is the whole algorithm and nothing else. To try a different one, rewrite the inside of this file and keep the five
// functions it returns behaving as described here and in README.md ("The scheduler"). test/srs.test.mjs checks them.
//
// Games never look inside a saved card. They keep whatever review() gives back, and call view() for anything they show.
//   clean(saved)                     -> a valid card, or null. Must accept cards saved by every earlier version of this file.
//   review(card, answer, now)        -> the card after an answer. card is undefined the first time.
//                                       answer = {ok, ms, fastMs, hint}: right or wrong, time taken, the time that counts as quick
//                                       for this card, and (optional) hint=true when the player asked for the hint first.
//                                       answer.due is accepted and ignored: the time since the last answer says the same thing.
//   pick(cards, deck, session, now, rnd) -> {fact, due, isNew}: the next card from deck (a list of objects with a unique .key and,
//                                       optionally, a .family shared by related cards). cards maps key -> card.
//                                       session = {recent: [keys just asked], order: 'random'|'easy',
//                                       newHard: new cards that went badly so far}. rnd is Math.random or a test stand-in.
//   view(card)                       -> {seen, correct, avgMs, last, due, level, strength} for display:
//                                       level 0 = not seen, 1 = just missed, 2 and 3 = learning, 4 = strong;
//                                       strength is any number that goes up as the card gets better known.
//   mastery(cards, deck)             -> {strong, learning, total} for a deck.
//
// The algorithm: each card has a span, the gap in hours it is expected to survive. README.md gives the reasons and the evidence.
//   - A quick right answer stretches the span to GROW times the gap the card really survived, so answers that come early
//     change little and answers that come late count for more. This is the expanding schedule of SM-2 and Anki.
//   - A right answer that was slow, or needed the hint, proves the fact can be worked out but not that it is known by heart.
//     The span stays where it is and the card comes back in half the time. Two slow answers in a row and it is not "strong".
//   - A miss cuts the span to a quarter (three days at most) and the card is relearned in the same round: it comes back after
//     a few other cards, and is spaced out again once it is answered right.
//
// Loaded as a classic script (global SRS) so games work when opened straight from a file.
var SRS=(()=>{
const HOUR=36e5;
const GROW=2.5;        // a quick right answer: new span = gap survived x GROW
const FIRST=48;        // hours: span of a card answered quickly the first time it is seen (it was already known)
const SHORT=8;         // hours: shortest span, for cards that are new and slow, or just relearned
const LONGEST=1440;    // hours: 60 days. Nothing goes longer without a check
const LAPSE=.25;       // a miss keeps this much of the span,
const LAPSE_MOST=72;   // but never more than this many hours
const SHAKY=5,HARD=6;  // no new cards while this many are shaky, or after this many new ones went badly in the round
const BOXES=[48,120,288,720];   // spans (hours) where strength steps up from 2 to 3, 4, 5 and 6. Strength 4 and up is strong
const OLD=[SHORT,SHORT,SHORT,48,120,288,720];   // the span of each Leitner box in the first version of this file
const num=v=>Number.isFinite(+v)?+v:0,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),whole=v=>Math.max(0,Math.round(num(v)));
// A saved card:
//   s span in hours, t 1 while it is being relearned after a miss, q slow right answers in a row (0 to 2), d when it is due,
//   n times seen, c times right, ms average time of right answers, l when last seen,
//   b strength 1 to 6. b can be worked out from s and t. It is saved because it is what the first version of this file called
//   the box, so a device still running that version reads these cards correctly, and what it saves back converts cleanly.
const box=c=>!c.n?0:c.t?1:2+BOXES.filter(h=>c.s>=h).length;
const gap=c=>Math.max(SHORT,c.q?c.s/2:c.s)*HOUR;
function clean(c){
  if(!c||typeof c!=='object'||Array.isArray(c))return null;
  const o={s:0,t:0,q:0,b:0,d:num(c.d),n:whole(c.n),c:whole(c.c),ms:whole(c.ms),l:num(c.l)};
  if(!o.n)return o;
  if('s' in c){o.s=clamp(whole(c.s),SHORT,LONGEST);o.t=clamp(whole(c.t),0,1);o.q=clamp(whole(c.q),0,2);}
  else{const b=clamp(Math.floor(num(c.b)),0,6);o.s=OLD[b];o.t=b<2?1:0;}   // a Leitner card: box 1 was "just missed"
  o.b=box(o);return o;
}
function review(card,{ok,ms,fastMs,hint=false},now){
  const c=clean(card)||clean({}),isNew=!c.n,since=Math.max(0,now-c.l),planned=Math.max(0,c.d-c.l);
  c.n++;c.l=now;
  if(!ok){
    if(isNew)c.s=SHORT;else if(!c.t)c.s=clamp(Math.round(c.s*LAPSE),SHORT,LAPSE_MOST);   // a second miss while relearning costs nothing more
    c.t=1;c.q=0;c.d=now;c.b=box(c);return c;
  }
  c.c++;c.ms=c.ms?Math.round(c.ms*.6+ms*.4):Math.round(ms);
  const quick=ms<=fastMs&&!hint;c.q=quick?0:Math.min(2,c.q+1);
  if(c.t)c.t=0;                                   // relearned: back to spacing, on the span the miss left
  else if(isNew)c.s=quick?FIRST:SHORT;
  else if(quick){
    const survived=(since<=planned?since:planned+(since-planned)/2)/HOUR;   // being late counts for half
    c.s=clamp(Math.round(survived*GROW),c.s,LONGEST);
  }
  c.d=quick?Math.max(c.d,now+gap(c)):now+gap(c);c.b=box(c);return c;
}
// Order: cards being relearned and other due cards (weakest first), then a new card if few are shaky, then extra practice.
// New cards come in random order unless session.order is 'easy', which introduces the first ones in the deck first.
// Cards from the same family as one just asked (6 x 7 and 42 / 7) wait a turn when there is another choice.
function pick(cards,dk,sess,now,rnd=Math.random){
  const recent=sess.recent||[],avail=dk.filter(f=>!recent.includes(f.key)),pool=avail.length?avail:dk;
  const memo=new Map(),card=f=>{if(!memo.has(f.key))memo.set(f.key,clean(cards[f.key])||clean({}));return memo.get(f.key);};
  const fams=new Set(dk.filter(f=>f.family!=null&&recent.includes(f.key)).map(f=>f.family));
  const apart=list=>{const far=list.filter(f=>!fams.has(f.family));return far.length?far:list;};
  const by=(x,y)=>card(x).b-card(y).b||card(x).d-card(y).d;
  const from=(list,n)=>list[Math.floor(rnd()*Math.min(n,list.length))],easy=sess.order==='easy',any=list=>from(list,easy?2:list.length);
  const seen=pool.filter(f=>card(f).n),due=seen.filter(f=>card(f).d<=now).sort(by);
  if(due.length){const weakest=apart(due.filter(f=>card(f).b===card(due[0]).b));return {fact:easy?from(weakest,3):any(weakest),due:true,isNew:false};}
  const shaky=dk.filter(f=>card(f).n&&card(f).b<=2).length,unseen=apart(pool.filter(f=>!card(f).n));
  if(unseen.length&&shaky<SHAKY&&(sess.newHard||0)<HARD)return {fact:any(unseen),due:true,isNew:true};
  const rest=apart(seen.sort(by));
  if(rest.length)return {fact:from(rest,4),due:false,isNew:false};
  if(unseen.length)return {fact:any(unseen),due:true,isNew:true};
  return {fact:from(pool,pool.length),due:false,isNew:false};
}
function view(card){
  const c=clean(card)||clean({});
  return {seen:c.n,correct:c.c,avgMs:c.ms,last:c.l,due:c.d,level:c.b>=4&&c.q<2?4:Math.min(c.b,3),strength:c.b};
}
function mastery(cards,dk){let strong=0,learning=0;for(const f of dk){const v=view(cards[f.key]);if(v.seen){if(v.level>=4)strong++;else learning++;}}return {strong,learning,total:dk.length};}
return {clean,review,pick,view,mastery};
})();
