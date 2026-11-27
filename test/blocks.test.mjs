// Tests for Wonder Blocks' logic (site/wonder-blocks/game.js): the pieces, moving and turning, landing, clearing rows, each
// special kind, levels and the kinds they uncover, speed, the landing hint and saved data. A robot plays whole games with
// fixed randomness to show that the rules hold together. The robot stands in for a player: it does not show the game is fun.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ctx={};vm.runInNewContext(readFileSync(new URL('../site/wonder-blocks/game.js',import.meta.url),'utf8'),ctx);
const B=ctx.Blocks,plain=v=>JSON.parse(JSON.stringify(v));
const seeded=a=>()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

// ---------- helpers ----------
// A board from a picture of its bottom rows: '.' is empty and any other character a block.
const pic=(...rows)=>{const b=Array.from({length:B.ROWS},()=>Array(B.COLS).fill(null));
  rows.forEach((r,i)=>[...r].forEach((ch,x)=>{if(ch!=='.')b[B.ROWS-rows.length+i][x]=ch==='#'?'T':ch;}));return b;};
// The bottom n rows as a picture: '#' for any block.
const show=(s,n)=>s.board.slice(B.ROWS-n).map(r=>r.map(c=>c?'#':'.').join(''));
// A game with a chosen board and falling piece. No special pieces come unless asked for.
const game=(rows,piece,opts)=>{const s=B.start(opts,seeded(1));s.board=pic(...rows);s.until=99;s.next={shape:'O',kind:null};
  s.piece={shape:'O',kind:null,rot:0,x:4,y:0,...piece};return s;};
const types=ev=>Array.from(ev,e=>e.type);
// Runs the game until the landing has played out and the next piece is falling.
const settle=(s,ev=[])=>{for(let i=0;i<400&&s.phase==='fx';i++)ev.push(...B.step(s,.05,seeded(2)));return ev;};
const land=(s)=>{const ev=B.drop(s,seeded(2));return settle(s,ev);};
const filled=s=>s.board.flat().filter(Boolean).length;

test('the seven shapes have four blocks each and turn in place',()=>{
 for(const sh of ['I','O','T','S','Z','J','L']){
  const seen=[];for(let rot=0;rot<4;rot++){const cs=B.cells({shape:sh,rot,x:3,y:5});assert.equal(cs.length,4,sh);
   assert.equal(new Set(cs.map(String)).size,4,sh+' blocks do not overlap');
   const n=B.SHAPES[sh].n;for(const [x,y] of cs)assert.ok(x>=3&&x<3+n&&y>=5&&y<5+n,sh+' stays in its box');
   seen.push(cs.map(String).sort().join(' '));}
  assert.equal(B.cells({shape:sh,rot:4,x:3,y:5}).map(String).sort().join(' '),seen[0],sh+' four turns make a full circle');
  assert.equal(B.cells({shape:sh,rot:-1,x:3,y:5}).map(String).sort().join(' '),seen[3],sh+' turns the other way');}
 assert.equal(new Set([0,1,2,3].map(r=>B.cells({shape:'O',rot:r,x:0,y:0}).map(String).sort().join())).size,1,'a square looks the same every way up');
 assert.deepEqual(plain(B.cells({shape:'D',rot:2,x:7,y:9})),[[7,9]]);
});

test('a new game: an empty well, a piece at the top and one waiting',()=>{
 const s=B.start({},seeded(3));
 assert.equal(s.board.length,B.ROWS);assert.ok(s.board.every(r=>r.length===B.COLS&&r.every(c=>c===null)));
 assert.equal(s.phase,'fall');assert.ok(s.piece&&s.next);assert.equal(s.level,1);assert.equal(s.score,0);assert.equal(s.speed,'chill');
 assert.ok(B.cells(s.piece).some(([,y])=>y===0),'the piece starts on the top row');
 assert.deepEqual(plain(s.kinds),['boom','melt']);
 assert.deepEqual(plain(B.start({kinds:['ghost','zap','nonsense'],speed:'zippy'},seeded(3)).kinds),['boom','melt','zap','ghost'],'kinds found before are in from the start');
 assert.equal(B.start({speed:'warp'},seeded(3)).speed,'chill');
});

