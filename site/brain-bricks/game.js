// Brain Bricks: the game away from the page. Levels and worlds, the ball and paddle, bricks, falling capsules, the boosts
// that quiz answers earn, scoring, and the game's saved data. No DOM, no timers and no clock: the page (index.html) passes in
// the time and the finger position, draws the state this file keeps, and turns the events it returns into sounds and sparks.
// Loaded as a classic script (global Bricks); test/bricks.test.mjs runs it in node.
//
// ===================================== THE INTERFACE =====================================
//
// THE FIELD. Everything is measured in field units: the field is W (360) wide and H (600) tall, x to the right, y down.
// The page scales it to the screen.
//   W, H                         the field
//   COLS, SIDE, TOP, GAP         8 brick columns; the first brick starts at x=SIDE, y=TOP; GAP between bricks
//   BRICK_W, BRICK_H             one brick (every brick in the state also carries its own x, y, w, h)
//   PADDLE_Y, PADDLE_H, PADDLE_W the paddle's top edge, its thickness, and its normal width (state.paddle.w is the width now)
//   BALL_R                       ball radius
//   MIN_AIM, MAX_ANGLE           the nearest to straight up and the flattest an aimed serve may be, in radians (0.17, 1.05)
//   CAP_W, CAP_H                 a falling capsule; its x, y are its centre
//   SHOT_W, SHOT_H               a laser shot; its x, y are the middle of its top end
//   LIVES (3), MAX_LIVES (5), MAX_BALLS (9), QUIZ (3 questions after a level, so at most 3 picks)
//
// LEVELS AND WORLDS. Levels are numbered from 1 and never run out. There are 30 pictures in 6 worlds of 5; level 31 is
// picture 1 again on "lap" 1, with every numbered brick one hit tougher (to a most of 3) and a slightly faster ball.
//   PICTURES        the 30 pictures, each a list of 8-character strings, top row first. The characters:
//                     .  gap                  1 2 3  a plain brick that takes that many hits
//                     #  steel: never breaks, does not need clearing; balls and shots stop at it
//                     *  bomb: one hit; when it breaks, the eight bricks around it take 3 hits (steel unharmed); bombs chain
//                     P  power brick: one hit, and always drops a capsule
//   WORLDS          six of {name, intro, colors, first, last}. colors is a list of row colours (use colors[brick.row %
//                   colors.length]) chosen to read on both a white and a dark navy field. first and last are the world's
//                   level numbers on lap 0 (1-5, 6-10, ...). intro is a short line for the banner when the world begins.
//   world(n)        which world level n is in: {index (0-5), number (1-6), lap, name, intro, colors, first, last}, where
//                   first and last are the real level numbers for that lap (level 33 gives first 31, last 35).
//   level(n)        the bricks of level n, as in state.bricks below.
//   build(rows, lap)  the bricks for any picture (level uses it; handy for drawing a small preview of a level).
//   charsFor(i)     the picture characters world index i (0-5) may use, as a string.
//   capsulesFor(n)  the capsule kinds that can fall in level n (worlds add them one at a time; lap 1 onwards has all).
//   speedFor(n, speed)  the ball's base speed in units per second. speed is 'chill' | 'normal' | 'fast' (SPEEDS holds the
//                   multipliers .85, 1, 1.15). Level 1 is 310, each level adds 10 up to 440, each lap adds 15 up to 470.
//
// CAPSULES fall out of broken bricks and are caught with the paddle. A missed one costs nothing.
//   CAPSULES        {kind: {name, text, secs}} for the eight kinds; secs is how long a timed one lasts, 0 for the others.
//                     wide    paddle 1.5 times as wide for 20 s        multi   every ball splits in three (9 balls at most)
//                     slow    ball at 0.7 speed for 12 s               laser   a pair of shots every 0.45 s for 8 s
//                     magnet  balls stick to the paddle for 15 s       fire    balls burn through bricks for 6 s
//                     shield  a floor that saves one ball              life    one more life (5 at most)
//                   Catching a timed capsule that is already running starts its time again.
//
// BOOSTS are what quiz answers earn: each right answer is one pick from the shelf, used on the next level.
//   SHELF           six of {id, name, text, world}; world is the world number (1-6) that must have been reached.
//   shelf(top)      the same list with unlocked: true|false added, for a player whose furthest level is top.
//                   ids: 'wide' (wide paddle all level), 'ball' (a second ball at the first launch), 'shield',
//                   'slow' (slow for the first 20 s), 'laser' (laser for the first 15 s), 'life' (start with 4 lives).
//
// PLAYING A LEVEL
//   start(n, {boosts, speed, score, top})   a fresh state for level n. All four are optional: boosts is a list of shelf ids
//                   (repeats, unknown ids, locked ones and any past the first QUIZ are ignored; state.boosts lists the ones
//                   that counted), speed is 'chill' | 'normal' | 'fast', score is the score to carry in, and top is the
//                   player's furthest level, used only to decide which boosts are unlocked (it defaults to n).
//   movePaddle(state, x)   puts the paddle's centre at x, kept inside the walls. Balls waiting on it move with it.
//   setAim(state, x, y)    while an aimed serve waits (state.serving and state.aimable), points the aim from the waiting
//                   ball towards the field point (x, y). The angle is kept between MIN_AIM (0.17, about 10 degrees) and
//                   MAX_ANGLE (1.05, about 60 degrees) from straight up, on the side the point is on; a point level with or
//                   below the ball gives the flattest angle on its side. Never moves the paddle. Does nothing otherwise.
//   turnAim(state, by)     the same for keys: turns the aim by that many radians (positive is to the right), stepping over
//                   the straight-up gap and stopping at the flattest angle.
//   aimPath(state)  the guide line for an aimed serve: a list of points [{x, y}, ...] from the waiting ball along the aim to
//                   the first brick or the ceiling the ball would meet, by way of at most one side wall (a second side wall
//                   ends the line). An empty list when the serve is not aimed.
//   launch(state, rnd)     call to fire. If a ball is waiting to be served it goes: along state.aim when the serve is aimable,
//                   otherwise at a random angle to one side as it always has. If no ball is waiting, every ball held by the
//                   magnet is let go. Returns true if a ball left the paddle. Does nothing once the level is over.
//   step(state, dt, rnd)   moves everything on by dt seconds and returns a list of events (below). While state.serving is
//                   true or state.over is set, nothing moves and no time passes, so timed effects do not run down while the
//                   player waits to launch. rnd is a function like Math.random; tests pass their own.
//   left(state)     how many bricks still have to be broken.
//   stars(state)    0 until the level is won, then 3 if no life was lost, 2 if one was, 1 otherwise.
//
// THE STATE. Read anything; change it only through the functions above.
//   level, world (0-5), lap, speedName
//   bricks     [{x, y, w, h, row, col, kind, hp, max}]  kind is 'plain' | 'steel' | 'bomb' | 'power'. hp is the hits left
//              and max the hits it started with, so hp < max means damaged. A broken brick stays in the list with hp 0:
//              skip those when drawing. Steel keeps hp 1 for ever.
//   paddle     {x, w}  centre and width
//   balls      [{x, y, vx, vy, stuck, off, hold, fire}]  stuck is true while the ball sits on the paddle (waiting to be
//              served, or held by the magnet; off is how far it sits from the paddle's centre and hold the seconds until the
//              magnet lets go by itself). fire is true while balls burn through bricks.
//   capsules   [{x, y, kind}] falling          shots  [{x, y}] laser shots going up
//   effects    {wide, slow, laser, magnet, fire}  seconds left on each timed effect, 0 when it is off
//   wideAll    true when the wide-paddle boost was picked (the paddle is wide all level, whatever effects.wide says)
//   shield     true while the floor is up
//   lives, lost (lives lost this level), score, combo (bricks broken since a ball last touched the paddle)
//   serving    true while a ball waits on the paddle to be served (the start of the level and after each lost life)
//   aimable    true while the serve that is waiting, or the one just made, is aimed by the player: the first serve of the
//              level. After a lost life it is false: the paddle slides and a tap launches. (The one place that decides
//              this is the line in serve() that sets it; make it always true there to aim every serve.)
//   aim        the angle an aimable serve leaves at, in radians from straight up, positive to the right. It starts at 0.4.
//   over       null while playing, then 'won' or 'lost'
//   speed      the ball's speed right now; base is the level's speed before the rally speed-up and the slow effect
//   rally      paddle hits since the last serve (every 6 add 2% to the speed, up to 20%)
//   time       seconds of play so far; idle is seconds since a brick was last damaged
//   boosts, extraBall (the second ball has not been launched yet; it leaves with the first serve, the mirror-image way)
//
// EVENTS from step, in the order they happened. Every event has type; x and y are where it happened.
//   {type:'wall', x, y}                          a ball bounced off a wall or the ceiling        (often)
//   {type:'paddle', x, y, nudge}                 a ball bounced off the paddle. nudge is true when the game aimed it at a
//                                                brick because nothing had been hit for 12 s
//   {type:'stick', x, y}                         the magnet caught a ball
//   {type:'release', x, y}                       the magnet let a ball go by itself (a tap is reported by launch's return)
//   {type:'faster', speed}                       the rally speed-up went up a step
//   {type:'steel', x, y, row, col, by}           something bounced off steel. by is 'ball' | 'shot'
//   {type:'hit', x, y, row, col, kind, hp, by}   a brick was damaged but not broken. by is 'ball' | 'shot' | 'bomb'
//   {type:'break', x, y, row, col, kind, by, points, combo}   a brick broke. combo counts this brick. A bomb or a fire ball
//                                                can break many in one step, so expect several of these per frame
//   {type:'boom', x, y, row, col}                a bomb went off (follows its own 'break')
//   {type:'drop', x, y, kind}                    a capsule started to fall
//   {type:'catch', x, y, kind, points}           the paddle caught a capsule
//   {type:'miss', x, y, kind}                    a capsule fell off the bottom (no penalty)
//   {type:'shoot', x, y}                         the laser fired a pair of shots; x is the paddle's centre  (about 2 a second)
//   {type:'expire', kind}                        a timed effect ran out
//   {type:'shield', x, y}                        the shield saved a ball and is gone
//   {type:'drain', x, y}                         a ball fell out while others are still in play
//   {type:'lost', lives}                         the last ball fell out; a new one waits on the paddle
//   {type:'over'}                                the last life is gone; state.over is 'lost'
//   {type:'won', points, stars}                  the last brick broke; points is the clear bonus
//
// SCORING. A broken brick scores 10 times (1 + a third of the combo so far, rounded down), to a most of 50. Catching a
// capsule scores 50. Clearing the level scores 100 plus 50 for each life left. Damaging a brick without breaking it scores 0.
//
// SAVED DATA, kept in the profile under games['brain-bricks']:
//   clean(saved)          always returns {level, top, best, subject, speed, stars}: the next level to play, the furthest level
//                         unlocked, the best score, 'math' | 'words', 'chill' | 'normal' | 'fast', and the best stars for each
//                         level won ({'1':3, '2':1}). Accepts saves from before speed and stars existed, and junk.
//   record(saved, state)  the save after a level ended: best score, and for a win the stars, the next level and the furthest.
//                         After a loss the next level to play is the same one.
// =========================================================================================
var Bricks=(()=>{
const W=360,H=600,COLS=8,GAP=4,SIDE=10,TOP=64,BRICK_W=(W-2*SIDE-(COLS-1)*GAP)/COLS,BRICK_H=18;
const PADDLE_Y=H-44,PADDLE_H=12,PADDLE_W=76,WIDE=1.5,BALL_R=6,CAP_W=28,CAP_H=14,SHOT_W=4,SHOT_H=12;
const LIVES=3,MAX_LIVES=5,MAX_BALLS=9,QUIZ=3,MAX_LEVEL=999;
// Numbers that set how the game feels.
const SPEEDS={chill:.85,normal:1,fast:1.15},SPEED_1=310,SPEED_STEP=10,SPEED_CAP=440,LAP_STEP=15,LAP_CAP=470;
const RALLY_HITS=6,RALLY_STEP=.02,RALLY_MAX=10;      // every 6 paddle hits add 2%, ten times at most
const SLOW=.7,CAP_FALL=120,SHOT_V=520,SHOT_EVERY=.45,HOLD=1.5,SPLIT=.4,MAX_ANGLE=1.05,MIN_RISE=.18;
const MIN_AIM=.17,FIRST_AIM=.4;                      // an aimed serve: never nearer straight up than about 10 degrees
const DROP_CHANCE=.06,STALL=12,NUDGE_ANGLE=1.25,BOMB_HITS=3,COMBO_STEP=3,COMBO_MAX=5;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),speedOk=v=>typeof v==='string'&&Object.hasOwn(SPEEDS,v);

// The capsules. weight is how often each falls compared with the others; a life is rare and falls once a level at most.
const CAPSULES={
  wide:{name:'Big Bat',text:'A wider paddle for a while',secs:20,weight:3},
  multi:{name:'Triple',text:'Every ball splits into three',secs:0,weight:3},
  slow:{name:'Slow-mo',text:'The ball slows down for a while',secs:12,weight:2},
  shield:{name:'Safety Net',text:'A floor that saves one ball',secs:0,weight:2},
  laser:{name:'Zapper',text:'The paddle shoots bricks',secs:8,weight:2},
  magnet:{name:'Sticky Bat',text:'Catch the ball, then tap to aim',secs:15,weight:2},
  fire:{name:'Fireball',text:'The ball burns straight through bricks',secs:6,weight:2},
  life:{name:'Extra Life',text:'One more life',secs:0,weight:.4},
};
// What quiz answers buy. world is the world that must have been reached.
const SHELF=[
  {id:'wide',name:'Big Bat',text:'A wide paddle for the whole level',world:1},
  {id:'ball',name:'Buddy Ball',text:'Start with two balls',world:1},
  {id:'shield',name:'Safety Net',text:'A floor that saves one ball',world:1},
  {id:'slow',name:'Slow Start',text:'A slow ball for the first 20 seconds',world:2},
  {id:'laser',name:'Zap Start',text:'Shoot bricks for the first 15 seconds',world:3},
  {id:'life',name:'Extra Life',text:'Start with 4 lives',world:4},
];
const SLOW_START=20,LASER_START=15;

// The worlds. Each allows the brick characters and capsules of the ones before it, plus its own.
// The colours are mid-tones: light enough for a dark navy field, dark enough for a white one (the tests check both).
const WORLD_LIST=[
  {name:'Sunny Meadow',intro:'Break every brick!',chars:'.12',caps:['wide','multi','life'],
   colors:['#d8492a','#d2691e','#b8860b','#3f9a47','#1f948a','#3d7be0']},
  {name:'Candy Clouds',intro:'Sparkly bricks drop prizes',chars:'P',caps:['slow','shield'],
   colors:['#d6478f','#c95fd0','#8f6ce0','#3d86d8','#1f97a8','#d2691e']},
  {name:'Robot Yard',intro:'Steel bricks never break',chars:'#',caps:['laser'],
   colors:['#2f8fb8','#4a80d9','#7a70d8','#b05cc4','#cf5a3a','#b8860b']},
  {name:'Boom Mountain',intro:'Bombs blow up their neighbours',chars:'*',caps:['magnet'],
   colors:['#d8492a','#d2691e','#b8860b','#c2527a','#9a62d0','#5c7fd6']},
  {name:'Crystal Cave',intro:'Some bricks take three hits',chars:'3',caps:['fire'],
   colors:['#1f97a8','#2f8fd0','#5c7fe0','#8f6ce0','#bf5fc8','#3f9a47']},
  {name:'Star Station',intro:'Everything at once!',chars:'',caps:[],
   colors:['#8f6ce0','#d6478f','#d8492a','#b8860b','#3f9a47','#2f8fd0']},
];
const PER_WORLD=5;
// The pictures, five to a world, the fifth the biggest. See the top of the file for the characters.
const PICTURES=[
  // 1 Sunny Meadow: plain and two-hit bricks
  ['11111111','11111111','11111111'],
  ['11..11..','..11..11','11..11..','..11..11','11..11..','..11..11'],
  ['...11...','..1111..','.112211.','11111111'],
  ['11....11','121..121','.111111.','121..121','11....11'],
  ['2.2..2.2','22222222','11.11.11','11.11.11','11111111','1.1111.1'],
  // 2 Candy Clouds: power bricks
  ['..1111..','.1P11P1.','11111111','.11..11.'],
  ['22222222','........','1P1111P1','........','11111111'],
  ['1..11..1','..1PP1..','.112211.','..1221..','1..11..1'],
  ['12......','.221....','..1P1...','...122..','....1P1.','.....221','......21'],
  ['...PP...','..1111..','..2222..','.111111.','.2P22P2.','11111111','22222222'],
  // 3 Robot Yard: steel
  ['11111111','1#1111#1','11111111','.1P11P1.'],
  ['.111111.','.1#11#1.','.111111.','.1P..P1.','.122221.','..#..#..'],
  ['11.11.11','##.##.##','11.11.11','........','1P1221P1'],
  ['#111111#','.1P11P1.','#.2222.#','..1111..','#..11..#'],
  ['1.1..1.1','1#1PP1#1','11111111','.222222.','#.1221.#','.1P..P1.','11.##.11','.222222.'],
  // 4 Boom Mountain: bombs
  ['11111111','11*11*11','11111111','.1P22P1.','..1111..'],
  ['2222222*','.......1','*1111111','1.......','1111P11*'],
  ['...**...','..1111..','.11PP11.','.122221.','11#11#11'],
  ['1*1..1*1','111..111','#P1221P#','111..111','1*1..1*1','.22..22.'],
  ['*1.11.1*','11111111','.2*22*2.','11P11P11','#.1221.#','.11**11.','.222222.','..1111..'],
  // 5 Crystal Cave: three-hit bricks
  ['.333333.','.111111.','1P1111P1','.111111.'],
  ['...33...','..3113..','.31PP13.','..3113..','...33...'],
  ['3.3..3.3','1*1..1*1','3.3..3.3','1P1##1P1','.111111.','.3.33.3.'],
  ['33....33','3#1111#3','..1PP1..','..2**2..','.111111.'],
  ['3.3..3.3','33333333','1#1PP1#1','12222221','.1*11*1.','..1111..'],
  // 6 Star Station: everything
  ['...33...','..1PP1..','..1221..','.#1221#.','.*1111*.','11.##.11'],
  ['1..33..1','.1.PP.1.','22*11*22','.1.33.1.','1..##..1','.222222.'],
  ['.222222.','2......2','2.#PP#.2','2.1**1.2','2......2','.222222.'],
  ['3#....#3','31P11P13','.1*33*1.','31111113','3#....#3'],
  ['3*3..3*3','33333333','P#1221#P','12*33*21','.122221.','#.1PP1.#','.222222.','..3333..'],
];
const LAP=PICTURES.length;
const WORLDS=WORLD_LIST.map((w,i)=>({name:w.name,intro:w.intro,colors:w.colors,first:i*PER_WORLD+1,last:(i+1)*PER_WORLD}));
const levelNo=n=>clamp(Math.floor(+n)||1,1,MAX_LEVEL);

function world(n){
  n=levelNo(n);const lap=Math.floor((n-1)/LAP),index=Math.floor((n-1)%LAP/PER_WORLD),w=WORLDS[index];
  return {index,number:index+1,lap,name:w.name,intro:w.intro,colors:w.colors,first:w.first+lap*LAP,last:w.last+lap*LAP};
}
// The characters a world's pictures may use, and the capsules that may fall in a level.
const charsFor=index=>WORLD_LIST.slice(0,index+1).map(w=>w.chars).join('');
function capsulesFor(n){
  const w=world(n),upTo=w.lap>0?WORLD_LIST.length:w.index+1;
  return WORLD_LIST.slice(0,upTo).flatMap(x=>x.caps);
}
function speedFor(n,speed){
  n=levelNo(n);const lap=Math.floor((n-1)/LAP);
  return Math.min(LAP_CAP,Math.min(SPEED_CAP,SPEED_1+SPEED_STEP*(n-1))+LAP_STEP*lap)*(speedOk(speed)?SPEEDS[speed]:1);
}
function level(n){n=levelNo(n);return build(PICTURES[(n-1)%LAP],Math.floor((n-1)/LAP));}
// Turns a picture into bricks. On lap 1 and later, numbered bricks take one more hit for each lap, to a most of 3.
function build(rows,lap=0){
  const out=[];
  rows.forEach((line,row)=>[...line].forEach((ch,col)=>{
    if(ch==='.')return;
    const kind=ch==='#'?'steel':ch==='*'?'bomb':ch==='P'?'power':'plain',hp=kind==='plain'?Math.min(3,(+ch||1)+lap):1;
    out.push({x:SIDE+col*(BRICK_W+GAP),y:TOP+row*(BRICK_H+GAP),w:BRICK_W,h:BRICK_H,row,col,kind,hp,max:hp});
  }));
  return out;
}
function shelf(top){const reached=world(top).lap>0?WORLDS.length:world(top).number;return SHELF.map(b=>({...b,unlocked:b.world<=reached}));}

// ---------- a level in play ----------
function start(n,opts){
  n=levelNo(n);const o=opts&&typeof opts==='object'?opts:{},w=world(n),speedName=speedOk(o.speed)?o.speed:'normal';
  const open=shelf(Math.max(n,levelNo(o.top))).filter(b=>b.unlocked).map(b=>b.id),boosts=[];
  for(const id of Array.isArray(o.boosts)?o.boosts:[])if(open.includes(id)&&!boosts.includes(id)&&boosts.length<QUIZ)boosts.push(id);
  const has=id=>boosts.includes(id),base=speedFor(n,speedName);
  const s={level:n,world:w.index,lap:w.lap,speedName,bricks:level(n),paddle:{x:W/2,w:PADDLE_W},balls:[],capsules:[],shots:[],
    effects:{wide:0,slow:has('slow')?SLOW_START:0,laser:has('laser')?LASER_START:0,magnet:0,fire:0},wideAll:has('wide'),shield:has('shield'),
    lives:LIVES+(has('life')?1:0),lost:0,score:Math.max(0,Math.floor(+o.score)||0),combo:0,serving:true,aimable:true,aim:FIRST_AIM,over:null,
    base,speed:base,rally:0,time:0,idle:0,boosts,extraBall:has('ball'),shotIn:0,lifeDropped:false};
  fit(s);serve(s);return s;
}
// Sets the paddle's width and the ball speed from the effects that are on.
function fit(s){
  const p=s.paddle;p.w=PADDLE_W*(s.wideAll||s.effects.wide>0?WIDE:1);p.x=clamp(p.x,p.w/2,W-p.w/2);
  s.speed=s.base*(1+RALLY_STEP*Math.min(RALLY_MAX,Math.floor(s.rally/RALLY_HITS)))*(s.effects.slow>0?SLOW:1);
  for(const b of s.balls)if(b.stuck)seat(s,b);
}
// Keeps a ball that is sitting on the paddle on it.
function seat(s,b){const p=s.paddle,half=p.w/2;b.off=clamp(b.off,-half,half);b.x=clamp(p.x+b.off,BALL_R,W-BALL_R);b.y=PADDLE_Y-BALL_R;}
function serve(s){
  // Only the first serve of a level is aimed. To aim every serve, set aimable to true here.
  s.aimable=s.lost===0;
  s.serving=true;s.rally=0;s.combo=0;s.shots=[];
  s.balls=[{x:s.paddle.x,y:PADDLE_Y-BALL_R,vx:0,vy:0,stuck:true,off:0,hold:0,fire:s.effects.fire>0}];fit(s);
}
// Sends a ball off at angle a, measured from straight up (positive leans right).
function aim(s,b,a){b.vx=Math.sin(a)*s.speed;b.vy=-Math.cos(a)*s.speed;b.stuck=false;b.hold=0;}
const angleOf=b=>Math.atan2(b.vx,-b.vy);
const bounceAngle=(s,b)=>clamp((b.x-s.paddle.x)/(s.paddle.w/2),-1,1)*MAX_ANGLE;

function launch(s,rnd=Math.random){
  if(s.over)return false;
  if(s.serving){
    s.serving=false;const b=s.balls[0];aim(s,b,s.aimable?s.aim:(rnd()<.5?-1:1)*(.25+rnd()*.3));
    // The extra-ball boost: the first launch of the level sends a second ball the other way.
    if(s.extraBall){s.extraBall=false;s.balls.push({...b,vx:-b.vx});}
    return true;
  }
  let any=false;for(const b of s.balls)if(b.stuck){aim(s,b,bounceAngle(s,b));any=true;}
  return any;
}
// The aim of a serve the player aims. The angle stays between MIN_AIM and MAX_ANGLE from straight up, on either side.
const aiming=s=>!s.over&&s.serving&&s.aimable;
function setAim(s,x,y){
  if(!aiming(s)||!Number.isFinite(x)||!Number.isFinite(y))return;
  const b=s.balls[0],a=Math.atan2(x-b.x,b.y-y),side=a<0||(a===0&&s.aim<0)?-1:1;
  s.aim=side*clamp(Math.abs(a),MIN_AIM,MAX_ANGLE);
}
function turnAim(s,by){
  if(!aiming(s)||!Number.isFinite(by)||!by)return;
  const a=s.aim+by;s.aim=Math.abs(a)<MIN_AIM?(by>0?MIN_AIM:-MIN_AIM):clamp(a,-MAX_ANGLE,MAX_ANGLE);
}
// Walks the aim forward in small steps, as a ball would go, to the first brick or the ceiling.
function aimPath(s){
  if(!aiming(s))return [];
  const b=s.balls[0],pts=[{x:b.x,y:b.y}],live=s.bricks.filter(k=>k.hp>0),STEP=2;
  let x=b.x,y=b.y,dx=Math.sin(s.aim)*STEP,dy=-Math.cos(s.aim)*STEP,walls=0;
  for(let i=0;i<2000;i++){
    x+=dx;y+=dy;
    if(x<BALL_R||x>W-BALL_R){
      x=clamp(x,BALL_R,W-BALL_R);if(walls++)break;
      dx=-dx;pts.push({x,y});continue;
    }
    if(y<BALL_R){y=BALL_R;break;}
    if(live.some(k=>{const ex=x-clamp(x,k.x,k.x+k.w),ey=y-clamp(y,k.y,k.y+k.h);return ex*ex+ey*ey<=BALL_R*BALL_R;}))break;
  }
  pts.push({x,y});return pts;
}
function movePaddle(s,x){
  if(!Number.isFinite(x))return;
  const p=s.paddle;p.x=clamp(x,p.w/2,W-p.w/2);for(const b of s.balls)if(b.stuck)seat(s,b);
}
const left=s=>s.bricks.reduce((n,k)=>n+(k.kind!=='steel'&&k.hp>0?1:0),0);
const stars=s=>s.over!=='won'?0:s.lost===0?3:s.lost===1?2:1;

function step(s,dt,rnd=Math.random){
  const ev=[];if(s.over||s.serving||!(dt>0))return ev;
  // Small steps, so a fast ball cannot pass through a brick between two frames.
  const n=Math.max(1,Math.ceil(s.speed*dt/4)),h=dt/n;
  for(let i=0;i<n&&!s.over&&!s.serving;i++)tick(s,h,ev,rnd);
  return ev;
}
function tick(s,h,ev,rnd){
  s.time+=h;s.idle+=h;
  // Timed effects run down.
  const fx=s.effects;let changed=false;
  for(const kind in fx)if(fx[kind]>0){fx[kind]=Math.max(0,fx[kind]-h);if(!fx[kind]){changed=true;ev.push({type:'expire',kind});}}
  if(changed)fit(s);
  // The laser: a pair of shots from near the paddle's ends.
  s.shotIn=Math.max(0,s.shotIn-h);
  if(fx.laser>0&&!s.shotIn){
    s.shotIn=SHOT_EVERY;const p=s.paddle,y=PADDLE_Y-SHOT_H;
    s.shots.push({x:p.x-p.w/2+8,y},{x:p.x+p.w/2-8,y});ev.push({type:'shoot',x:p.x,y});
  }
  for(const sh of s.shots){
    sh.y-=SHOT_V*h;if(sh.y<0){sh.gone=true;continue;}
    const k=s.bricks.find(k=>k.hp>0&&sh.x+SHOT_W/2>=k.x&&sh.x-SHOT_W/2<=k.x+k.w&&sh.y<=k.y+k.h&&sh.y+SHOT_H>=k.y);
    if(k){sh.gone=true;if(k.kind==='steel')ev.push({type:'steel',x:sh.x,y:k.y+k.h,row:k.row,col:k.col,by:'shot'});else damage(s,k,1,'shot',ev,rnd);}
  }
  s.shots=s.shots.filter(sh=>!sh.gone);
  // Capsules fall; the paddle catches them.
  for(const c of s.capsules){
    c.y+=CAP_FALL*h;const p=s.paddle;
    if(c.y+CAP_H/2>=PADDLE_Y&&c.y-CAP_H/2<=PADDLE_Y+PADDLE_H&&Math.abs(c.x-p.x)<=p.w/2+CAP_W/2){c.gone=true;grab(s,c,ev);}
    else if(c.y-CAP_H/2>H){c.gone=true;ev.push({type:'miss',x:c.x,y:H,kind:c.kind});}
  }
  s.capsules=s.capsules.filter(c=>!c.gone);
  for(const b of [...s.balls])moveBall(s,b,h,ev,rnd);
  s.balls=s.balls.filter(b=>!b.gone);
  if(!left(s)){
    const points=100+50*s.lives;s.over='won';s.score+=points;ev.push({type:'won',points,stars:stars(s)});return;
  }
  if(!s.balls.length){
    s.lives--;s.lost++;
    if(s.lives>0){serve(s);ev.push({type:'lost',lives:s.lives});}else{s.over='lost';ev.push({type:'over'});}
  }
}
function moveBall(s,b,h,ev,rnd){
  const p=s.paddle,fire=s.effects.fire>0;b.fire=fire;
  if(b.stuck){
    // Held by the magnet: it rides the paddle until a tap, or lets go by itself.
    seat(s,b);b.hold-=h;
    if(b.hold<=0||!(s.effects.magnet>0)){aim(s,b,bounceAngle(s,b));ev.push({type:'release',x:b.x,y:b.y});}
    return;
  }
  // The speed can change under a moving ball (rally, slow), so its direction is kept and its speed reset.
  const v=Math.hypot(b.vx,b.vy);if(v){b.vx*=s.speed/v;b.vy*=s.speed/v;}else aim(s,b,0);
  b.x+=b.vx*h;b.y+=b.vy*h;
  if(b.x<BALL_R){b.x=BALL_R;b.vx=Math.abs(b.vx);ev.push({type:'wall',x:0,y:b.y});}
  if(b.x>W-BALL_R){b.x=W-BALL_R;b.vx=-Math.abs(b.vx);ev.push({type:'wall',x:W,y:b.y});}
  if(b.y<BALL_R){b.y=BALL_R;b.vy=Math.abs(b.vy);ev.push({type:'wall',x:b.x,y:0});}
  // The paddle: where the ball lands on it sets the angle, so the player can aim.
  if(b.vy>0&&b.y+BALL_R>=PADDLE_Y&&b.y-BALL_R<=PADDLE_Y+PADDLE_H&&Math.abs(b.x-p.x)<=p.w/2+BALL_R){
    b.y=PADDLE_Y-BALL_R;s.combo=0;
    const before=Math.floor(Math.min(s.rally,RALLY_HITS*RALLY_MAX)/RALLY_HITS);s.rally++;fit(s);
    if(Math.floor(Math.min(s.rally,RALLY_HITS*RALLY_MAX)/RALLY_HITS)>before)ev.push({type:'faster',speed:s.speed});
    if(s.effects.magnet>0){b.stuck=true;b.vx=b.vy=0;b.off=b.x-p.x;b.hold=HOLD;ev.push({type:'stick',x:b.x,y:b.y});return;}
    // Nothing may stall: after 12 s without a brick being damaged, each paddle bounce sends the ball towards a brick that
    // is left. Steel may be in the way of the straight line, so the aim is sometimes straight, sometimes by way of a side
    // wall or the ceiling (aiming at the brick's mirror image in that wall), and sometimes just a new angle.
    let a=bounceAngle(s,b),nudge=false;
    if(s.idle>=STALL){
      const todo=s.bricks.filter(k=>k.kind!=='steel'&&k.hp>0),k=todo[Math.min(todo.length-1,Math.floor(rnd()*todo.length))];
      if(k){
        let tx=k.x+k.w/2,ty=k.y+k.h/2;const way=Math.floor(rnd()*5);
        if(way===1)tx=2*BALL_R-tx;else if(way===2)tx=2*(W-BALL_R)-tx;else if(way===3)ty=2*BALL_R-ty;
        a=way===4?(rnd()*2-1)*NUDGE_ANGLE:clamp(Math.atan2(tx-b.x,b.y-ty),-NUDGE_ANGLE,NUDGE_ANGLE);nudge=true;
      }
    }
    aim(s,b,a);ev.push({type:'paddle',x:b.x,y:b.y,nudge});
  }
  for(const k of s.bricks){
    if(k.hp<=0)continue;
    const nx=clamp(b.x,k.x,k.x+k.w),ny=clamp(b.y,k.y,k.y+k.h),dx=b.x-nx,dy=b.y-ny;
    if(dx*dx+dy*dy>BALL_R*BALL_R)continue;
    const steel=k.kind==='steel';
    // A fire ball breaks the brick outright and carries on through it.
    if(fire&&!steel){damage(s,k,k.hp,'ball',ev,rnd);continue;}
    // Bounce off whichever face the ball is shallower into. A ball already moving away from that face has had its
    // bounce, so it does not hit the same brick twice.
    const ox=Math.min(b.x+BALL_R-k.x,k.x+k.w-(b.x-BALL_R)),oy=Math.min(b.y+BALL_R-k.y,k.y+k.h-(b.y-BALL_R));
    if(ox<oy){const away=b.x<k.x+k.w/2?-1:1;if(b.vx*away>0)continue;b.vx=-b.vx;}
    else{const away=b.y<k.y+k.h/2?-1:1;if(b.vy*away>0)continue;b.vy=-b.vy;}
    if(steel){
      ev.push({type:'steel',x:nx,y:ny,row:k.row,col:k.col,by:'ball'});
      // A ball caught in a loop between steel bricks is turned a little once the stall time has passed.
      if(s.idle>=STALL){const a=angleOf(b)+(rnd()-.5)*.6;b.vx=Math.sin(a)*s.speed;b.vy=-Math.cos(a)*s.speed;}
    }else damage(s,k,1,'ball',ev,rnd);
    break;
  }
  // A ball going almost sideways would take for ever to come down, so it always keeps some up-or-down speed.
  if(Math.abs(b.vy)<s.speed*MIN_RISE){b.vy=(b.vy<0?-1:1)*s.speed*MIN_RISE;const vx=Math.sqrt(s.speed*s.speed-b.vy*b.vy);b.vx=b.vx<0?-vx:vx;}
  if(b.y-BALL_R>H){
    if(s.shield){s.shield=false;b.y=H-BALL_R;b.vy=-Math.abs(b.vy);ev.push({type:'shield',x:b.x,y:H});}
    else{b.gone=true;if(s.balls.some(o=>o!==b&&!o.gone))ev.push({type:'drain',x:b.x,y:H});}
  }
}
// Takes hits off a brick. Breaking it scores, may drop a capsule, and sets off a bomb.
function damage(s,k,hits,by,ev,rnd){
  if(k.kind==='steel'||k.hp<=0)return;
  k.hp=Math.max(0,k.hp-hits);s.idle=0;const x=k.x+k.w/2,y=k.y+k.h/2;
  if(k.hp){ev.push({type:'hit',x,y,row:k.row,col:k.col,kind:k.kind,hp:k.hp,by});return;}
  const points=10*Math.min(COMBO_MAX,1+Math.floor(s.combo/COMBO_STEP));s.combo++;s.score+=points;
  ev.push({type:'break',x,y,row:k.row,col:k.col,kind:k.kind,by,points,combo:s.combo});
  if(k.kind==='power'||rnd()<DROP_CHANCE){const kind=choose(s,rnd);if(kind){if(kind==='life')s.lifeDropped=true;s.capsules.push({x,y,kind});ev.push({type:'drop',x,y,kind});}}
  if(k.kind==='bomb'){
    ev.push({type:'boom',x,y,row:k.row,col:k.col});
    for(const o of s.bricks)if(o!==k&&Math.abs(o.row-k.row)<=1&&Math.abs(o.col-k.col)<=1)damage(s,o,BOMB_HITS,'bomb',ev,rnd);
  }
}
// Which capsule falls: one the level allows and that would do something, the common ones more often.
function choose(s,rnd){
  const falling=kind=>s.capsules.some(c=>c.kind===kind);
  const pool=capsulesFor(s.level).filter(kind=>!(kind==='life'&&(s.lives>=MAX_LIVES||s.lifeDropped))&&!(kind==='shield'&&(s.shield||falling('shield')))&&!(kind==='multi'&&s.balls.length>=MAX_BALLS)&&!(kind==='wide'&&s.wideAll));
  let r=rnd()*pool.reduce((a,kind)=>a+CAPSULES[kind].weight,0);
  for(const kind of pool){r-=CAPSULES[kind].weight;if(r<0)return kind;}
  return pool[pool.length-1]||null;
}
// The paddle caught a capsule.
function grab(s,c,ev){
  const kind=c.kind;s.score+=50;ev.push({type:'catch',x:c.x,y:PADDLE_Y,kind,points:50});
  if(CAPSULES[kind].secs){s.effects[kind]=CAPSULES[kind].secs;if(kind==='laser')s.shotIn=0;fit(s);}
  else if(kind==='shield')s.shield=true;
  else if(kind==='life')s.lives=Math.min(MAX_LIVES,s.lives+1);
  else if(kind==='multi')for(const b of [...s.balls]){
    // Two more balls leave each ball, one to each side of its path (or of the way it would leave, for a ball the magnet holds).
    const a=b.stuck?bounceAngle(s,b):angleOf(b);
    for(const turn of [-SPLIT,SPLIT]){if(s.balls.length>=MAX_BALLS)break;const twin={...b};aim(s,twin,a+turn);s.balls.push(twin);}
  }
}

// ---------- saved data ----------
function clean(g){
  const o=g&&typeof g==='object'?g:{},int=(v,lo,hi)=>clamp(Math.floor(Number.isFinite(+v)?+v:lo),lo,hi);
  const level=int(o.level,1,MAX_LEVEL),top=Math.max(level,int(o.top,1,MAX_LEVEL)),st={};
  if(o.stars&&typeof o.stars==='object'&&!Array.isArray(o.stars))for(const key of Object.keys(o.stars).slice(0,2*MAX_LEVEL)){
    const n=+key,v=Math.floor(+o.stars[key]);
    if(Number.isInteger(n)&&n>=1&&n<=MAX_LEVEL&&v>=1)st[n]=Math.min(3,v);
  }
  return {level,top,best:int(o.best,0,1e9),subject:o.subject==='words'?'words':'math',speed:speedOk(o.speed)?o.speed:'normal',stars:st};
}
function record(g,s){
  const o=clean(g);if(!s||typeof s!=='object')return o;
  o.best=Math.max(o.best,Math.floor(+s.score)||0);const n=levelNo(s.level);
  if(s.over==='won'){o.stars[n]=Math.max(o.stars[n]||0,stars(s));o.level=Math.min(MAX_LEVEL,n+1);}else o.level=n;
  o.top=Math.max(o.top,o.level);return o;
}
return {W,H,COLS,SIDE,TOP,GAP,BRICK_W,BRICK_H,PADDLE_Y,PADDLE_H,PADDLE_W,BALL_R,MIN_AIM,MAX_ANGLE,CAP_W,CAP_H,SHOT_W,SHOT_H,LIVES,MAX_LIVES,MAX_BALLS,QUIZ,
  SPEEDS,PICTURES,WORLDS,CAPSULES,SHELF,world,level,build,capsulesFor,charsFor,speedFor,shelf,start,movePaddle,setAim,turnAim,aimPath,launch,step,left,stars,clean,record};
})();
