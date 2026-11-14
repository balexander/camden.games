// Profiles: who is playing, shared by every game on the site. One account (the sign-in) holds any number of profiles, and a
// profile carries its name, its buddy picture and its cards (the scheduler's record of what this person knows), so progress made
// in one game counts in all of them.
//
// Every change is written to this browser's storage straight away. A copy is also kept online, one document per profile: on the
// site under the name and password the grown-up signs in with, and inside Claude in the viewer's account store. Whichever copy
// of a profile was changed last wins.
//
// What a game may touch in a profile p:
//   p.id, p.name, p.av        read only
//   p.cards                   the scheduler's cards, keyed by card key. Change them only with SRS.review, then call Profiles.save(p).
//   p.games[<game folder>]    that game's own data (scores, settings): a small plain object. Fact Dash is older than this rule and
//                             keeps its data at the top level of the profile (set, rounds, best, stars, days, subject).
// The storage key is still called factdash.v1, from when Fact Dash was the whole site. Renaming it would strand saved progress.
//
// Loaded as a classic script after core.js (global Profiles). It needs a page, so it has no tests of its own; Core.cleanPlayer,
// which every profile passes through, is tested in test/app.test.mjs.
var Profiles=(()=>{
const KEY='factdash.v1',ACCT_KEY='factdash.account',PICKED='camden.picked',DATA='data/profiles';
const inClaude=!!window.claude?.use,online=/^https?:$/.test(location.protocol)&&!inClaude;
let db={v:1,players:[],cur:null,words:[]};
try{const raw=JSON.parse(localStorage.getItem(KEY));if(raw?.v===1&&Array.isArray(raw.players))db=raw;}catch{}
// Saved data is checked field by field on the way in, which also fills in anything an older save lacks.
db.words=Core.cleanWords(db.words);db.gone=db.gone&&typeof db.gone==='object'?db.gone:{};db.players=(Array.isArray(db.players)?db.players:[]).map(Core.cleanPlayer).filter(Boolean);if(!db.players.some(p=>p.id===db.cur))db.cur=null;
try{localStorage.removeItem('factdash.sync');}catch{}   // a sync code left by an earlier version

// A page asks to be told when data arrives (redraw is true when what is on screen may have changed), and says which profile
// is in the middle of a round so that it is never swapped out from under the player.
const listeners=[];let busy=()=>null,sync=inClaude?'checking':'local',notice='';
const tell=redraw=>listeners.forEach(f=>{try{f(redraw);}catch{}});
const store=()=>{try{localStorage.setItem(KEY,JSON.stringify(db));}catch{}};
// save(p) records a change to one profile and saveMeta() a change to the shared word list. Both also go online when signed in.
const save=p=>{if(p){p.updated=Date.now();push(p.id);}store();};
const saveMeta=()=>{db.metaUpdated=Date.now();push('meta');store();};
const me=()=>db.players.find(p=>p.id===db.cur);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function add(name,av){const p=Core.cleanPlayer({id:uid(),name,av,created:Date.now()});if(!p)return null;db.players.push(p);db.cur=p.id;save(p);return p;}
// The home page remembers, for this browser tab, that someone was just picked, so a game opened from it does not ask again.
function choose(id){db.cur=db.players.some(p=>p.id===id)?id:null;store();try{if(db.cur)sessionStorage.setItem(PICKED,'1');else sessionStorage.removeItem(PICKED);}catch{}}
const picked=()=>{try{return !!me()&&sessionStorage.getItem(PICKED)==='1';}catch{return false;}};
function remove(id){if(!db.players.some(p=>p.id===id))return;db.gone[id]=Date.now();db.players=db.players.filter(p=>p.id!==id);if(db.cur===id)db.cur=null;push(id);saveMeta();}

let col=null,chain=Promise.resolve(),flushTimer=null;const dirty=new Set();
function push(id){if(!col)return;dirty.add(id);clearTimeout(flushTimer);flushTimer=setTimeout(flush,700);}
function flush(){clearTimeout(flushTimer);const ids=[...dirty];dirty.clear();
  for(const id of ids)chain=chain.then(()=>writeDoc(id)).then(()=>{if(sync==='error'){sync=inClaude?'account':'site';tell(false);}},()=>{if(!col)return;sync='error';dirty.add(id);tell(false);});
  return chain;}
function writeDoc(id){
  if(id==='meta')return col.doc('meta').set({updated:db.metaUpdated||1,json:JSON.stringify({words:db.words,gone:db.gone})});
  const p=db.players.find(x=>x.id===id);return p?col.doc('p_'+id).set({name:p.name,updated:p.updated||1,json:JSON.stringify(p)}):col.doc('p_'+id).delete();
}
// On the site, signing in keeps the profiles in the site's own database. The browser holds the sign-in cookie; this key only remembers the name.
const account=()=>{try{return Core.cleanLogin(localStorage.getItem(ACCT_KEY));}catch{return '';}};
const setAcct=n=>{try{if(n)localStorage.setItem(ACCT_KEY,n);else localStorage.removeItem(ACCT_KEY);}catch{}};
const api=async(method,path,body)=>{const r=await fetch('/api/'+path,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body),cache:'no-store'});
  if(r.status===401&&path.startsWith(DATA))signedOut();
  if(!r.ok)throw Object.assign(Error('api '+r.status),{status:r.status});return r.json();};