test('pieces come from a bag of seven, and every third or fourth is special',()=>{
 for(const seed of [1,2,3,4,5]){
  const rnd=seeded(seed),s=B.start({kinds:['zap','ice','anvil','ghost']},rnd),got=[];
  for(let i=0;i<400;i++){got.push({...s.piece});s.board=pic();B.drop(s,rnd);settle(s);}
  const plainOnes=got.filter(p=>!p.kind),counts={};for(const p of plainOnes)counts[p.shape]=(counts[p.shape]||0)+1;
  assert.deepEqual(Object.keys(counts).sort(),['I','J','L','O','S','T','Z']);
  for(const k of Object.keys(counts))assert.ok(counts[k]>25,k+' comes often enough: '+counts[k]);
  let gap=0;const gaps=[];for(const p of got){if(p.kind){gaps.push(gap);gap=0;}else gap++;}
  assert.equal(gaps[0],2,'the third piece of a game is the first special one');
  assert.ok(gaps.slice(1).every(g=>g===2||g===3),'then two or three plain pieces between specials');
  const kinds=got.filter(p=>p.kind);assert.deepEqual([...new Set(kinds.map(p=>p.kind))].sort(),['anvil','boom','ghost','ice','melt','zap']);
  for(let i=1;i<kinds.length;i++)assert.notEqual(kinds[i].kind,kinds[i-1].kind,'never the same kind twice running');
  for(const p of kinds){if(p.kind==='zap')assert.equal(p.shape,'D');else if(p.kind==='anvil')assert.equal(p.shape,'O');else assert.notEqual(p.shape,'D');}
  assert.ok(plainOnes.every(p=>p.shape!=='D'),'the single block is only ever a zap');}
});

test('moving stops at the walls and at other blocks',()=>{
 const s=game(['..........'],{shape:'O',x:4,y:0});
 let n=0;while(B.move(s,-1))n++;assert.equal(n,4);assert.equal(s.piece.x,0);
 n=0;while(B.move(s,1))n++;assert.equal(n,8);assert.equal(s.piece.x,8);
 const t=game(['...#......','...#......'],{shape:'O',x:4,y:B.ROWS-2});
 assert.equal(B.move(t,-1),false,'a block is in the way');assert.equal(B.move(t,1),true);
});

test('turning: next to a wall the piece shifts over, and with no room it stays as it was',()=>{
 const s=game([],{shape:'I',rot:1,x:-2,y:5});   // upright against the left wall
 assert.deepEqual(plain(B.cells(s.piece)).map(c=>c[0]),[0,0,0,0]);
 assert.equal(B.rotate(s),true);assert.ok(B.cells(s.piece).every(([x])=>x>=0&&x<B.COLS));assert.equal(new Set(B.cells(s.piece).map(c=>c[1])).size,1,'it now lies flat');
 const r=game([],{shape:'I',rot:1,x:7,y:5});assert.equal(B.rotate(r,-1),true);assert.ok(B.cells(r.piece).every(([x])=>x<B.COLS));
 const tight=game(['#.########','#.########','#.########','#.########'],{shape:'I',rot:1,x:-1,y:B.ROWS-4});   // down a one-wide shaft
 const before=plain(tight.piece);assert.equal(B.rotate(tight),false);assert.deepEqual(plain(tight.piece),before);
 const o=game([],{shape:'O',x:4,y:3});assert.equal(B.rotate(o),true);assert.equal(o.piece.x,4);
 const f=game(['..........'],{shape:'T',rot:0,x:4,y:B.ROWS-2});   // flat on the floor: turning lifts it a row
 assert.equal(B.rotate(f),true);assert.ok(B.cells(f.piece).every(([,y])=>y<B.ROWS));
});

