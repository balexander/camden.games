// Brain Bricks: the game away from the page. Levels, the ball and paddle, what quiz answers earn, and the game's saved data.
// No DOM, so test/bricks.test.mjs can run it. The page (index.html) draws the state this file keeps and feeds it the finger position.
// Loaded as a classic script (global Bricks).
var Bricks=(()=>{
// The field is a fixed 360 by 600 units; the page scales it to the screen.
const W=360,H=600,COLS=8,GAP=4,SIDE=10,TOP=64,BRICK_W=(W-2*SIDE-(COLS-1)*GAP)/COLS,BRICK_H=18;
const PADDLE_Y=H-44,PADDLE_H=12,PADDLE_W=76,WIDE=1.5,BALL_R=6,LIVES=3,QUIZ=3;
// Each level is a picture in bricks, eight across: '.' is a gap, '1' breaks in one hit, '2' takes two.
// After the last picture they come round again, tougher and a little faster.
const PICTURES=[
  ['11111111','11111111','11111111'],
  ['1.1.1.1.','.1.1.1.1','1.1.1.1.','.1.1.1.1'],
  ['...11...','..1111..','.111111.','11111111'],
  ['22222222','1......1','1.1111.1','1......1','11111111'],
  ['11.11.11','11.11.11','........','11.11.11','11.11.11'],
  ['1......1','11....11','111..111','11122111','111..111'],
  ['2.2.2.2.','11111111','.2.2.2.2','11111111'],
  ['..1111..','.1....1.','1.2..2.1','1......1','.1.22.1.','..1111..'],
  ['12121212','21212121','12121212','21212121'],
  ['22222222','2......2','2.1111.2','2.1221.2','2.1111.2','22222222'],
];
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const speedFor=n=>Math.min(430,280+14*(n-1));

// The bricks for level n (1 is the first). Each is {x,y,w,h,hp,row}.
function level(n){
  n=Math.max(1,Math.floor(n)||1);
  const pic=PICTURES[(n-1)%PICTURES.length],lap=Math.floor((n-1)/PICTURES.length),out=[];
  pic.forEach((line,r)=>[...line].forEach((ch,c)=>{
    if(ch==='.')return;
    // On later laps every other one-hit brick becomes a two-hit brick, then all of them.
    const hp=ch==='2'||lap>=2||(lap===1&&(r+c)%2===0)?2:1;
    out.push({x:SIDE+c*(BRICK_W+GAP),y:TOP+r*(BRICK_H+GAP),w:BRICK_W,h:BRICK_H,hp,row:r});
  }));
  return out;
}
// What right answers in the quiz earn for the next level. One right answer is a wide paddle, two adds a second ball,
// and three adds a shield that saves the ball once.
function powers(right){return {wide:right>=1,extraBall:right>=2,shield:right>=3};}
const POWER_NAMES=[['wide','Wide paddle'],['extraBall','Extra ball'],['shield','Shield']];

// A fresh level. The ball waits on the paddle until the player launches it.
function start(n,earned={},score=0){
  const pw=PADDLE_W*(earned.wide?WIDE:1);
  const s={level:n,bricks:level(n),paddle:{x:W/2,w:pw},balls:[],lives:LIVES,score,shield:!!earned.shield,extraBall:!!earned.extraBall,speed:speedFor(n),serving:true,over:null};
  serve(s);return s;
}
function serve(s){s.serving=true;s.balls=[{x:s.paddle.x,y:PADDLE_Y-BALL_R,vx:0,vy:0}];}
// Sends the waiting ball up and to one side. With an extra ball earned, the first launch of the level sends two.
function launch(s,rnd=Math.random){
  if(!s.serving||s.over)return;
  s.serving=false;const a=(rnd()<.5?-1:1)*(.25+rnd()*.3),b=s.balls[0];
  b.vx=Math.sin(a)*s.speed;b.vy=-Math.cos(a)*s.speed;
  if(s.extraBall){s.extraBall=false;s.balls.push({x:b.x,y:b.y,vx:-b.vx,vy:b.vy});}
}
function movePaddle(s,x){s.paddle.x=clamp(x,s.paddle.w/2,W-s.paddle.w/2);if(s.serving&&s.balls[0])s.balls[0].x=s.paddle.x;}

// Moves everything on by dt seconds and returns what happened, for sounds and sparks:
// {type:'wall'|'paddle'|'brick'|'break'|'shield'|'lost'|'won'|'over', x, y, row}.
function step(s,dt){
  const ev=[];if(s.over||s.serving)return ev;
  // Small steps, so a fast ball cannot pass through a brick between two frames.
  const n=Math.max(1,Math.ceil(s.speed*dt/4)),h=dt/n;
  for(let i=0;i<n&&!s.over;i++)tick(s,h,ev);
  return ev;
}
function tick(s,h,ev){
  for(const b of s.balls){
    b.x+=b.vx*h;b.y+=b.vy*h;
    if(b.x<BALL_R){b.x=BALL_R;b.vx=Math.abs(b.vx);ev.push({type:'wall',x:b.x,y:b.y});}
    if(b.x>W-BALL_R){b.x=W-BALL_R;b.vx=-Math.abs(b.vx);ev.push({type:'wall',x:b.x,y:b.y});}
    if(b.y<BALL_R){b.y=BALL_R;b.vy=Math.abs(b.vy);ev.push({type:'wall',x:b.x,y:b.y});}
    // The paddle: where the ball lands on it sets the angle, so the player can aim.
    const p=s.paddle;
    if(b.vy>0&&b.y+BALL_R>=PADDLE_Y&&b.y-BALL_R<=PADDLE_Y+PADDLE_H&&Math.abs(b.x-p.x)<=p.w/2+BALL_R){
      const a=clamp((b.x-p.x)/(p.w/2),-1,1)*1.05;b.vx=Math.sin(a)*s.speed;b.vy=-Math.cos(a)*s.speed;b.y=PADDLE_Y-BALL_R;ev.push({type:'paddle',x:b.x,y:b.y});
    }
    for(const k of s.bricks){
      if(k.hp<=0)continue;
      const nx=clamp(b.x,k.x,k.x+k.w),ny=clamp(b.y,k.y,k.y+k.h),dx=b.x-nx,dy=b.y-ny;
      if(dx*dx+dy*dy>BALL_R*BALL_R)continue;
      // Bounce off whichever face the ball is shallower into.
      const ox=Math.min(b.x+BALL_R-k.x,k.x+k.w-(b.x-BALL_R)),oy=Math.min(b.y+BALL_R-k.y,k.y+k.h-(b.y-BALL_R));
      if(ox<oy){b.vx=b.x<k.x+k.w/2?-Math.abs(b.vx):Math.abs(b.vx);}else{b.vy=b.y<k.y+k.h/2?-Math.abs(b.vy):Math.abs(b.vy);}
      k.hp--;s.score+=10;ev.push({type:k.hp?'brick':'break',x:k.x+k.w/2,y:k.y+k.h/2,row:k.row});
      break;
    }
    // A ball going almost sideways would take for ever to come down, so it always keeps some up-or-down speed.
    if(Math.abs(b.vy)<s.speed*.18){b.vy=(b.vy<0?-1:1)*s.speed*.18;const vx=Math.sqrt(s.speed*s.speed-b.vy*b.vy);b.vx=b.vx<0?-vx:vx;}
    if(b.y-BALL_R>H){
      if(s.shield){s.shield=false;b.y=H-BALL_R;b.vy=-Math.abs(b.vy);ev.push({type:'shield',x:b.x,y:H});}
      else b.gone=true;
    }
  }
  s.balls=s.balls.filter(b=>!b.gone);
  if(!s.bricks.some(k=>k.hp>0)){s.over='won';s.score+=50+25*s.lives;ev.push({type:'won'});return;}
  if(!s.balls.length){
    s.lives--;
    if(s.lives>0){serve(s);ev.push({type:'lost'});}else{s.over='lost';ev.push({type:'over'});}
  }
}
// The game's own saved data, kept in the profile under games['brain-bricks'].
function clean(g){
  const o=g&&typeof g==='object'?g:{},int=(v,lo,hi)=>clamp(Math.floor(Number.isFinite(+v)?+v:lo),lo,hi);
  return {level:int(o.level,1,999),top:int(o.top,1,999),best:int(o.best,0,1e9),subject:o.subject==='words'?'words':'math'};
}
return {W,H,BRICK_H,PADDLE_Y,PADDLE_H,BALL_R,LIVES,QUIZ,PICTURES,POWER_NAMES,level,powers,start,launch,movePaddle,step,clean};
})();
