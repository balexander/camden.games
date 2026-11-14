// Big Hops: the game away from the page. A hopper stands on a number line of stepping stones and each question is an adding
// or subtracting fact. The second number becomes pebbles, each stone costs one pebble, and the player taps the stone to land on.
// Nothing is timed on screen: the score is how few hops it takes, so going through 10 beats counting by ones.
// No DOM, so test/hops.test.mjs can run it. The page (index.html) draws the state this file keeps.
// Loaded as a classic script (global Hops).
var Hops=(()=>{
const TOP=20;      // the line runs from 0 to 20
const ROUND=8;     // cards in a round
const STONES=13;   // the fewest stones shown, so the answer is never the only place to land
const MOST=10;     // the most pebbles in one question. More would need stones too small for a finger on a phone
// Gems unlock hoppers to play as: [gems needed, picture, name].
const FRIENDS=[[0,'🐸','Frog'],[15,'🐇','Rabbit'],[40,'🦗','Cricket'],[70,'🐿️','Squirrel'],[110,'🦘','Kangaroo'],[160,'🐢','Turtle'],[220,'🦊','Fox'],[290,'🐬','Dolphin'],[370,'🦖','Dino'],[460,'🦄','Unicorn']];
const whole=v=>Number.isFinite(+v)?Math.max(0,Math.round(+v)):0;

// Turns a fact from the question bank into a hop: where the hopper starts, how many pebbles, which way, and which stones show.
// Adding starts on the bigger number whichever way round the sum is written, because that is the shorter trip.
// Returns null for a fact that does not fit: one off the line, or one with more than MOST pebbles (the 45 facts like 19 − 16,
// which are better seen as the gap between two numbers than as a long trip back).
function ask(f,rnd=Math.random){
  if(!f||(f.op!=='add'&&f.op!=='sub'))return null;
  const add=f.op==='add',big=Math.max(f.a,f.b),small=Math.min(f.a,f.b),from=add?big:f.a,n=add?small:f.b,ans=f.ans;
  if(![from,n,ans].every(Number.isInteger)||n<1||n>MOST||from>TOP||ans>TOP||ans<0||ans!==from+(add?n:-n))return null;
  const text=add?(rnd()<.5?`${small} + ${big}`:`${big} + ${small}`):`${from} − ${n}`;
  // Spare stones on both sides, split by chance, so the answer's place on the screen gives nothing away.
  const lo0=Math.min(from,ans),hi0=Math.max(from,ans),pad=Math.max(4,STONES-1-(hi0-lo0)),left=2+Math.floor(rnd()*(pad-3));
  let lo=lo0-left,hi=hi0+pad-left;
  if(lo<0){hi=Math.min(TOP,hi-lo);lo=0;}
  if(hi>TOP){lo=Math.max(0,lo-(hi-TOP));hi=TOP;}
  return {key:f.key,op:f.op,text,from,n,dir:add?1:-1,ans,lo,hi};
}
const begin=q=>({pos:q.from,left:q.n,hops:[],over:''});
// One tap on stone v. Returns 'ignored' (not a stone ahead of the hopper), 'hop', 'landed' (the pebbles ran out: that stone is
// the answer) or 'far' (more stones than pebbles: a miss).
function hop(q,s,v){
  if(s.over||!Number.isInteger(v)||v<q.lo||v>q.hi)return 'ignored';
  const d=(v-s.pos)*q.dir;if(d<=0)return 'ignored';
  if(d>s.left){s.over='missed';return 'far';}
  s.hops.push([s.pos,v]);s.pos=v;s.left-=d;
  if(!s.left){s.over='landed';return 'landed';}
  return 'hop';
}
// How a finished trip is scored. One hop means the answer was known. Two hops that stop on a 5 or a 10 are the number
// strategies the game is teaching, and earn as much.
function rate(q,hops){
  const n=hops.length,landmark=n===2&&hops[0][1]%5===0;
  const kind=n===1?'known':landmark?'smart':n<=3?'chunks':'ones';
  return {kind,gems:{known:3,smart:3,chunks:2,ones:1}[kind]};
}
// What the scheduler is told. Only a single hop can count as known by heart: several hops is a right answer that was worked
// out, which the scheduler treats like asking for the hint. ms is the time to the tap; it is never shown to the player.
function answer(q,s,ms,fastMs){
  const ok=s.over==='landed';
  return {ok,ms,fastMs,hint:ok&&s.hops.length>1};
}
// The trip the hopper shows after a miss, and the words that go with it. hint is shown with the question and does not say
// the answer; say is shown with the hops.
function trick(q){
  const {from:g,n,ans}=q,t=(stops,hint,say)=>({stops,hint,say});
  if(q.dir>0){
    if(g<10&&ans>10)return t([10,ans],`${g} needs ${10-g} to make 10. Then hop the rest.`,`${g} needs ${10-g} to make 10. Then ${ans-10} more lands on ${ans}.`);
    if(g===10)return t([ans],`10 and ${n} more. One big hop.`,`10 and ${n} more is ${ans}.`);
    if(g>10&&ans===20)return t([ans],`${g-10} and ${n} are ten friends. That makes another ten.`,`${g-10} + ${n} = 10. Two tens are 20.`);
    if(g>10)return t([ans],`Keep the ten. Just do ${g-10} + ${n}.`,`${g-10} + ${n} = ${ans-10}. Put the ten back: ${ans}.`);
    if(ans===10)return t([ans],`${g} and ${n} are ten friends.`,`${g} + ${n} = 10. Ten friends!`);
    return t([ans],`Start on ${g}. Hop ${n} more.`,`From ${g}, ${n} more lands on ${ans}.`);
  }
  if(n===10)return t([ans],'Take away the ten. One big hop.',`${g} take away 10 leaves ${ans}.`);
  if(g>10&&ans<10)return t([10,ans],`Hop back ${g-10} to land on 10. Then hop the rest.`,`Back ${g-10} to 10. Then ${n-(g-10)} more back lands on ${ans}.`);
  if(g===10)return t([ans],`${n} has a ten friend. Who is it?`,`${n} + ${ans} = 10, so 10 − ${n} = ${ans}.`);
  if(g===20)return t([ans],`20 is two tens. Take ${n} from one of them.`,`10 − ${n} = ${10-n}. Put the other ten back: ${ans}.`);
  if(g>10)return t([ans],`Keep the ten. Just do ${g-10} − ${n}.`,`${g-10} − ${n} = ${ans-10}. Put the ten back: ${ans}.`);
  return t([ans],`Start on ${g}. Hop back ${n}.`,`From ${g}, back ${n} lands on ${ans}.`);
}
// How many hoppers these gems have unlocked, and how many gems the next one needs (null when all are out).
const friends=gems=>FRIENDS.filter(([need])=>whole(gems)>=need).length;
const nextFriend=gems=>FRIENDS[friends(gems)]?.[0]??null;
// The game's saved data, kept in profile.games['big-hops']: gems caught in all, the best round, rounds played,
// which facts to ask, and the hopper picked.
function clean(g){
  g=g&&typeof g==='object'&&!Array.isArray(g)?g:{};
  const gems=whole(g.gems);
  return {gems,best:whole(g.best),rounds:whole(g.rounds),ops:['both','add','sub'].includes(g.ops)?g.ops:'both',pal:Math.min(whole(g.pal),friends(gems)-1)};
}
return {TOP,ROUND,STONES,MOST,FRIENDS,ask,begin,hop,rate,answer,trick,friends,nextFriend,clean};
})();