test('a piece falls a row at a time, rests for a moment, then sticks',()=>{
 const s=game([],{shape:'O',x:4,y:0});const iv=B.interval(s);assert.ok(Math.abs(iv-1.1)<1e-9);
 B.step(s,.1);assert.equal(s.piece.y,0);
 for(let t=0;t<iv+.01;t+=.05)B.step(s,.05);assert.equal(s.piece.y,1,'one row after one interval');
 B.step(s,5);assert.equal(s.piece.y,1,'a long stall (a hidden tab) does not make it jump');
 s.piece.y=B.ROWS-2;s.fallT=0;
 for(let t=0;t<B.LOCK-.06;t+=.05)assert.deepEqual(types(B.step(s,.05)),[]);
 assert.ok(s.piece,'still loose just before the rest is up');
 const ev=[];for(let i=0;i<4;i++)ev.push(...B.step(s,.05));
 assert.deepEqual(types(ev),['lock','spawn']);assert.deepEqual(show(s,2),['....##....','....##....']);
 assert.equal(s.board[B.ROWS-1][4],'O','a plain block is painted as its shape');
});

test('sliding a resting piece restarts its rest, but only so many times',()=>{
 const s=game([],{shape:'O',x:4,y:B.ROWS-2});
 for(let i=0;i<8;i++){B.step(s,.1);B.step(s,.1);B.step(s,.1);B.step(s,.1);assert.ok(B.move(s,i%2?1:-1));}
 assert.ok(s.piece&&s.piece.shape==='O'&&s.phase==='fall'&&s.pieces===1,'eight slides in, it is still loose');
 let stuck=false;for(let i=0;i<40&&!stuck;i++){for(let j=0;j<4;j++)B.step(s,.1);if(s.pieces>1)stuck=true;else B.move(s,i%2?1:-1);}
 assert.ok(stuck,'it sticks in the end however much it is slid');
});

test('soft drop is fast and hard drop lands at once; both score a little',()=>{
 const s=game([],{shape:'O',x:4,y:0});B.soft(s,true);assert.ok(B.interval(s)<=.05);
 for(let i=0;i<10;i++)B.step(s,.05);assert.ok(s.piece.y>=9);assert.equal(s.score,s.piece.y);
 B.soft(s,false);assert.ok(B.interval(s)>1);
 const h=game(['####......'],{shape:'O',x:0,y:0});assert.equal(B.landing(h),B.ROWS-3);
 const ev=B.drop(h,seeded(1));assert.equal(ev[0].type,'drop');assert.equal(ev[0].rows,B.ROWS-3);assert.equal(h.score,2*(B.ROWS-3));
 assert.deepEqual(show(h,3),['##........','##........','####......']);assert.equal(h.pieces,2);assert.equal(h.soft,false,'the next piece does not start out fast');
});

test('full rows clear, the rows above come down, and more rows at once score more',()=>{
 const one=game(['#.........','########..'],{shape:'O',x:8,y:0});const ev=land(one);
 assert.deepEqual(types(ev),['drop','lock','lines','settle','spawn']);
 const l=ev.find(e=>e.type==='lines');assert.deepEqual(plain(l.rows),[B.ROWS-1]);assert.equal(l.removed.length,B.COLS);assert.equal(l.points,100);
 assert.deepEqual(show(one,2),['..........','#.......##'],'the row above came down with what was left of the square');
 assert.equal(one.lines,1);assert.equal(one.score,100+2*(B.ROWS-2));
 const four=game(['#########.','#########.','#########.','#########.'],{shape:'I',rot:1,x:7,y:0});const e4=land(four);
 assert.equal(e4.find(e=>e.type==='lines').points,800);assert.equal(four.lines,4);assert.equal(filled(four),0);
 assert.ok(types(e4).includes('level'),'four lines is a level');assert.equal(four.level,2);
 const lv=game(['########..','########..'],{shape:'O',x:8,y:0});lv.level=3;lv.lines=8;
 assert.equal(land(lv).find(e=>e.type==='lines').points,900,'points are multiplied by the level');
 const split=game(['#########.','##........','#########.','##........'],{shape:'I',rot:1,x:7,y:0});land(split);   // the first and third rows of the picture fill and clear; the other two stay
 assert.deepEqual(show(split,2),['##.......#','##.......#']);
});

