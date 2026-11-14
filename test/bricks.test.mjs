// Tests for Brain Bricks' logic (site/brain-bricks/game.js): the level pictures and worlds, each kind of brick, the capsules,
// the boosts quiz answers earn, ball speed, scoring and stars, and saved data. A robot paddle plays every level to prove that
// each one can be cleared. The robot stands in for a player: it shows a level is possible, not that it is fun.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ctx={};vm.runInNewContext(readFileSync(new URL('../site/brain-bricks/game.js',import.meta.url),'utf8'),ctx);
const B=ctx.Bricks,plain=v=>JSON.parse(JSON.stringify(v)),near=(a,b,eps=1e-6)=>Math.abs(a-b)<=eps;

// ---------- helpers ----------
// Fixed randomness. none never drops a capsule from a plain brick (the chance is 6%); seeded gives a repeatable stream.
const none=()=>.99;
const seeded=a=>()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
// Steps the game for secs seconds at 120 frames a second and returns every event.
const run=(s,secs,rnd=none)=>{const ev=[];for(let i=0,n=Math.round(secs*120);i<n;i++)ev.push(...B.step(s,1/120,rnd));return ev;};
// A level with its bricks swapped for a test picture.
const field=(rows,opts,n=1)=>{const s=B.start(n,opts);s.bricks=B.build(rows);return s;};
// Replaces the balls with one moving ball.
const ball=(s,x,y,vx,vy)=>{s.serving=false;s.balls=[{x,y,vx,vy,stuck:false,off:0,hold:0,fire:false}];return s.balls[0];};
// Keeps the ball out of the way: it sits on the paddle for the whole test, so time can pass without it being lost.
const park=s=>{s.serving=false;s.effects.magnet=1e6;s.balls=[{x:s.paddle.x,y:B.PADDLE_Y-B.BALL_R,vx:0,vy:0,stuck:true,off:0,hold:1e6,fire:false}];return s;};
// Sends a ball straight up into the bottom of a brick and returns what happened.
const shoot=(s,k,rnd=none)=>{ball(s,k.x+k.w/2,k.y+k.h+B.BALL_R+2,0,-s.speed);return run(s,.05,rnd);};
const at=(s,row,col)=>s.bricks.find(k=>k.row===row&&k.col===col);
// Drops a capsule just above the paddle (or at x) and steps one frame.
const give=(s,kind,x=s.paddle.x)=>{s.capsules.push({x,y:B.PADDLE_Y-B.CAP_H/2-1,kind});return run(s,1/60);};
// Drops the ball onto the paddle, off centre by off, and returns what happened.
const bounce=(s,off=0)=>{ball(s,s.paddle.x+off,B.PADDLE_Y-20,0,s.speed);return run(s,.08);};
// Lets a ball fall past the paddle.
const drop=s=>{B.movePaddle(s,50);ball(s,300,B.H-30,0,s.speed);return run(s,.25);};
const types=ev=>ev.map(e=>e.type);
// The robot: a paddle that stays under the lowest ball, drifting a little so the ball leaves at different angles, and taps
// whenever a ball is waiting. Returns the state, the seconds it took and the events.
const robot=(s,secs,seed=1,check)=>{
  const rnd=seeded(seed*1000+s.level),seen=[];let t=0;
  while(!s.over&&t<secs){
    if(s.serving)B.launch(s,rnd);
    const low=s.balls.filter(b=>!b.stuck).reduce((a,b)=>!a||b.y>a.y?b:a,null);
    if(low)B.movePaddle(s,low.x+24*Math.sin(t*1.7));else B.launch(s,rnd);
    const ev=B.step(s,1/60,rnd);seen.push(...ev);t+=1/60;if(check)check(s,ev);
  }
  return {s,t,seen};
};
// Contrast between two colours as WCAG measures it (1 is none, 21 is black on white).
const lum=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
const contrast=(a,b)=>{const [hi,lo]=[lum(a),lum(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);};

// ---------- levels and worlds ----------
test('the 30 pictures are 8 wide, fit the field, and each world adds only what it should',()=>{
 assert.equal(B.PICTURES.length,30);assert.equal(B.WORLDS.length,6);
 const allowed=['.12','.12P','.12P#','.12P#*','.12P#*3','.12P#*3'],fresh=[null,'P','#','*','3',null];
 B.PICTURES.forEach((pic,i)=>{
  const w=Math.floor(i/5),n=i+1;assert.equal(B.charsFor(w),allowed[w]);
  for(const line of pic){assert.equal(line.length,8,'level '+n+' is 8 wide');for(const ch of line)assert.ok(allowed[w].includes(ch),'level '+n+' may not use '+ch);}
  if(fresh[w])assert.ok(pic.join('').includes(fresh[w]),'level '+n+' shows what its world introduces');
  const ks=B.level(n);assert.ok(B.left({bricks:ks})>=18,'level '+n+' has enough to break');
  for(const k of ks)assert.ok(k.x>=0&&k.x+k.w<=B.W&&k.y>=40&&k.y+k.h<B.PADDLE_Y-150,'level '+n+' is inside the field and well above the paddle');
 });
 for(const ch of 'P#*3')assert.ok(B.PICTURES.slice(25).some(p=>p.join('').includes(ch)),'the last world uses '+ch);
 assert.equal(new Set(B.PICTURES.map(p=>p.join('/'))).size,30,'no picture is used twice');
 const hits=n=>B.level(n).reduce((a,k)=>a+(k.kind==='steel'?0:k.hp),0);
 for(let w=0;w<6;w++)for(let i=1;i<5;i++)assert.ok(hits(w*5+5)>hits(w*5+i),'the fifth level of world '+(w+1)+' is its biggest');
 const one=B.level(1);assert.equal(one.length,24);assert.ok(one.every(k=>k.kind==='plain'&&k.hp===1&&k.max===1),'level 1 is 24 one-hit bricks');
 assert.deepEqual(plain(B.level(0)),plain(one));assert.deepEqual(plain(B.level('x')),plain(one));
});

test('after level 30 the pictures come round again tougher, and never run out',()=>{
 const hits=n=>B.level(n).reduce((a,k)=>a+(k.kind==='steel'?0:k.hp),0);
 assert.ok(hits(31)>hits(1)&&hits(61)>hits(31));assert.ok(B.level(31).every(k=>k.hp===2)&&B.level(61).every(k=>k.hp===3)&&B.level(91).every(k=>k.hp===3));
 for(const n of [35,50,60,90,999])for(const k of B.level(n)){assert.ok(k.hp>=1&&k.hp<=3&&k.max===k.hp);if(k.kind!=='plain')assert.equal(k.hp,1,'steel, bombs and power bricks do not get tougher');}
 assert.deepEqual(plain(B.level(45).map(k=>[k.row,k.col,k.kind])),plain(B.level(15).map(k=>[k.row,k.col,k.kind])));
});

test('worlds have names, level ranges, and colours that read on white and on dark navy',()=>{
 assert.equal(new Set(B.WORLDS.map(w=>w.name)).size,6);
 B.WORLDS.forEach((w,i)=>{assert.equal(w.first,i*5+1);assert.equal(w.last,i*5+5);assert.ok(w.name&&w.intro&&w.intro.length<=40);assert.ok(w.colors.length>=5);
  for(const c of w.colors){assert.match(c,/^#[0-9a-f]{6}$/);assert.ok(contrast(c,'#ffffff')>=2.8&&contrast(c,'#1c2440')>=2.8,w.name+' '+c+' reads on both fields');}});
 assert.deepEqual(plain(B.world(1)),{index:0,number:1,lap:0,...plain(B.WORLDS[0])});
 const w=B.world(33);assert.deepEqual([w.index,w.number,w.lap,w.first,w.last,w.name],[0,1,1,31,35,B.WORLDS[0].name]);
 assert.equal(B.world(30).number,6);assert.equal(B.world(6).number,2);assert.equal(B.start(17).world,3);assert.equal(B.start(47).lap,1);
});

test('new capsules arrive world by world',()=>{
 const caps=n=>[...B.capsulesFor(n)].sort().join();
 assert.equal(caps(1),'life,multi,wide');assert.equal(caps(5),caps(1));
 assert.equal(caps(6),'life,multi,shield,slow,wide');assert.equal(caps(11),'laser,life,multi,shield,slow,wide');
 assert.equal(caps(16),'laser,life,magnet,multi,shield,slow,wide');assert.equal(caps(21),'fire,laser,life,magnet,multi,shield,slow,wide');
 assert.equal(caps(30),caps(21));assert.equal(caps(31),caps(21),'the second lap has them all from the start');
 assert.deepEqual(Object.keys(B.CAPSULES).sort(),caps(30).split(','));
 for(const c of Object.values(B.CAPSULES))assert.ok(c.name&&c.text&&c.secs>=0);
 assert.deepEqual(['wide','slow','laser','magnet','fire'].map(k=>B.CAPSULES[k].secs),[20,12,8,15,6]);
});

// ---------- the robot ----------
test('a robot paddle clears every one of the 30 levels, and some from later laps',t=>{
 const times=[];
 for(const n of [...Array.from({length:30},(_,i)=>i+1),31,45,60,61,90]){
  const start=B.level(n),{s,t:secs,seen}=robot(B.start(n),400);times.push(n+': '+Math.round(secs)+' s');
  assert.equal(s.over,'won','level '+n+' can be cleared ('+B.left(s)+' left after '+Math.round(secs)+' s)');
  assert.ok(s.bricks.every(k=>k.kind==='steel'?k.hp===1:k.hp===0));
  assert.equal(seen.filter(e=>e.type==='break').length,start.filter(k=>k.kind!=='steel').length,'every brick breaks once');
  assert.equal(seen.at(-1).type,'won');assert.equal(s.lost,0);assert.equal(B.stars(s),3);
  if(n===1)assert.ok(secs<120,'level 1 is short for the robot ('+Math.round(secs)+' s)');
  if(n<=30)assert.ok(secs<200,'level '+n+' is not a slog for the robot ('+Math.round(secs)+' s)');
 }
 t.diagnostic('robot clear times at normal speed: '+times.join(', '));
});

test('the ball stays in the field and at the designed speed through a whole level of capsules and steel',()=>{
 for(const [n,speed] of [[12,'normal'],[20,'fast'],[30,'chill']]){
  const s=B.start(n,{speed,boosts:['ball','slow','laser'],top:30}),base=s.base;let balls=0;
  robot(s,400,7,(s,ev)=>{
   balls=Math.max(balls,s.balls.length);assert.ok(s.balls.length<=B.MAX_BALLS);
   const steps=Math.round((s.speed/base/(s.effects.slow>0?.7:1)-1)/.02);
   assert.ok(steps>=0&&steps<=10&&near(s.speed,base*(1+.02*steps)*(s.effects.slow>0?.7:1)),'the speed is one of the designed values');
   for(const b of s.balls){
    assert.ok(b.x>=B.BALL_R-1e-9&&b.x<=B.W-B.BALL_R+1e-9&&b.y>=B.BALL_R-1e-9&&b.y<=B.H+B.BALL_R+8,'the ball is inside the walls');
    if(b.stuck)assert.ok(b.vx===0&&b.vy===0&&Math.abs(b.x-s.paddle.x)<=s.paddle.w/2+1e-9);
    // In the frame the rally speed steps up, balls that had already moved catch up on the next step.
    else assert.ok(near(Math.hypot(b.vx,b.vy),s.speed,ev.some(e=>e.type==='faster')?s.speed*.03:1e-6),'the ball keeps the level speed');
    assert.ok(b.stuck||Math.abs(b.vy)>=s.speed*.17,'the ball never goes flat');
   }
   for(const c of s.capsules)assert.ok(B.capsulesFor(n).includes(c.kind));
   for(const v of Object.values(s.effects))assert.ok(v>=0&&v<=20);
   assert.ok(s.lives<=B.MAX_LIVES&&s.paddle.x>=s.paddle.w/2&&s.paddle.x<=B.W-s.paddle.w/2);
  });
  assert.equal(s.over,'won');assert.ok(balls>1,'more than one ball was in play in level '+n);
 }
});

// ---------- serving, lives, the end of a level ----------
test('the ball waits on the paddle until a tap, and no time passes while it waits',()=>{
 const s=B.start(1),before=plain(s);assert.equal(s.serving,true);assert.equal(s.balls[0].stuck,true);
 assert.deepEqual(plain(run(s,1)),[]);assert.deepEqual(plain(s),before,'nothing moves until launch');
 B.movePaddle(s,-50);assert.equal(s.paddle.x,s.paddle.w/2,'the paddle stops at the wall');assert.equal(s.balls[0].x,s.paddle.x,'and carries the waiting ball');
 B.movePaddle(s,NaN);assert.equal(s.paddle.x,s.paddle.w/2);
 B.movePaddle(s,180);assert.equal(B.launch(s,()=>.3),true);assert.equal(s.serving,false);
 const b=s.balls[0];assert.ok(b.vy<0&&!b.stuck,'the ball goes up');assert.ok(near(Math.hypot(b.vx,b.vy),310));
 assert.equal(B.launch(s),false,'a tap with nothing waiting does nothing');assert.equal(s.balls.length,1);
 assert.deepEqual(plain(B.step(s,0)),[]);assert.deepEqual(plain(B.step(s,-1)),[]);assert.deepEqual(plain(B.step(s,NaN)),[]);
 assert.deepEqual(plain(s),JSON.parse(JSON.stringify(s)),'the state is plain data');
 for(const key of ['level','world','lap','speedName','bricks','paddle','balls','capsules','shots','effects','wideAll','shield','lives','lost','score','combo','serving','over','speed','base','rally','time','idle','boosts','extraBall'])assert.ok(key in s,'the state has '+key);
});

test('missing the ball costs a life, three misses end the level, and then nothing moves',()=>{
 const s=B.start(1);B.launch(s,none);s.effects.wide=5;
 let ev=drop(s);assert.deepEqual(plain(ev.filter(e=>e.type==='lost')),[{type:'lost',lives:2}]);
 assert.equal(s.lives,2);assert.equal(s.lost,1);assert.equal(s.serving,true,'the next ball waits on the paddle');assert.equal(s.balls.length,1);assert.equal(s.balls[0].x,s.paddle.x);
 assert.ok(s.effects.wide>4,'a timed effect is kept, and does not run down while the ball waits');
 // With two balls, losing one costs nothing.
 B.launch(s,none);const up=ball(s,300,B.H-30,0,s.speed);s.balls.push({...up,x:100,y:300,vy:-s.speed});
 ev=run(s,.2);assert.ok(types(ev).includes('drain')&&!types(ev).includes('lost'));assert.equal(s.lives,2);assert.equal(s.balls.length,1);
 assert.ok(types(drop(s)).includes('lost'));B.launch(s,none);
 ev=drop(s);assert.equal(ev.at(-1).type,'over');assert.equal(s.over,'lost');assert.equal(s.lives,0);assert.equal(s.lost,3);assert.equal(B.stars(s),0);
 const frozen=plain(s);assert.deepEqual(plain(run(s,1)),[]);assert.equal(B.launch(s),false);assert.deepEqual(plain(s),frozen,'nothing moves after the level is lost');
});

// ---------- bricks ----------
test('two-hit and three-hit bricks take that many hits, and only breaking scores',()=>{
 const s=field(['32......']),three=at(s,0,0),two=at(s,0,1);
 assert.deepEqual(plain(shoot(s,three).filter(e=>e.type!=='wall')),[{type:'hit',x:three.x+three.w/2,y:three.y+three.h/2,row:0,col:0,kind:'plain',hp:2,by:'ball'}]);
 assert.equal(three.hp,2);assert.equal(three.max,3);assert.ok(s.balls[0].vy>0,'the ball bounces back');assert.equal(s.score,0);
 assert.deepEqual(types(shoot(s,three)),['hit']);assert.equal(three.hp,1);
 const ev=shoot(s,three);assert.deepEqual(plain(ev),[{type:'break',x:three.x+three.w/2,y:three.y+three.h/2,row:0,col:0,kind:'plain',by:'ball',points:10,combo:1}]);
 assert.equal(three.hp,0);assert.equal(s.score,10);assert.equal(B.left(s),1);
 assert.deepEqual(types(shoot(s,two)),['hit']);assert.equal(s.over,null);
 assert.deepEqual(types(shoot(s,two)),['break','won']);assert.equal(s.over,'won');
});

test('steel never breaks, bounces the ball, and does not need clearing',()=>{
 const s=field(['#1......']),steel=at(s,0,0);assert.equal(steel.kind,'steel');assert.equal(B.left(s),1);
 for(let i=0;i<5;i++){const ev=shoot(s,steel);assert.deepEqual(types(ev),['steel']);assert.equal(ev[0].by,'ball');assert.ok(s.balls[0].vy>0);}
 assert.equal(steel.hp,1);assert.equal(s.score,0);assert.equal(s.over,null);
 assert.deepEqual(types(shoot(s,at(s,0,1))),['break','won'],'the level is won with the steel still there');assert.equal(steel.hp,1);
});

test('a bomb hits the eight bricks around it for 3, chains to other bombs, and leaves steel alone',()=>{
 const s=field(['323.....','2*#.....','11*1....','...13...']);
 const ev=shoot(s,at(s,2,2)),broke=ev.filter(e=>e.type==='break');
 assert.equal(ev.filter(e=>e.type==='boom').length,2,'the second bomb goes off too');
 assert.deepEqual(broke.map(e=>e.row+','+e.col).sort(),['0,0','0,1','0,2','1,0','1,1','2,0','2,1','2,2','2,3','3,3']);
 assert.equal(broke[0].by,'ball');assert.ok(broke.slice(1).every(e=>e.by==='bomb'));
 assert.equal(at(s,1,2).kind,'steel');assert.equal(at(s,1,2).hp,1,'steel is unharmed');
 assert.equal(at(s,3,4).hp,3,'a brick two columns away is untouched');assert.equal(B.left(s),1);
 assert.deepEqual(broke.map(e=>e.points),[10,10,10,20,20,20,30,30,30,40],'bomb breaks build the combo');assert.equal(s.combo,10);
 // A bomb does 3 hits, not an outright break, and a lone bomb wins the level when it was the last brick.
 const lone=field(['*.......']);assert.deepEqual(types(shoot(lone,at(lone,0,0))),['break','boom','won']);
});

test('power bricks always drop a capsule; other bricks do about one time in 17',()=>{
 for(const r of [0,.05,.06,.5,.99]){
  const s=field(['P1......'],{},6),ev=shoot(s,at(s,0,0),()=>r);
  assert.deepEqual(types(ev),['break','drop']);assert.equal(s.capsules.length,1);assert.ok(B.capsulesFor(6).includes(s.capsules[0].kind));
  assert.equal(at(s,0,0).kind,'power');assert.equal(at(s,0,0).max,1);
  assert.equal(types(shoot(s,at(s,0,1),()=>r)).includes('drop'),r<.06,'a plain brick drops only on a low roll ('+r+')');
 }
 // Over many bricks with a repeatable random stream, plain bricks drop near 6% of the time.
 const rnd=seeded(5);let drops=0;
 for(let i=0;i<400;i++){const s=field(['1.......','.......1']);drops+=types(shoot(s,at(s,0,0),rnd)).includes('drop')?1:0;}
 assert.ok(drops>=10&&drops<=40,drops+' drops in 400 bricks');
});

test('which capsule falls: only useful ones, and a life is rare and comes once a level',()=>{
 const kinds=(setup)=>{const out={};for(let i=0;i<200;i++){const s=field(['P1......'],{},30);setup(s);shoot(s,at(s,0,0),()=>(i+.5)/200);out[s.capsules[0].kind]=(out[s.capsules[0].kind]||0)+1;}return out;};
 const all=kinds(()=>{});assert.deepEqual(Object.keys(all).sort(),Object.keys(B.CAPSULES).sort(),'every capsule can fall in the last world');
 assert.ok(all.life<=8,'a life is rare ('+all.life+' in 200)');assert.ok(all.wide>all.life*3);
 assert.equal(kinds(s=>{s.shield=true;}).shield,undefined,'no shield while one is up');
 assert.equal(kinds(s=>{s.lives=B.MAX_LIVES;}).life,undefined,'no life at 5 lives');
 assert.equal(kinds(s=>{s.lifeDropped=true;}).life,undefined,'no second life in a level');
 assert.equal(kinds(s=>{s.wideAll=true;}).wide,undefined,'no wide capsule when the paddle is wide all level');
});

// ---------- capsules ----------
test('capsules fall at 120 a second, score 50 when caught, and cost nothing when missed',()=>{
 const s=park(B.start(1));B.movePaddle(s,60);
 s.capsules.push({x:300,y:200,kind:'multi'});run(s,1);assert.ok(near(s.capsules[0].y,320,1e-6));
 const ev=run(s,3);assert.deepEqual(plain(ev),[{type:'miss',x:300,y:B.H,kind:'multi'}]);
 assert.equal(s.capsules.length,0);assert.equal(s.score,0);assert.equal(s.lives,3);assert.equal(s.lost,0);assert.equal(s.balls.length,1);assert.equal(s.over,null);
 assert.deepEqual(plain(give(s,'slow')),[{type:'catch',x:60,y:B.PADDLE_Y,kind:'slow',points:50}]);assert.equal(s.score,50);assert.equal(s.capsules.length,0);
 // The edge of the paddle is enough to catch one.
 s.capsules.push({x:60+s.paddle.w/2+B.CAP_W/2-1,y:B.PADDLE_Y-B.CAP_H/2-1,kind:'life'});run(s,1/60);assert.equal(s.lives,4);
});

test('wide: the paddle is 1.5 times as wide for 20 s, and catching another starts the time again',()=>{
 const s=park(B.start(1));assert.equal(s.paddle.w,B.PADDLE_W);
 give(s,'wide');assert.equal(s.paddle.w,B.PADDLE_W*1.5);assert.ok(near(s.effects.wide,20,.02));
 run(s,12);assert.ok(near(s.effects.wide,8,.02));give(s,'wide');assert.ok(near(s.effects.wide,20,.02));
 assert.deepEqual(plain(run(s,19.9)),[]);assert.equal(s.paddle.w,B.PADDLE_W*1.5);
 assert.deepEqual(plain(run(s,.2)),[{type:'expire',kind:'wide'}]);assert.equal(s.paddle.w,B.PADDLE_W);assert.equal(s.effects.wide,0);
 // A wide paddle against the wall stays inside the field.
 B.movePaddle(s,0);give(s,'wide');assert.equal(s.paddle.x,s.paddle.w/2);
});

test('every timed capsule starts again when caught again',()=>{
 for(const kind of ['wide','slow','laser','magnet','fire']){
  const s=park(field(['........']));s.bricks=B.build(['3.......']);
  give(s,kind);assert.ok(near(s.effects[kind],B.CAPSULES[kind].secs,.02),kind+' starts');
  run(s,3);assert.ok(near(s.effects[kind],B.CAPSULES[kind].secs-3,.03));
  give(s,kind);assert.ok(near(s.effects[kind],B.CAPSULES[kind].secs,.02),kind+' starts again');
 }
});

test('multi: every ball splits into three, and there are never more than 9',()=>{
 const s=B.start(1);B.launch(s,none);const sizes=[];
 for(let i=0;i<4;i++){give(s,'multi');sizes.push(s.balls.length);}
 assert.deepEqual(sizes,[3,9,9,9]);
 assert.equal(new Set(s.balls.map(b=>Math.round(Math.atan2(b.vx,-b.vy)*100))).size>=5,true,'the balls fan out');
 run(s,.02);for(const b of s.balls)assert.ok(near(Math.hypot(b.vx,b.vy),s.speed));
 // Two balls become six.
 const two=B.start(1,{boosts:['ball']});B.launch(two,none);give(two,'multi');assert.equal(two.balls.length,6);
});

test('slow: the ball goes at 0.7 speed for 12 s',()=>{
 const s=B.start(1);ball(s,180,300,0,-s.speed);
 give(s,'slow');assert.ok(near(s.speed,310*.7));run(s,.02);assert.ok(near(Math.hypot(s.balls[0].vx,s.balls[0].vy),217));
 const p=park(B.start(1));give(p,'slow');assert.deepEqual(plain(run(p,11.9)),[]);assert.ok(near(p.speed,217));
 assert.deepEqual(plain(run(p,.2)),[{type:'expire',kind:'slow'}]);assert.equal(p.speed,310);
});

test('laser: a pair of shots every 0.45 s for 8 s, one hit each, stopped by steel',()=>{
 const s=park(field(['12......','#3......']));B.movePaddle(s,50);
 let ev=give(s,'laser');assert.deepEqual(types(ev),['catch','shoot'],'the first pair leaves at once');assert.equal(s.shots.length,2);
 assert.deepEqual(plain(s.shots.map(h=>h.x)),[50-B.PADDLE_W/2+8,50+B.PADDLE_W/2-8]);
 ev=[...ev,...run(s,9)];
 assert.equal(ev.filter(e=>e.type==='shoot').length,18,'8 s of shots, 0.45 s apart');
 assert.deepEqual(plain(ev.filter(e=>e.type==='expire')),[{type:'expire',kind:'laser'}]);assert.equal(s.shots.length,0,'shots leave the field');
 const col1=ev.filter(e=>e.col===1);
 assert.deepEqual(col1.map(e=>e.type+e.row),['hit1','hit1','break1','hit0','break0'],'each shot does one hit to the first brick it meets');assert.ok(col1.every(e=>e.by==='shot'));
 assert.equal(ev.filter(e=>e.type==='steel'&&e.by==='shot').length,18);assert.equal(at(s,0,0).hp,1,'the brick behind steel is safe from shots');
 assert.equal(s.score,50+10+10);
});

test('magnet: the ball sticks where it lands, rides the paddle, and leaves on a tap or after 1.5 s; it lasts 15 s',()=>{
 const s=B.start(1);ball(s,180,300,0,-1);give(s,'magnet');assert.ok(near(s.effects.magnet,15,.02));
 let ev=bounce(s,20);assert.deepEqual(types(ev),['stick']);const b=s.balls[0];
 assert.ok(b.stuck&&b.vx===0&&b.vy===0&&near(b.off,20)&&near(b.y,B.PADDLE_Y-B.BALL_R));assert.equal(s.serving,false,'a held ball is not a serve');
 B.movePaddle(s,100);assert.ok(near(b.x,120),'the ball rides the paddle');
 assert.deepEqual(plain(run(s,1.4)),[]);assert.ok(b.stuck);
 assert.equal(B.launch(s),true);assert.ok(!b.stuck&&b.vx>0&&b.vy<0,'it leaves towards the side it sat on');assert.ok(near(Math.hypot(b.vx,b.vy),s.speed));
 assert.equal(B.launch(s),false);
 // Left alone, it lets go by itself.
 bounce(s,-20);assert.ok(s.balls[0].stuck);ev=run(s,1.5);assert.deepEqual(types(ev),['release']);assert.ok(!s.balls[0].stuck&&s.balls[0].vx<0&&s.balls[0].vy<0);
 // When the magnet runs out a held ball goes, and the next one bounces.
 bounce(s,10);assert.ok(s.balls[0].stuck);s.effects.magnet=.01;ev=run(s,.05);assert.deepEqual(types(ev),['expire','release']);
 assert.deepEqual(types(bounce(s,10)),['paddle']);assert.ok(!s.balls[0].stuck);
});

test('fire: balls go straight through breakable bricks for 6 s, and still bounce off steel',()=>{
 const s=field(['#.......','3.......','3.......','2.......','........','1.......']);park(s);give(s,'fire');assert.ok(near(s.effects.fire,6,.02));
 const low=at(s,3,0);s.effects.magnet=0;const b=ball(s,low.x+low.w/2,low.y+low.h+B.BALL_R+2,0,-s.speed);
 const ev=run(s,.3);assert.deepEqual(ev.map(e=>e.type+(e.row??'')),['break3','break2','break1','steel0'],'three bricks broken outright, then the steel');
 assert.ok(ev.slice(0,3).every(e=>e.by==='ball'));assert.equal(b.fire,true);assert.ok(b.vy>0&&b.vx===0);assert.equal(s.score,50+30);
 park(s);assert.deepEqual(plain(run(s,6)),[{type:'expire',kind:'fire'}]);
 assert.deepEqual(types(shoot(s,at(s,5,0))),['break','won']);assert.equal(s.balls[0].fire,false);
});

test('shield: a floor that saves one ball, and never more than one',()=>{
 const s=park(B.start(1));assert.equal(s.shield,false);give(s,'shield');give(s,'shield');assert.equal(s.shield,true);
 let ev=drop(s);assert.deepEqual(types(ev),['shield']);assert.equal(s.shield,false);assert.equal(s.lives,3);assert.equal(s.balls.length,1);assert.ok(s.balls[0].vy<0,'the ball comes back up');
 ev=drop(s);assert.deepEqual(types(ev),['lost'],'the second fall is not saved');assert.equal(s.lives,2);
});

test('life: one more life, to a most of 5',()=>{
 const s=park(B.start(1)),lives=[];for(let i=0;i<4;i++){give(s,'life');lives.push(s.lives);}
 assert.deepEqual(lives,[4,5,5,5]);assert.equal(B.MAX_LIVES,5);assert.equal(s.lost,0);
});

// ---------- the shelf ----------
test('the shelf: six boosts, unlocked by the furthest world reached',()=>{
 assert.deepEqual(plain(B.SHELF.map(b=>b.id+b.world)),['wide1','ball1','shield1','slow2','laser3','life4']);
 for(const b of B.SHELF)assert.ok(b.name&&b.text&&b.text.length<=45);
 const open=top=>B.shelf(top).filter(b=>b.unlocked).map(b=>b.id).join();
 assert.equal(open(1),'wide,ball,shield');assert.equal(open(5),'wide,ball,shield');assert.equal(open(6),'wide,ball,shield,slow');
 assert.equal(open(11),'wide,ball,shield,slow,laser');assert.equal(open(15),open(11));assert.equal(open(16),'wide,ball,shield,slow,laser,life');
 assert.equal(open(30),open(16));assert.equal(open(31),open(16),'a later lap keeps everything');assert.equal(open(undefined),open(1));
 assert.equal(B.shelf(1).length,6);assert.equal(B.shelf(1)[3].name,B.SHELF[3].name);
});

test('boosts apply at the start of the level and respect what is unlocked',()=>{
 const none0=B.start(1);assert.deepEqual(plain(none0.boosts),[]);assert.equal(none0.lives,3);assert.equal(none0.paddle.w,B.PADDLE_W);
 const s=B.start(1,{boosts:['wide','ball','shield']});assert.deepEqual(plain(s.boosts),['wide','ball','shield']);
 assert.equal(s.paddle.w,B.PADDLE_W*1.5);assert.equal(s.wideAll,true);assert.equal(s.shield,true);assert.equal(s.extraBall,true);
 B.launch(s,none);assert.equal(s.balls.length,2,'the extra ball launches with the first');assert.equal(s.balls[0].vx,-s.balls[1].vx);assert.equal(s.extraBall,false);
 park(s);run(s,30);assert.equal(s.paddle.w,B.PADDLE_W*1.5,'the wide paddle lasts the whole level');
 drop(s);B.launch(s,none);assert.equal(s.shield,false);drop(s);assert.equal(s.lives,2);B.launch(s,none);assert.equal(s.balls.length,1,'the extra ball comes once');
 // Locked boosts are ignored, unless the player has been further than the level being played.
 const locked=B.start(1,{boosts:['slow','laser','life']});assert.deepEqual(plain(locked.boosts),[]);assert.equal(locked.lives,3);assert.equal(locked.effects.slow,0);assert.equal(locked.effects.laser,0);
 const replay=B.start(1,{boosts:['slow','laser','life'],top:16});assert.deepEqual(plain(replay.boosts),['slow','laser','life']);
 assert.equal(replay.lives,4);assert.equal(replay.effects.slow,20);assert.equal(replay.effects.laser,15);assert.ok(near(replay.speed,217));
 // Slow start and laser start count from the launch, and run out.
 park(replay);let ev=run(replay,15.1);assert.ok(ev.some(e=>e.type==='expire'&&e.kind==='laser'));assert.ok(replay.effects.slow>4.8);
 assert.equal(ev.filter(e=>e.type==='shoot').length,Math.ceil(15/.45));
 ev=run(replay,5);assert.ok(ev.some(e=>e.type==='expire'&&e.kind==='slow'));assert.equal(replay.speed,310);
 assert.equal(B.start(6,{boosts:['slow','life']}).effects.slow,20);assert.equal(B.start(6,{boosts:['slow','life']}).lives,3);
 // At most three picks, each boost once, and junk is ignored.
 assert.deepEqual(plain(B.start(20,{boosts:['life','life','nope',7,null,'slow','wide','ball']}).boosts),['life','slow','wide']);
 for(const junk of [undefined,null,'wide',{boosts:'wide'},{boosts:{0:'wide'}},7])assert.deepEqual(plain(B.start(1,junk).boosts),[]);
 assert.equal(B.start(3,{score:450}).score,450);assert.equal(B.start(3,{score:'x'}).score,0);
});

// ---------- speed ----------
test('speed: 310 at level 1, 10 more each level to 440, a little more each lap, scaled by the option',()=>{
 assert.equal(B.speedFor(1),310);assert.equal(B.speedFor(2),320);assert.equal(B.speedFor(13),430);assert.equal(B.speedFor(14),440);assert.equal(B.speedFor(30),440);
 assert.equal(B.speedFor(31),455);assert.equal(B.speedFor(60),455);assert.equal(B.speedFor(61),470);assert.equal(B.speedFor(999),470);
 assert.ok(near(B.speedFor(1,'chill'),310*.85));assert.equal(B.speedFor(1,'normal'),310);assert.ok(near(B.speedFor(1,'fast'),310*1.15));assert.equal(B.speedFor(1,'constructor'),310);
 assert.deepEqual(plain(B.SPEEDS),{chill:.85,normal:1,fast:1.15});
 for(const [name,k] of [['chill',.85],['normal',1],['fast',1.15],['warp',1],[undefined,1]]){
  const s=B.start(4,{speed:name});assert.ok(near(s.base,340*k)&&near(s.speed,340*k));assert.equal(s.speedName,k===1?'normal':name);
  B.launch(s,none);assert.ok(near(Math.hypot(s.balls[0].vx,s.balls[0].vy),340*k));
 }
});

test('a rally speeds the ball up 2% every 6 paddle hits, to 20%, and a new serve starts again',()=>{
 const s=B.start(1,{speed:'fast'}),base=310*1.15;B.launch(s,none);const faster=[];
 for(let i=1;i<=80;i++){
  const ev=bounce(s);assert.ok(types(ev).includes('paddle'));if(types(ev).includes('faster'))faster.push(i);
  const want=base*(1+.02*Math.min(10,Math.floor(i/6)));
  assert.ok(near(s.speed,want),'after '+i+' hits');assert.ok(near(Math.hypot(s.balls[0].vx,s.balls[0].vy),want));
 }
 assert.deepEqual(faster,[6,12,18,24,30,36,42,48,54,60]);assert.ok(near(s.speed,base*1.2));assert.equal(s.base,base);
 // Slow multiplies what the rally has built.
 give(s,'slow');assert.ok(near(s.speed,base*1.2*.7));s.effects.slow=0;
 drop(s);assert.equal(s.serving,true);assert.equal(s.rally,0);assert.ok(near(s.speed,base),'back to the base speed on a new serve');
 B.launch(s,none);assert.ok(near(Math.hypot(s.balls[0].vx,s.balls[0].vy),base));
});

// ---------- scoring ----------
test('combo: bricks broken since the paddle was last touched raise the score, to 5 times',()=>{
 const s=field(['11111111','11111111','........','........','2.......']),points=[];
 for(const k of s.bricks.filter(k=>k.row<2).reverse()){const e=shoot(s,k).find(e=>e.type==='break');points.push(e.points);assert.equal(e.combo,points.length);}
 assert.deepEqual(points,[10,10,10,20,20,20,30,30,30,40,40,40,50,50,50,50]);assert.equal(s.combo,16);assert.equal(s.score,500);
 shoot(s,at(s,4,0));assert.equal(s.score,500,'a hit that does not break scores nothing');assert.equal(s.combo,16);
 bounce(s);assert.equal(s.combo,0,'touching the paddle ends the combo');
 const ev=shoot(s,at(s,4,0));assert.equal(ev[0].points,10);assert.equal(ev[1].type,'won');
});

test('clearing a level scores 100 plus 50 a life, and stars count the lives lost',()=>{
 const win=(lose,opts)=>{const s=field(['1.......'],opts,opts?16:1);B.launch(s,none);for(let i=0;i<lose;i++){drop(s);B.launch(s,none);}const before=s.score,ev=shoot(s,at(s,0,0));return {s,won:ev.at(-1),gain:s.score-before};};
 let r=win(0);assert.deepEqual(plain(r.won),{type:'won',points:250,stars:3});assert.equal(r.gain,260);assert.equal(B.stars(r.s),3);assert.equal(r.s.over,'won');
 r=win(1);assert.deepEqual(plain(r.won),{type:'won',points:200,stars:2});assert.equal(B.stars(r.s),2);
 r=win(2);assert.deepEqual(plain(r.won),{type:'won',points:150,stars:1});assert.equal(B.stars(r.s),1);
 r=win(3,{boosts:['life']});assert.equal(r.won.points,150);assert.equal(B.stars(r.s),1,'an extra life does not buy stars');
 r=win(1,{boosts:['life']});assert.equal(r.won.points,250);assert.equal(B.stars(r.s),2);
 assert.equal(B.stars(B.start(1)),0);
 const frozen=plain(r.s);r.s.capsules.push({x:10,y:10,kind:'wide'});frozen.capsules.push({x:10,y:10,kind:'wide'});
 assert.deepEqual(plain(run(r.s,1)),[]);assert.equal(B.launch(r.s),false);assert.deepEqual(plain(r.s),frozen,'nothing moves after the level is won');
});

// ---------- nothing stalls ----------
test('after 12 s without damaging a brick, paddle bounces aim the ball at a brick that is left',()=>{
 const s=field(['.......1']),k=at(s,0,7);B.movePaddle(s,60);
 s.idle=11;let ev=bounce(s);assert.equal(ev[0].nudge,false);assert.equal(s.balls[0].vx,0,'a centre hit goes straight up');
 s.idle=12;ball(s,60,B.PADDLE_Y-20,0,s.speed);ev=B.step(s,.05,()=>0);assert.equal(ev[0].type,'paddle');assert.equal(ev[0].nudge,true);
 const b=s.balls[0],want=Math.atan2(k.x+k.w/2-ev[0].x,ev[0].y-(k.y+k.h/2));assert.ok(near(Math.atan2(b.vx,-b.vy),want,1e-9),'straight at the brick');
 assert.ok(near(Math.hypot(b.vx,b.vy),s.speed));
 // Other rolls go by way of a wall or the ceiling, or pick a fresh angle: always upwards and at the level speed.
 for(const r of [.21,.41,.61,.81,.99]){s.idle=20;ball(s,60,B.PADDLE_Y-20,0,s.speed);const e=B.step(s,.05,()=>r).find(e=>e.type==='paddle');assert.equal(e.nudge,true);assert.ok(s.balls[0].vy<-s.speed*.3&&near(Math.hypot(s.balls[0].vx,s.balls[0].vy),s.speed));}
 assert.ok(s.idle>=20,'it keeps helping until a brick is hit');shoot(s,k);assert.ok(s.idle<.1);
 // Time spent waiting to serve does not count.
 const w=B.start(1);run(w,30);assert.equal(w.idle,0);assert.equal(w.time,0);
});

// ---------- saved data ----------
test('saved game data is checked on the way in, and saves from the first version still load',()=>{
 const fresh={level:1,top:1,best:0,subject:'math',speed:'normal',stars:{}};
 for(const junk of [undefined,null,7,'x',[],[1,2],{},()=>1,{stars:[3,3]},{stars:'33'},{speed:'constructor'},{speed:['fast']}])assert.deepEqual(plain(B.clean(junk)),fresh);
 // The first version saved {level, top, best, subject}.
 assert.deepEqual(plain(B.clean({level:'7',top:9.8,best:1234,subject:'words',junk:1})),{level:7,top:9,best:1234,subject:'words',speed:'normal',stars:{}});
 assert.deepEqual(plain(B.clean({level:-3,top:1e9,best:'<b>',subject:'art'})),{level:1,top:999,best:0,subject:'math',speed:'normal',stars:{}});
 assert.deepEqual(plain(B.clean({level:4,best:1200})),{level:4,top:4,best:1200,subject:'math',speed:'normal',stars:{}},'the furthest level is never behind the next one');
 const full={level:12,top:14,best:5000,subject:'words',speed:'chill',stars:{1:3,2:2,3:1,13:3}};
 assert.deepEqual(plain(B.clean(full)),full);assert.deepEqual(plain(B.clean(B.clean(full))),full);assert.equal(B.clean({speed:'fast'}).speed,'fast');
 assert.deepEqual(plain(B.clean({stars:{1:3,'2':'2',3:9,4:0,5:null,6:-1,7:2.9,x:2,1000:3,'-1':1,'1.5':2,__proto__:3,8:'<b>',9:{}}}).stars),{1:3,2:2,3:3,7:2});
 const big={level:999,top:999,best:1e9,subject:'words',speed:'normal',stars:Object.fromEntries(Array.from({length:999},(_,i)=>[i+1,3]))};
 assert.deepEqual(plain(B.clean(big)),big);assert.ok(JSON.stringify(B.clean(big)).length<20000,'the largest possible save is under 20,000 characters');
 assert.ok(JSON.stringify(B.clean({stars:Object.fromEntries(Array.from({length:5000},(_,i)=>['k'+i,3]))})).length<200);
});

test('record: what a finished level changes in the save',()=>{
 const win=(n,lost,score)=>({level:n,over:'won',lost,score}),old={level:3,top:3,best:400,subject:'words'};
 let g=B.record(old,win(3,1,900));assert.deepEqual(plain(g),{level:4,top:4,best:900,subject:'words',speed:'normal',stars:{3:2}});
 assert.deepEqual(old,{level:3,top:3,best:400,subject:'words'},'the save passed in is not changed');
 g=B.record(g,win(1,0,100));assert.deepEqual(plain(g),{level:2,top:4,best:900,subject:'words',speed:'normal',stars:{1:3,3:2}},'replaying an early level keeps the furthest');
 g=B.record(g,win(3,2,100));assert.equal(g.stars[3],2,'a worse replay keeps the best stars');g=B.record(g,win(3,0,100));assert.equal(g.stars[3],3);
 g=B.record(g,{level:4,over:'lost',lost:3,score:2000});assert.equal(g.level,4,'after a loss the same level is next');assert.equal(g.top,4);assert.equal(g.best,2000);assert.equal(g.stars[4],undefined);
 assert.equal(B.record({level:999,top:999},win(999,0,0)).level,999);assert.deepEqual(plain(B.record(null,null)),plain(B.clean(null)));
 // A real finished state works too.
 const s=field(['1.......']);shoot(s,at(s,0,0));assert.deepEqual(plain(B.record({},s)),{level:2,top:2,best:260,subject:'math',speed:'normal',stars:{1:3}});
});
