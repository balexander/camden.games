// The scheduler: spaced repetition for every game on the site. It decides which card to ask next and what an answer does to a card.
// This file is the whole algorithm and nothing else. To try a different one, rewrite the inside of this file and keep the five
// functions it returns behaving as described here and in README.md ("The scheduler"). test/srs.test.mjs checks them.
//
// Games never look inside a saved card. They keep whatever review() gives back, and call view() for anything they show.
//   clean(saved)                     -> a valid card, or null. Must accept cards saved by every earlier version of this file.
//   review(card, answer, now)        -> the card after an answer. card is undefined the first time.
//                                       answer = {ok, ms, fastMs, due}: right or wrong, time taken, the time that counts as quick
//                                       for this card, and due=false when the card was asked early as extra practice.
//   pick(cards, deck, session, now, rnd) -> {fact, due, isNew}: the next card from deck (a list of objects with a unique .key).
//                                       cards maps key -> card. session = {recent: [keys just asked], order: 'random'|'easy',
//                                       newHard: new cards that went badly so far}. rnd is Math.random or a test stand-in.
//   view(card)                       -> {seen, correct, avgMs, last, due, level, strength} for display:
//                                       level 0 = not seen, 1 = just missed, 2 and 3 = learning, 4 = strong;
//                                       strength is any number that goes up as the card gets better known.
//   mastery(cards, deck)             -> {strong, learning, total} for a deck.
//
// Loaded as a classic script (global SRS) so games work when opened straight from a file.
var SRS=(()=>{
const HOUR=36e5,DAY=864e5;
// Leitner boxes. Box 1 comes back within the round; a card is "strong" from box 4.
const INTERVALS=[0,0,8*HOUR,2*DAY,5*DAY,12*DAY,30*DAY],MAXBOX=6,STRONG=4;
const num=v=>Number.isFinite(+v)?+v:0;
// A saved card: b box, d when it is due, n times seen, c times right, ms average time of right answers, l when last seen.
function clean(c){
  if(!c||typeof c!=='object'||Array.isArray(c))return null;
  return {b:Math.max(0,Math.min(MAXBOX,num(c.b))),d:num(c.d),n:num(c.n),c:num(c.c),ms:num(c.ms),l:num(c.l)};
}
function review(card,{ok,ms,fastMs,due=true},now){
  const c=card?{...card}:{b:0,d:0,n:0,c:0,ms:0},isNew=!c.n;c.n++;c.l=now;
  if(!ok){c.b=1;c.d=now;return c;}
  c.c++;c.ms=c.ms?Math.round(c.ms*.6+ms*.4):Math.round(ms);
  const fast=ms<=fastMs;
  if(isNew)c.b=fast?3:2;                       // already known: skip the beginner boxes
  else if(due||c.b<=2){if(fast||c.b<=1)c.b=Math.min(MAXBOX,c.b+1);}   // slow but right: stay put
  else return c;                               // early review of a solid card: schedule untouched
  c.d=now+INTERVALS[c.b];return c;
}
// Order: cards that are due (weakest box first), then a new card if few are shaky, then extra practice.
// New cards come in random order unless session.order is 'easy', which introduces the first ones in the deck first.
function pick(cards,dk,sess,now,rnd=Math.random){
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
function view(card){
  const c=card&&typeof card==='object'?card:{},seen=num(c.n),b=seen?num(c.b):0;
  return {seen,correct:num(c.c),avgMs:num(c.ms),last:num(c.l),due:num(c.d),level:Math.min(b,STRONG),strength:b};
}
function mastery(cards,dk){let strong=0,learning=0;for(const f of dk){const v=view(cards[f.key]);if(v.seen){if(v.level>=4)strong++;else learning++;}}return {strong,learning,total:dk.length};}
return {clean,review,pick,view,mastery};
})();