test('boom: blows up everything within two squares of its blocks, and what is above falls in',()=>{
 const s=game(['###.......','###.......','###.......','###.......'],{shape:'D',kind:'boom',x:1,y:0});
 const ev=land(s);assert.deepEqual(types(ev),['drop','boom','settle','spawn']);
 const b=ev.find(e=>e.type==='boom');assert.equal(b.removed.length,6,'the two rows under it');assert.equal(b.zone.length,20,'five rows, and four columns as the wall cuts one off');
 assert.deepEqual(show(s,4),['..........','..........','###.......','###.......']);assert.equal(s.score,60+2*(B.ROWS-5));
 const t=game(['######....','######....','######....'],{shape:'I',kind:'boom',x:0,y:0});land(t);
 assert.deepEqual(show(t,3),['..........','..........','######....'],'a long bomb takes two rows, two blocks past its end');
 const hang=game(['.#........','.#........','.#........','.#........','###.......','###.......'],{shape:'D',kind:'boom',x:0,y:0});land(hang);
 assert.deepEqual(show(hang,6),['..........','..........','..........','..........','..........','.#........'],'the block above the blast falls to the floor');
 const far=game(['....#.....','....#.#...','###.#.#...'],{shape:'D',kind:'boom',x:0,y:0});land(far);
 assert.deepEqual(show(far,3),['....#.....','....#.#...','....#.#...'],'blocks out of reach are untouched, gaps and all');
});

test('melt: each block drips down to rest, filling the gaps under the piece',()=>{
 const s=game(['#.........','#.........','#..#......'],{shape:'I',kind:'melt',x:0,y:0});const ev=land(s);
 assert.deepEqual(types(ev),['drop','melt','spawn']);
 assert.deepEqual(show(s,4),['#.........','#.........','#..#......','####......']);
 const m=ev.find(e=>e.type==='melt');assert.equal(m.moves.length,4);assert.equal(m.moves.filter(v=>v.y1>v.y0).length,3,'three of the four blocks slid down');
 assert.equal(s.board[B.ROWS-1][1],'melt');assert.equal(filled(s),4+4);
 const up=game(['..........'],{shape:'I',kind:'melt',rot:1,x:2,y:0});land(up);
 assert.equal(up.board.filter(r=>r[4]==='melt').length,4,'an upright piece stays a stack of four');
 const fill=game(['####.#####','####.#####'],{shape:'O',kind:'melt',x:4,y:0});const ef=land(fill);
 assert.ok(types(ef).includes('lines'),'melting into a gap can finish rows');assert.equal(fill.lines,2);
 assert.deepEqual(show(fill,2),['.....#....','.....#....'],'the two blocks with no gap under them are left');
});

test('zap: clears its whole row and column, and the row counts as a line',()=>{
 const s=game(['#.#.......','#.########','#.########'],{shape:'D',kind:'zap',x:1,y:0});const ev=land(s);
 assert.deepEqual(types(ev),['drop','zap','settle','spawn']);
 const z=ev.find(e=>e.type==='zap');assert.equal(z.removed.length,9,'the bottom row: nothing else was in its column');assert.equal(z.zone.length,B.COLS+B.ROWS-1);
 assert.deepEqual(show(s,3),['..........','#.#.......','#.########']);assert.equal(s.lines,1);assert.equal(s.score,90+2*(B.ROWS-1));
 const col=game(['...#......','...#......','####.#####'],{shape:'D',kind:'zap',x:3,y:0});land(col);
 assert.equal(filled(col),8,'it landed on top of the column: that column and its own (empty) row went');assert.equal(col.lines,0,'no blocks in its row, so no line');
});

test('ice: lands as blocks, then five pieces fall slowly',()=>{
 const s=game([],{shape:'O',kind:'ice',x:4,y:0});const fast=B.interval(s);const ev=land(s);
 assert.deepEqual(types(ev),['drop','ice','spawn']);assert.equal(s.board[B.ROWS-1][4],'ice');assert.equal(s.slow,B.ICE);
 assert.ok(B.interval(s)>=fast*2,'falling is at least twice as slow');
 s.level=9;assert.ok(B.interval(s)>=1.4,'and never fast while frozen, even on a high level');s.level=1;
 for(let i=0;i<B.ICE;i++){assert.ok(s.slow>0,'piece '+(i+1)+' is slow');s.board=pic();B.drop(s,seeded(1));settle(s);}
 assert.equal(s.slow,0);assert.ok(Math.abs(B.interval(s)-fast)<1e-9);
});

