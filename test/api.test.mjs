// Runs the real Worker in Cloudflare's local runtime (wrangler dev) with a throwaway database, and signs in the way the page does.
import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const root=new URL('..',import.meta.url),bin=new URL('node_modules/wrangler/bin/wrangler.js',root),port=14319,origin=`http://127.0.0.1:${port}`;

test('accounts: sign up, sign in, save players, and keep everyone else out',{skip:!existsSync(bin)&&'wrangler is not installed (npm install)',timeout:90000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'factdash-')),child=spawn(process.execPath,[bin.pathname,'dev','--port',String(port),'--persist-to',dir,'--show-interactive-dev-session=false'],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'},stdio:'ignore'});
 t.after(()=>{child.kill();rmSync(dir,{recursive:true,force:true});});
 for(let i=0;;i++){try{if((await fetch(origin+'/')).ok)break;}catch{}if(i>150)throw Error('wrangler dev did not start');await new Promise(r=>setTimeout(r,200));}
 // A tiny browser: keeps the cookie the server sets and sends it back.
 const device=()=>{let jar='';return async(method,path,body,headers={})=>{
  const r=await fetch(origin+'/api/'+path,{method,headers:{'content-type':'application/json',...(jar&&{cookie:jar}),...headers},body:body&&JSON.stringify(body)}),set=r.headers.get('set-cookie');
  if(set){assert.match(set,/; Path=\/api; HttpOnly; SameSite=Strict; Max-Age=\d+/);jar=/^fd=;/.test(set)?'':set.split(';')[0];}
  return {status:r.status,body:await r.json(),cookie:set};};};
 const key=c=>c.repeat(64),phone=device(),laptop=device(),stranger=device(),doc={name:'Sam',updated:200,json:'{"v":2}'};

 for(const p of ['/','/fact-dash/'])assert.equal((await fetch(origin+p)).headers.get('content-type').split(';')[0],'text/html',p+' is served');
 assert.equal((await stranger('GET','data/fact-dash')).status,401,'nothing is readable before signing in');
 for(const bad of [{name:'ab',key:key('a')},{name:'two words',key:key('a')},{name:'sam',key:'short'},{name:'sam'},null])assert.equal((await stranger('POST','signup',bad)).status,400);
 assert.equal((await stranger('POST','login',{name:'sam',key:key('a')})).status,401,'no account yet');

 let r=await phone('POST','signup',{name:' Sam ',key:key('a')});assert.equal(r.status,200);assert.equal(r.body.name,'sam');assert.ok(!r.cookie.includes(key('a')),'the cookie is not the password key');
 assert.equal((await stranger('POST','signup',{name:'SAM',key:key('b')})).status,409,'a name can only be taken once');
 assert.deepEqual((await phone('GET','data/fact-dash')).body,{docs:[],name:'sam'});
 assert.equal((await phone('PUT','data/fact-dash/p_abc',doc)).status,200);
 assert.equal((await phone('PUT','data/fact-dash/p_abc',{name:'Old',updated:100,json:'{"v":1}'})).status,200);
 assert.equal((await phone('PUT','data/fact-dash/meta',{updated:5,json:'{"words":[]}'})).status,200);

 assert.equal((await laptop('POST','login',{name:'sam',key:key('b')})).status,401,'wrong password');
 assert.equal((await laptop('GET','data/fact-dash')).status,401);
 r=await laptop('POST','login',{name:'Sam',key:key('a')});assert.equal(r.status,200);
 r=await laptop('GET','data/fact-dash');assert.deepEqual(r.body.docs.find(d=>d.id==='p_abc'),{id:'p_abc',...doc},'the second device sees the newest copy');assert.equal(r.body.docs.length,2);
 assert.match(r.cookie,/Max-Age=34560000/,'using the app renews the sign-in');

 assert.equal((await stranger('POST','signup',{name:'other',key:key('c')})).status,200);
 assert.deepEqual((await stranger('GET','data/fact-dash')).body.docs,[],'another account sees none of it');
 for(const [m,p,b,want] of [['PUT','data/fact-dash/BAD.ID',doc,400],['PUT','data/fact-dash/p_abc',{json:5},400],['POST','data/fact-dash',null,405],['GET','nope',null,404],['GET','login',null,405]])assert.equal((await phone(m,p,b)).status,want,m+' '+p);
 assert.equal((await phone('PUT','data/fact-dash/p_abc',doc,{origin:'https://evil.example'})).status,403,'other sites cannot write with our cookie');
 assert.equal((await fetch(origin+'/api/data/fact-dash',{headers:{cookie:'fd='+key('0')+'.sam'}})).status,401,'a made-up cookie is refused');

 for(const p of ['sync','data/other-game','data/fact-dash/p_abc/extra'])assert.equal((await phone('GET',p)).status,404,p+' is not a place to save');
 assert.equal((await laptop('DELETE','data/fact-dash/p_abc')).status,200);assert.equal((await phone('GET','data/fact-dash')).body.docs.length,1);
 assert.equal((await laptop('POST','logout')).status,200);assert.equal((await laptop('GET','data/fact-dash')).status,401);
 assert.equal((await phone('GET','data/fact-dash')).status,200,'signing out one device leaves the other signed in');

 for(let i=0;i<10;i++)assert.equal((await stranger('POST','login',{name:'sam',key:key('d')})).status,401);
 assert.equal((await laptop('POST','login',{name:'sam',key:key('a')})).status,429,'ten wrong passwords lock new sign-ins, even with the right one');
 assert.equal((await phone('GET','data/fact-dash')).status,200,'and a device already signed in keeps working');
});
