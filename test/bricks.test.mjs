// Tests for Brain Bricks' logic (site/brain-bricks/game.js): levels, the ball, what quiz answers earn, and saved data.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ctx={};vm.runInNewContext(readFileSync(new URL('../site/brain-bricks/game.js',import.meta.url),'utf8'),ctx);
const B=ctx.Bricks,plain=v=>JSON.parse(JSON.stringify(v));
// Plays a level with a paddle that stays under the lowest ball, drifting a little so the ball leaves at different angles.
// Returns the state when the level ends or time runs out.
const autoplay=(s,secs,follow=true)=>{let t=0;const seen=[];
  while(!s.over&&t<secs){if(s.serving)B.launch(s,()=>.3);if(follow&&s.balls.length)B.movePaddle(s,s.balls.reduce((a,b)=>b.y>a.y?b:a).x+24*Math.sin(t*1.7));seen.push(...B.step(s,1/60));t+=1/60;}
  return {s,seen,t};};

test('levels fit the field, get harder, and never run out',()=>{
 for(const line of B.PICTURES.flat())assert.equal(line.length,8);
 for(let n=1;n<=40;n++){const ks=B.level(n);assert.ok(ks.length>=12,'level '+n+' has bricks');
  for(const k of ks){assert.ok(k.x>=0&&k.x+k.w<=B.W&&k.y>=40&&k.y+k.h<B.PADDLE_Y-150,'level '+n+' brick is inside the field and well above the paddle');assert.ok(k.hp===1||k.hp===2);}}
 assert.equal(B.level(1).length,24);assert.ok(B.level(1).every(k=>k.hp===1),'the first level is all one-hit bricks');
 const hp=n=>B.level(n).reduce((a,k)=>a+k.hp,0),laps=B.PICTURES.length;
 assert.ok(hp(1+laps)>hp(1)&&hp(1+2*laps)>hp(1+laps),'the same picture is tougher each time round');
 assert.ok(B.start(12).speed>B.start(1).speed&&B.start(99).speed<=430,'the ball speeds up, to a limit');
 assert.deepEqual(plain(B.level(0)),plain(B.level(1)));
});

test('right answers earn power-ups for the next level',()=>{
 assert.deepEqual(plain(B.powers(0)),{wide:false,extraBall:false,shield:false});
 assert.deepEqual(plain(B.powers(1)),{wide:true,extraBall:false,shield:false});
 assert.deepEqual(plain(B.powers(2)),{wide:true,extraBall:true,shield:false});
 assert.deepEqual(plain(B.powers(3)),{wide:true,extraBall:true,shield:true});
 const plainStart=B.start(1),boosted=B.start(1,B.powers(3));
 assert.ok(boosted.paddle.w>plainStart.paddle.w);assert.equal(boosted.shield,true);
 B.launch(boosted,()=>.3);assert.equal(boosted.balls.length,2,'the extra ball launches with the first');
 B.launch(plainStart,()=>.3);assert.equal(plainStart.balls.length,1);
});

test('the ball waits on the paddle, then bounces and breaks bricks',()=>{
 const s=B.start(1);assert.equal(s.serving,true);assert.equal(B.step(s,1/60).length,0,'nothing moves until launch');
 B.movePaddle(s,-50);assert.equal(s.paddle.x,s.paddle.w/2,'the paddle stops at the wall');assert.equal(s.balls[0].x,s.paddle.x,'and carries the waiting ball');
 B.movePaddle(s,180);B.launch(s,()=>.3);assert.ok(s.balls[0].vy<0,'the ball goes up');
 const sp=Math.hypot(s.balls[0].vx,s.balls[0].vy);assert.ok(Math.abs(sp-s.speed)<1e-6);
 const {seen}=autoplay(s,3);
 assert.ok(seen.some(e=>e.type==='break'),'a brick breaks');assert.ok(s.score>=10);
 for(const b of s.balls){assert.ok(b.x>=0&&b.x<=B.W&&b.y>=0,'the ball stays inside the walls');assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-s.speed)<1,'and keeps its speed');}
});

test('a paddle that follows the ball clears levels, including two-hit bricks, without tunnelling',()=>{
 for(const n of [1,4,10,14]){
  const {s,t,seen}=autoplay(B.start(n),600);
  assert.equal(s.over,'won','level '+n+' can be cleared (took '+Math.round(t)+' s)');assert.ok(s.bricks.every(k=>k.hp===0));
  assert.equal(seen.filter(e=>e.type==='brick'||e.type==='break').length,B.level(n).reduce((a,k)=>a+k.hp,0),'every hit counts once');
  assert.equal(s.lives,B.LIVES);assert.ok(seen.at(-1).type==='won');
 }
 const first=autoplay(B.start(1),600);assert.ok(first.t<150,'the first level is short ('+Math.round(first.t)+' s with perfect play)');
 assert.equal(first.s.score,24*10+50+25*B.LIVES);
});

test('missing the ball costs a life, the shield saves it once, and three misses end the level',()=>{
 let s=B.start(1,B.powers(3));B.movePaddle(s,40);B.launch(s,()=>.9);
 const miss=()=>{let ev=[];for(let i=0;i<3000&&!ev.some(e=>['lost','over','shield'].includes(e.type));i++){if(s.serving)B.launch(s,()=>.9);B.movePaddle(s,s.balls[0].x<180?330:30);ev=B.step(s,1/60);}return ev.find(e=>['lost','over','shield'].includes(e.type))?.type;};
 s.extraBall=false;s.balls=s.balls.slice(0,1);
 assert.equal(miss(),'shield');assert.equal(s.lives,B.LIVES);assert.equal(s.shield,false);
 assert.equal(miss(),'lost');assert.equal(s.lives,B.LIVES-1);assert.equal(s.serving,true,'the next ball waits on the paddle');
 assert.equal(miss(),'lost');assert.equal(miss(),'over');assert.equal(s.over,'lost');assert.equal(s.lives,0);
 const frozen=plain(s);B.step(s,1);B.launch(s);assert.deepEqual(plain(s),frozen,'nothing moves after the level is over');
});

test('saved game data is checked on the way in',()=>{
 assert.deepEqual(plain(B.clean(undefined)),{level:1,top:1,best:0,subject:'math'});
 assert.deepEqual(plain(B.clean({level:'7',top:9.8,best:1234,subject:'words',junk:1})),{level:7,top:9,best:1234,subject:'words'});
 assert.deepEqual(plain(B.clean({level:-3,top:1e9,best:'<b>',subject:'art'})),{level:1,top:999,best:0,subject:'math'});
});