test('anvil: squashes the bottom two rows, and they count as lines',()=>{
 const s=game(['#.........','##........','###.......','####......'],{shape:'O',kind:'anvil',x:6,y:0});const ev=land(s);
 assert.deepEqual(types(ev),['drop','anvil','settle','spawn']);
 assert.deepEqual(show(s,4),['..........','..........','#.........','##........']);
 const a=ev.find(e=>e.type==='anvil');assert.equal(a.removed.length,3+4+4,'the two rows and the anvil itself, which was sitting in them');assert.equal(a.zone.length,2*B.COLS);
 assert.equal(s.lines,2);
 const top=game(['###.......','###.......','###.......','###.......'],{shape:'O',kind:'anvil',x:0,y:0});land(top);
 assert.deepEqual(show(top,4),['##........','##........','###.......','###.......'],'on a tall stack the anvil stays and the stack sinks under it');
 assert.equal(top.board[B.ROWS-4][0],'anvil');
});

test('ghost: each block slips through into the deepest hole in its column',()=>{
 const s=game(['###.......','#.#.......','.##.......','#.#.......'],{shape:'I',kind:'ghost',x:0,y:0});const ev=land(s);
 assert.deepEqual(types(ev),['drop','ghost','spawn']);
 assert.deepEqual(show(s,5),['..#.......','###.......','#.#.......','###.......','####......'],'one block a column: the third column has no hole, so its block stays on top');
 assert.equal(s.board[B.ROWS-1][1],'ghost');assert.equal(s.board[B.ROWS-2][0],'ghost');assert.equal(s.board[B.ROWS-1][3],'ghost','with no stack under it a ghost block goes to the floor');
 const g=ev.find(e=>e.type==='ghost');assert.equal(g.moves.length,4);
 const none=game(['####......','####......'],{shape:'I',kind:'ghost',x:0,y:0});land(none);
 assert.deepEqual(show(none,3),['####......','####......','####......'],'with no holes it lands like any piece');
 const two=game(['#.........','..........','..........','#.........','..........'],{shape:'I',kind:'ghost',rot:1,x:-2,y:0});land(two);
 assert.equal(two.board.map(r=>r[0]).filter(c=>c==='ghost').length,4,'an upright ghost fills holes from the deepest up');
 assert.equal(two.board[B.ROWS-1][0],'ghost');assert.equal(two.board[B.ROWS-3][0],'ghost');assert.equal(two.board[B.ROWS-4][0],'ghost');
 const fin=game(['####.#####'],{shape:'T',kind:'ghost',x:3,y:0});fin.board[B.ROWS-2]=Array(B.COLS).fill('T');   // a hole buried under a solid row
 const ef=land(fin);assert.ok(types(ef).includes('lines'),'filling a buried hole finishes the row');
});

test('every four lines is a level, and each level uncovers the next kind and sends it next',()=>{
 const s=game([],{shape:'I',rot:1,x:7,y:0});const found=[];
 for(let lv=2;lv<=8;lv++){
  s.board=pic('#########.','#########.','#########.','#########.');s.piece={shape:'I',kind:null,rot:1,x:7,y:0};s.until=99;
  const ev=land(s);assert.equal(s.level,lv);assert.deepEqual(plain(ev.find(e=>e.type==='level')),{type:'level',level:lv});
  const u=ev.find(e=>e.type==='unlock');
  if(u){found.push(u.kind);assert.equal(s.next.kind,u.kind,'the new kind is the very next piece');assert.ok(s.kinds.includes(u.kind));}
  else assert.ok(lv>5,'nothing left to find after the sixth kind');}
 assert.deepEqual(found,['zap','ice','anvil','ghost']);assert.deepEqual(plain(s.found),found);
 const known=game(['#########.','#########.','#########.','#########.'],{shape:'I',rot:1,x:7,y:0},{kinds:['zap']});
 assert.equal(land(known).find(e=>e.type==='unlock').kind,'ice','a player who already has zap finds ice at level 2');
});

