// Wonder Blocks: the game away from the page. A falling-block game where some pieces are special: they blow up, melt,
// zap, freeze time, squash the stack or float through it. No DOM, no timers and no clock: the page (index.html) passes in
// the time and the buttons, draws the state this file keeps, and turns the events it returns into sounds and sparks.
// Loaded as a classic script (global Blocks); test/blocks.test.mjs runs it in node.
//
// THE WELL is COLS (10) wide and ROWS (16) tall. state.board[y][x] is a row from the top: null for empty, or a code that
// says how to paint the block: a shape letter (I O T S Z J L) or the kind it came from (melt, ice, anvil, ghost).
// For a moment after a blast a cell can hold GONE, which the page draws as empty: the blocks above have yet to fall.
//
// A PIECE is {shape, kind, rot, x, y}. kind is null for a plain piece or one of KINDS:
//   boom   blows up everything within BLAST (2) squares of each of its blocks, itself included
//   melt   each block drips straight down until it rests on something, so it fills the gaps under the piece
//   zap    one small block: clears the whole row and the whole column it lands in
//   ice    freezes every row it touches solid: the gaps in those rows fill with ice, so the rows clear
//   anvil  a heavy square: when it lands the bottom CRUSH rows of the well are squashed away
//   ghost  each block slips through the stack into the deepest empty cell of its column. It only comes when the
//          stack has a covered hole for it to find
// A game starts with the kinds in START (plus any found in earlier games). Each new level uncovers the next one.
//
// LEVELS. state.power fills towards need(state.level): BLOCK for every block that goes, whether in a cleared row or a
// blast, so a full row is worth 10 and a weak player's bombs still move the bar. A level takes about four rows at first.
//
// PLAYING. start(opts) makes a state. The page calls step(state, seconds) every frame and move, rotate, soft and drop for
// the buttons. step and drop return events for the page to show:
//   {type:'drop', rows}                                       a hard drop fell this many rows
//   {type:'lock'|<kind>, cells, shape, removed, moves, zone}  the piece landed. removed are the blocks it destroyed
//                                                             ({x,y,c}), moves the blocks that slid ({x,y0,y1,c}), zone
//                                                             the cells its trick reached ([x,y])
//   {type:'settle', moves}                                    blocks fell into the space a blast or cleared row left
//   {type:'lines', rows, removed, points}                     full rows cleared
//   {type:'level', level}   {type:'unlock', kind}   {type:'spawn', shape, kind}   {type:'over'}
// state.phase is 'fall' while a piece is falling, 'fx' while a landing plays out (state.wait seconds between its steps)
// and 'over' when a new piece has no room.
var Blocks=(()=>{
const COLS=10,ROWS=16;
const ROW=10;        // power for a cleared row: one for each block in it, the same as a block blown up
const LOCK=.5;       // seconds a piece rests before it sticks
const RESETS=12;     // moves and landings that may restart that rest, so a piece cannot be kept loose for ever
const CRUSH=2;       // rows an anvil squashes
const BLAST=2;       // how far a boom reaches from each of its blocks
const GONE='x';
const SHAPES={I:{n:4,c:[[0,1],[1,1],[2,1],[3,1]]},O:{n:2,c:[[0,0],[1,0],[0,1],[1,1]]},T:{n:3,c:[[1,0],[0,1],[1,1],[2,1]]},
  S:{n:3,c:[[1,0],[2,0],[0,1],[1,1]]},Z:{n:3,c:[[0,0],[1,0],[1,1],[2,1]]},J:{n:3,c:[[0,0],[0,1],[1,1],[2,1]]},
  L:{n:3,c:[[2,0],[0,1],[1,1],[2,1]]},D:{n:1,c:[[0,0]]}};
const BAG=['I','O','T','S','Z','J','L'];
// The special kinds in the order they are found. say is the one line shown the first time a kind appears.
const KINDS=[
  {id:'boom',name:'Boom',say:'Blows up the blocks around it.'},
  {id:'melt',name:'Melt',say:'Melts down and fills the gaps under it.'},
  {id:'zap',name:'Zap',say:'Zaps away its whole row and its whole column.'},
  {id:'ice',name:'Ice',say:'Freezes its rows solid, so they clear.'},
  {id:'anvil',name:'Heavy',say:'So heavy it squashes the bottom rows flat.'},
  {id:'ghost',name:'Ghost',say:'Floats through blocks to fill hidden holes.'}];
const IDS=KINDS.map(k=>k.id),START=['boom','melt'];
// Seconds for a piece to fall one row at level 1, and the fastest it ever gets. Each level is 12% quicker.
const SPEEDS={chill:[1.1,.4],normal:[.8,.2],zippy:[.5,.1]};
const LINE=[0,100,300,500,800];
const WAIT={boom:.4,zap:.4,melt:.35,ghost:.45,anvil:.45,ice:.4,settle:.16,lines:.28};
// Power needed to finish a level: 40 at level 1, ten more each level, 80 at most.
const need=level=>ROW*Math.min(8,3+Math.max(1,level));
// True when some empty cell has a block above it.
const holes=board=>{for(let x=0;x<COLS;x++){let roof=false;for(let y=0;y<ROWS;y++){if(board[y][x]&&board[y][x]!==GONE)roof=true;else if(roof)return true;}}return false;};
const whole=v=>Number.isFinite(+v)?Math.max(0,Math.round(+v)):0;

// The squares a piece covers, as [x,y].
function cells(p){
  const {n,c}=SHAPES[p.shape],r=((p.rot%4)+4)%4;
  return c.map(([x,y])=>{for(let i=0;i<r;i++)[x,y]=[n-1-y,x];return [p.x+x,p.y+y];});
}
const fits=(s,p,dx=0,dy=0,rot=p.rot)=>cells({...p,x:p.x+dx,y:p.y+dy,rot}).every(([x,y])=>x>=0&&x<COLS&&y>=0&&y<ROWS&&!s.board[y][x]);
const empty=()=>Array.from({length:ROWS},()=>Array(COLS).fill(null));

function start(opts={},rnd=Math.random){
  const kinds=IDS.filter(k=>START.includes(k)||(Array.isArray(opts.kinds)&&opts.kinds.includes(k)));
  const s={board:empty(),piece:null,next:null,bag:[],score:0,lines:0,level:1,speed:SPEEDS[opts.speed]?opts.speed:'chill',
    phase:'fall',wait:0,fallT:0,lockT:0,resets:0,soft:false,power:0,until:2,lastKind:null,forced:null,kinds,found:[],pieces:0};
  s.next=draw(s,rnd);spawn(s,[],rnd);
  return s;
}
// Chooses the piece after next. Shapes come from a shuffled bag of all seven, so none stays away for long. Every third or
// fourth piece is special, and never the same kind twice running when there is another to send.
function draw(s,rnd){
  if(!s.bag.length){s.bag=BAG.slice();for(let i=s.bag.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[s.bag[i],s.bag[j]]=[s.bag[j],s.bag[i]];}}
  let shape=s.bag.pop(),kind=null;
  if(s.until<=0){
    const able=s.kinds.filter(k=>k!=='ghost'||holes(s.board)),pool=able.filter(k=>k!==s.lastKind),from=pool.length?pool:able;
    kind=s.forced||from[Math.min(from.length-1,Math.floor(rnd()*from.length))];
    s.forced=null;s.lastKind=kind;s.until=2+Math.floor(rnd()*2);
    if(kind==='zap'||kind==='anvil'){s.bag.push(shape);shape=kind==='zap'?'D':'O';}
  }else s.until--;
  return {shape,kind};
}
function spawn(s,ev,rnd){
  const d=s.next,n=SHAPES[d.shape].n;s.next=draw(s,rnd);
  s.piece={shape:d.shape,kind:d.kind,rot:0,x:Math.floor((COLS-n)/2),y:d.shape==='I'?-1:0};
  s.fallT=0;s.lockT=0;s.resets=0;s.soft=false;s.phase='fall';s.pieces++;
  if(!fits(s,s.piece)){s.phase='over';ev.push({type:'over'});}
  else ev.push({type:'spawn',shape:d.shape,kind:d.kind});
}
// Seconds for the falling piece to drop one row.
function interval(s){
  const [base,least]=SPEEDS[s.speed],iv=Math.max(least,base*Math.pow(.88,s.level-1));
  return s.soft?Math.min(iv,.05):iv;
}
const landing=s=>{let dy=0;while(fits(s,s.piece,0,dy+1))dy++;return s.piece.y+dy;};
const falling=s=>s.phase==='fall'&&!!s.piece;
const touch=s=>{if(!fits(s,s.piece,0,1)&&s.resets<RESETS){s.lockT=0;s.resets++;}};
function move(s,dx){if(!falling(s)||!fits(s,s.piece,dx,0))return false;s.piece.x+=dx;touch(s);return true;}
// Turns the piece a quarter (dir 1 is clockwise). Next to a wall or the stack it shifts a square or two to make room.
function rotate(s,dir=1){
  if(!falling(s))return false;const p=s.piece,rot=(p.rot+(dir<0?3:1))%4;
  for(const [dx,dy] of [[0,0],[-1,0],[1,0],[0,1],[0,-1],[-2,0],[2,0],[0,-2]])if(fits(s,p,dx,dy,rot)){p.x+=dx;p.y+=dy;p.rot=rot;touch(s);return true;}
  return false;
}
function soft(s,on){s.soft=!!on&&falling(s);}
function drop(s,rnd=Math.random){
  const ev=[];if(!falling(s))return ev;
  const y=landing(s),rows=y-s.piece.y;s.piece.y=y;s.score+=2*rows;ev.push({type:'drop',rows});
  lock(s,ev);run(s,ev,rnd);return ev;
}

// Puts a landed piece into a board and works its trick. Every cell the trick reaches is left as GONE for collapse to
// close up, so whatever is above a blast falls by the height of the blast.
function apply(board,p){
  const cs=cells(p).sort((a,b)=>b[1]-a[1]),k=p.kind,removed=[],moves=[],zone=[],seen=new Set();
  const hit=(x,y)=>{if(x<0||x>=COLS||y<0||y>=ROWS||seen.has(x+','+y))return;seen.add(x+','+y);zone.push([x,y]);
    const c=board[y][x];if(c&&c!==GONE)removed.push({x,y,c});board[y][x]=GONE;};
  if(k==='boom')for(const [x,y] of cs)for(let dy=-BLAST;dy<=BLAST;dy++)for(let dx=-BLAST;dx<=BLAST;dx++)hit(x+dx,y+dy);
  else if(k==='zap'){const [x,y]=cs[0];for(let i=0;i<COLS;i++)hit(i,y);for(let j=0;j<ROWS;j++)hit(x,j);}
  else if(k==='melt')for(const [x,y] of cs){let y1=y;while(y1+1<ROWS&&!board[y1+1][x])y1++;board[y1][x]='melt';moves.push({x,y0:y,y1,c:'melt'});}
  else if(k==='ghost')for(const [x,y] of cs){let y1=y;for(let j=ROWS-1;j>y;j--)if(!board[j][x]){y1=j;break;}board[y1][x]='ghost';moves.push({x,y0:y,y1,c:'ghost'});}
  else{for(const [x,y] of cs)board[y][x]=k||p.shape;
    if(k==='ice')for(const y of new Set(cs.map(c=>c[1])))for(let x=0;x<COLS;x++)if(!board[y][x]){board[y][x]='ice';zone.push([x,y]);}
    if(k==='anvil')for(let j=ROWS-CRUSH;j<ROWS;j++)for(let i=0;i<COLS;i++)hit(i,j);}
  return {cells:cs,removed,moves,zone};
}
// Closes up the GONE cells: in each column everything above one falls by one. Gaps outside the blast stay gaps.
function collapse(board){
  const moves=[];
  for(let x=0;x<COLS;x++){let w=ROWS-1;
    for(let y=ROWS-1;y>=0;y--){const c=board[y][x];if(c===GONE)continue;if(w!==y){board[w][x]=c;if(c)moves.push({x,y0:y,y1:w,c});}w--;}
    for(;w>=0;w--)board[w][x]=null;}
  return moves;
}
function lock(s,ev){
  const p=s.piece,k=p.kind;s.piece=null;s.soft=false;
  const r=apply(s.board,p);
  s.score+=10*r.removed.length;s.power+=r.removed.length;
  ev.push({type:k||'lock',shape:p.shape,...r});
  s.phase='fx';s.wait=WAIT[k]||0;
}
// The next step of a landing: let blocks fall into what a blast left, then clear full rows and let the rows above fall,
// then bring the next piece. A piece has four blocks, so at most four rows can fill at once.
function advance(s,ev,rnd){
  if(s.board.some(r=>r.includes(GONE))){const moves=collapse(s.board);ev.push({type:'settle',moves});s.wait=moves.length?WAIT.settle:0;return;}
  const rows=[];for(let y=0;y<ROWS;y++)if(s.board[y].every(Boolean))rows.push(y);
  if(rows.length){
    const removed=[];for(const y of rows)for(let x=0;x<COLS;x++){removed.push({x,y,c:s.board[y][x]});s.board[y][x]=GONE;}
    const points=LINE[rows.length]*s.level;
    s.score+=points;s.lines+=rows.length;s.power+=ROW*rows.length;ev.push({type:'lines',rows,removed,points});s.wait=WAIT.lines;return;
  }
  if(s.power>=need(s.level)){s.power=Math.min(s.power-need(s.level),need(s.level+1)-1);s.level++;ev.push({type:'level',level:s.level});   // one level a landing, however big
    const k=IDS.find(id=>!s.kinds.includes(id));
    if(k){s.kinds.push(k);s.found.push(k);s.forced=k;s.until=0;ev.push({type:'unlock',kind:k});}}
  spawn(s,ev,rnd);
}
const run=(s,ev,rnd)=>{while(s.phase==='fx'&&s.wait<=0)advance(s,ev,rnd);};
function step(s,dt,rnd=Math.random){
  const ev=[];dt=Math.min(Math.max(+dt||0,0),.1);
  if(s.phase==='fx'){s.wait-=dt;run(s,ev,rnd);return ev;}
  if(!falling(s))return ev;
  const p=s.piece;
  if(fits(s,p,0,1)){
    s.fallT+=dt;const iv=interval(s);
    while(s.fallT>=iv&&fits(s,p,0,1)){p.y++;s.fallT-=iv;if(s.soft)s.score++;}
    if(!fits(s,p,0,1)){s.fallT=0;if(s.resets<RESETS){s.lockT=0;s.resets++;}}   // landing again (after a turn lifted it) uses up a restart too
  }else{s.lockT+=dt;if(s.lockT>=LOCK){lock(s,ev);run(s,ev,rnd);}}
  return ev;
}
// Where the falling piece would land and what its trick would do there, for the page to hint at:
// {cells, zone, hits, land}. land is where melt and ghost blocks would end up.
function preview(s){
  if(!falling(s))return null;
  const board=s.board.map(r=>r.slice()),r=apply(board,{...s.piece,y:landing(s)});
  return {cells:r.cells,zone:r.zone,hits:r.removed.map(c=>[c.x,c.y]),land:r.moves.map(m=>[m.x,m.y1])};
}

// The game's saved data, kept in profile.games['wonder-blocks']: best score, most lines, games played, the speed chosen,
// the kinds found so far and the kinds whose first-time card has been shown.
function clean(d){
  d=d&&typeof d==='object'&&!Array.isArray(d)?d:{};const list=v=>IDS.filter(k=>Array.isArray(v)&&v.includes(k));
  return {best:whole(d.best),lines:whole(d.lines),games:whole(d.games),speed:SPEEDS[d.speed]?d.speed:'chill',
    kinds:IDS.filter(k=>START.includes(k)||list(d.kinds).includes(k)),told:list(d.told)};
}
// Adds a finished game to the saved data. Returns true when it beat the best score.
function record(d,s){
  const beat=s.score>d.best;d.games++;d.best=Math.max(d.best,s.score);d.lines=Math.max(d.lines,s.lines);
  d.kinds=IDS.filter(k=>d.kinds.includes(k)||s.kinds.includes(k));return beat;
}
return {COLS,ROWS,ROW,LOCK,CRUSH,need,holes,BLAST,GONE,SHAPES,KINDS,START,SPEEDS,start,step,move,rotate,soft,drop,cells,fits,landing,interval,preview,apply,collapse,clean,record};
})();