function signedOut(){if(!account())return;setAcct('');col=null;sync='local';notice='This device was signed out. Sign in again to keep saving online.';tell(true);}
const remoteCol={get:async()=>({docs:(await api('GET',DATA)).docs.map(d=>({id:d.id,data:()=>d}))}),doc:id=>({set:o=>api('PUT',DATA+'/'+id,o),delete:()=>api('DELETE',DATA+'/'+id)})};
const timeout=()=>new Promise((_,no)=>setTimeout(()=>no(Error('timeout')),10000));
async function connectSite(){
  if(!online||!account()){sync='local';return tell(true);}
  try{const snap=await Promise.race([remoteCol.get(),timeout()]);col=remoteCol;merge(snap.docs);sync='site';}
  catch{col=null;if(account())sync='error';}
  tell(true);
}
// Called once when a page opens, and again whenever it wants the latest (coming back to the tab, "Sync now").
async function connect(){
  if(!inClaude)return connectSite();
  try{
    const [store2,user]=await Promise.all([claude.use('db'),claude.use('user')]),id=store2&&user?await user.id():null;
    if(!id){sync='local';return tell(true);}
    const c=store2.collection('data/users/'+id),snap=await Promise.race([c.get(),timeout()]);
    col=c;merge(snap.docs);sync='account';
  }catch{sync='error';}
  tell(true);
}
function merge(docs){
  const remote={};let meta=null;
  for(const d of docs){try{const b=d.data();if(!b)continue;if(d.id==='meta')meta={...JSON.parse(b.json),updated:+b.updated||0};else if(d.id.startsWith('p_')){const p=Core.cleanPlayer(JSON.parse(b.json));if(p)remote[p.id]=p;}}catch{}}
  const theirs=meta&&typeof meta.gone==='object'&&meta.gone||{},gone={...theirs};for(const [k,v] of Object.entries(db.gone))gone[k]=Math.max(+v||0,+gone[k]||0);
  let metaDirty=Object.keys(gone).some(k=>gone[k]!==theirs[k]);
  if(meta&&meta.updated>(db.metaUpdated||0)){db.words=Core.cleanWords(meta.words);db.metaUpdated=meta.updated;}else if((db.metaUpdated||0)>(meta?.updated||0))metaDirty=true;
  db.gone=gone;
  const held=busy(),out=[];   // never swap out a profile in the middle of a round
  for(const l of db.players){const r=remote[l.id];delete remote[l.id];l.updated=l.updated||1;
    if(l.id!==held&&gone[l.id]>=l.updated)continue;                          // removed on another device
    if(r&&l.id!==held&&r.updated>l.updated)out.push(r);                      // changed more recently elsewhere
    else{out.push(l);if(!r||l.updated>r.updated)push(l.id);}}
  for(const r of Object.values(remote)){if(gone[r.id]>=r.updated)push(r.id);else out.push(r);}
  db.players=out;if(!me())db.cur=null;
  if(metaDirty)push('meta');store();
}
// Signs in ('login') or creates the account ('signup'), then merges this device's profiles with the account's.
// Returns {ok:true}, or {ok:false, status} where status is the server's answer (401 wrong, 409 taken, 429 locked, 403 closed) or undefined when it could not be reached.
async function signIn(path,name,password){
  try{await api('POST',path,{name,key:await Core.passKey(name,password)});}catch(e){return {ok:false,status:e.status};}
  setAcct(name);sync='checking';tell(true);await connectSite();return {ok:true};
}
async function signOut(){await flush();api('POST','logout').catch(()=>{});setAcct('');col=null;sync='local';tell(true);}
return {db,me,add,choose,picked,remove,save,saveMeta,store,uid,connect,flush,signIn,signOut,account,online,inClaude,
  on:f=>{listeners.push(f);},busyWith:f=>{busy=f;},
  get status(){return sync;},set status(v){sync=v;},   // 'local', 'checking', 'site', 'account' (inside Claude) or 'error'
  takeNotice(){const n=notice;notice='';return n;}};
})();