test('speed: each level is quicker, down to a floor, and the three speeds differ',()=>{
 for(const sp of ['chill','normal','zippy']){
  const s=B.start({speed:sp},seeded(1));let last=Infinity;
  for(let lv=1;lv<=40;lv++){s.level=lv;const iv=B.interval(s);assert.ok(iv<=last);assert.ok(iv>=B.SPEEDS[sp][1]-1e-9);last=iv;}
  assert.ok(Math.abs(last-B.SPEEDS[sp][1])<1e-9,sp+' reaches its fastest');}
 const at=sp=>B.interval(B.start({speed:sp},seeded(1)));assert.ok(at('chill')>at('normal')&&at('normal')>at('zippy'));
 assert.ok(at('chill')>=1,'the gentle speed gives a second a row to start');
});

test('the game ends when a new piece has no room',()=>{
 const s=game([],{shape:'O',x:4,y:2});for(let y=0;y<B.ROWS;y++)for(let x=3;x<7;x++)if(y>3)s.board[y][x]='T';
 const ev=land(s);assert.equal(s.phase,'fall');assert.ok(types(ev).includes('spawn'));
 s.board[1][4]='T';s.board[1][5]='T';s.board[0][4]='T';s.board[0][5]='T';
 const end=land(s);assert.ok(types(end).includes('over'));assert.equal(s.phase,'over');
 const score=s.score;assert.deepEqual(plain(B.step(s,1)),[]);assert.deepEqual(plain(B.drop(s)),[]);assert.equal(B.move(s,1),false);assert.equal(B.rotate(s),false);assert.equal(s.score,score);
});

test('the landing hint shows where the piece will rest and what its trick will reach',()=>{
 const s=game(['###.......','###.......'],{shape:'D',kind:'boom',x:1,y:0});const before=plain(s);
 const p=B.preview(s);assert.deepEqual(plain(p.cells),[[1,B.ROWS-3]]);assert.equal(p.zone.length,20);assert.equal(p.hits.length,6);
 assert.deepEqual(plain(s),before,'looking ahead changes nothing');
 const m=game(['#.........','#..#......'],{shape:'I',kind:'melt',x:0,y:0});
 assert.deepEqual(plain(B.preview(m).land).map(String).sort(),[[0,B.ROWS-3],[1,B.ROWS-1],[2,B.ROWS-1],[3,B.ROWS-2]].map(String).sort());
 const z=game(['#.########'],{shape:'D',kind:'zap',x:1,y:0});assert.equal(B.preview(z).hits.length,9);
 const n=game([],{shape:'T',x:4,y:0});const pn=B.preview(n);assert.equal(pn.cells.length,4);assert.equal(pn.zone.length,0);assert.equal(pn.land.length,0);
 n.phase='over';assert.equal(B.preview(n),null);
});

test('saved data is checked on the way in, and a finished game is added to it',()=>{
 assert.deepEqual(plain(B.clean(null)),{best:0,lines:0,games:0,speed:'chill',kinds:['boom','melt'],told:[]});
 assert.deepEqual(plain(B.clean({best:'1200',lines:-3,games:2.6,speed:'zippy',kinds:['ghost','zap','zap','hack'],told:['boom',7,'ice'],extra:1})),
  {best:1200,lines:0,games:3,speed:'zippy',kinds:['boom','melt','zap','ghost'],told:['boom','ice']});
 assert.deepEqual(plain(B.clean([1,2])),plain(B.clean({})));assert.equal(B.clean({speed:'x'}).speed,'chill');
 const d=B.clean({best:500,lines:9,games:1,kinds:['zap']}),s=B.start({kinds:d.kinds},seeded(1));s.score=800;s.lines=6;s.kinds.push('ice');
 assert.equal(B.record(d,s),true);assert.deepEqual(plain(d),{best:800,lines:9,games:2,speed:'chill',kinds:['boom','melt','zap','ice'],told:[]});
 s.score=100;assert.equal(B.record(d,s),false);assert.equal(d.best,800);assert.equal(d.games,3);
 assert.deepEqual(plain(B.clean(plain(d))),plain(d),'what is saved loads back the same');
});

// A robot that tries every column and turn for each piece and keeps the placement that leaves the lowest, flattest stack.
function robot(seed,opts,max=600){
 const rnd=seeded(seed),s=B.start(opts,rnd),seen=new Set(),kinds=new Set();let pieces=0;
 const score=b=>{let holes=0,height=0,bumps=0,prev=null;
  for(let x=0;x<B.COLS;x++){let top=B.ROWS;for(let y=0;y<B.ROWS;y++)if(b[y][x]){top=y;break;}
   for(let y=top;y<B.ROWS;y++)if(!b[y][x])holes++;const h=B.ROWS-top;height+=h;if(prev!==null)bumps+=Math.abs(h-prev);prev=h;}
  return holes*8+height+bumps*2;};
 while(s.phase!=='over'&&pieces<max){
  if(s.phase==='fx'){for(const e of B.step(s,.05,rnd))seen.add(e.type);continue;}
  let best=null;const p0={...s.piece};if(p0.kind)kinds.add(p0.kind);
  for(let rot=0;rot<4;rot++)for(let x=-2;x<B.COLS;x++){const p={...p0,rot,x};if(!B.fits(s,p))continue;
   while(B.fits(s,p,0,1))p.y++;const b=s.board.map(r=>r.slice());B.apply(b,p);B.collapse(b);
   const rest=b.filter(r=>!r.every(Boolean)),full=B.ROWS-rest.length;while(rest.length<B.ROWS)rest.unshift(Array(B.COLS).fill(null));
   const v=score(rest)-full*20;if(!best||v<best.v)best={v,rot,x};}
  // Reaches the spot with the same moves a player has.
  for(let i=0;i<4&&s.piece.rot!==best.rot;i++)B.rotate(s);
  for(let i=0;i<12&&s.piece.x!==best.x;i++)if(!B.move(s,Math.sign(best.x-s.piece.x)))break;
  for(const e of B.drop(s,rnd))seen.add(e.type);pieces++;
  // The rules hold after every piece.
  assert.equal(s.board.length,B.ROWS);for(const r of s.board){assert.equal(r.length,B.COLS);for(const c of r)assert.ok(c===null||c===B.GONE||typeof c==='string');}
  if(s.phase!=='fx')assert.ok(!s.board.some(r=>r.includes(B.GONE))&&!s.board.some(r=>r.every(Boolean)),'no blast holes or full rows are left behind');
  assert.ok(Number.isInteger(s.score)&&s.score>=0);
 }
 return {s,pieces,seen,kinds};
}

test('a robot plays long games at every speed: the rules hold, every kind turns up and levels climb',()=>{
 for(const [seed,speed] of [[11,'chill'],[12,'normal'],[13,'zippy'],[14,'chill']]){
  const {s,pieces,seen,kinds}=robot(seed,{speed});
  assert.ok(pieces>=300,'the robot keeps going: '+pieces+' pieces');
  assert.ok(s.level>=6,'level '+s.level);assert.deepEqual(plain(s.kinds),['boom','melt','zap','ice','anvil','ghost']);
  assert.deepEqual([...kinds].sort(),['anvil','boom','ghost','ice','melt','zap']);
  for(const t of ['drop','lock','lines','settle','level','unlock','spawn','boom','melt','zap','ice','anvil','ghost'])assert.ok(seen.has(t),'saw '+t);
  assert.ok(s.score>5000);}
});

test('a careless player (every piece dropped where it appears) tops out, and the game says so once',()=>{
 const rnd=seeded(21),s=B.start({},rnd);let overs=0,n=0;
 while(s.phase!=='over'&&n++<5000){for(const e of [...B.drop(s,rnd),...B.step(s,.05,rnd)])if(e.type==='over')overs++;}
 assert.equal(s.phase,'over');assert.equal(overs,1);assert.ok(s.pieces>8,'even so, it lasts a few pieces: '+s.pieces);
});
