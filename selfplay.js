// Self-play benchmark for the computer opponent. Not used by the game itself.
//
//   node selfplay.js <engineA.js> <engineB.js> <ms per move> [shard nshards] [level]
//
// Plays every opening twice (once as White, once as Black) with the "insane" settings and prints
// W/L/D from A's point of view. To test an idea, copy ai.js, change it, and run the copy as engine A
// against the original as engine B. Feature switches can also be flipped without editing code:
//   FA='{"mob":0}'   switch features off for engine A (FB for engine B)   - see the F table in ai.js
//   WA='{"king":1.5}' scale evaluation weights for A (WB for B)            - see the W table in ai.js
//   OPEN=24 PLIES=200 control the number of openings and the game length cap.
// Use the two shards to run in parallel:  node selfplay.js a.js b.js 100 0 2  and  ... 1 2
const fs=require('fs');
const [fa,fb,ms,shard='0',nsh='1',lvl]=process.argv.slice(2);
const level=lvl||'insane';
const chess=fs.readFileSync(require('path').join(__dirname,'chess.js'),'utf8');
const mk=f=>fs.readFileSync(f,'utf8');
const winA={},winB={};
const env=new Function('winA','winB','window',chess+';(function(window){'+mk(fa)+'})(winA);(function(window){'+mk(fb)+'})(winB);return {Chess,WHITE,BLACK};');
const {Chess,WHITE,BLACK}=env(winA,winB,{});
for(const [w,e] of [[winA,process.env.FA],[winB,process.env.FB]]){ w.__aiLevels[level].time=+ms; if(e&&w.__aiFlags) Object.assign(w.__aiFlags,JSON.parse(e)); }
for(const [w,e] of [[winA,process.env.WA],[winB,process.env.WB]]) if(e) Object.assign(w.__aiWeights,JSON.parse(e));
const OPEN=['e2e4 e7e5 g1f3 b8c6 f1b5 a7a6','e2e4 c7c5 g1f3 d7d6 d2d4 c5d4','d2d4 d7d5 c2c4 e7e6 b1c3 g8f6','d2d4 g8f6 c2c4 g7g6 b1c3 f8g7','e2e4 e7e6 d2d4 d7d5 b1c3 g8f6','c2c4 e7e5 b1c3 g8f6 g1f3 b8c6','g1f3 d7d5 g2g3 g8f6 f1g2 e7e6','e2e4 c7c6 d2d4 d7d5 b1c3 d5e4','e2e4 e7e5 g1f3 b8c6 f1c4 f8c5','d2d4 g8f6 c2c4 e7e6 b1c3 f8b4','e2e4 d7d5 e4d5 d8d5 b1c3 d5a5','d2d4 d7d6 e2e4 g8f6 b1c3 g7g6','e2e4 e7e5 f1c4 g8f6 d2d3 c7c6','d2d4 d7d5 g1f3 g8f6 c1f4 e7e6','e2e4 c7c5 b1c3 b8c6 g2g3 g7g6','c2c4 g8f6 b1c3 e7e6 e2e4 d7d5','e2e4 g7g6 d2d4 f8g7 b1c3 d7d6','d2d4 e7e6 g1f3 g8f6 c2c4 b7b6','e2e4 b8c6 d2d4 d7d5 e4e5 c8f5','g1f3 g8f6 c2c4 e7e6 b1c3 d7d5','e2e4 e7e5 g1f3 g8f6 d2d4 f6e4','d2d4 g8f6 g1f3 g7g6 c1f4 f8g7','e2e4 c7c5 c2c3 g8f6 e4e5 f6d5','c2c4 c7c5 g1f3 g8f6 b1c3 b8c6'].slice(0,+(process.env.OPEN||24));
const f=x=>(x.charCodeAt(0)-97)+16*(x[1]-1);
const matv=g=>{const V=[0,1,3,3,5,9,0];let s=0;for(let i=0;i<128;i++){if(i&0x88){i+=7;continue}const p=g.board[i];if(p)s+=((p&24)===WHITE?1:-1)*V[p&7]}return s};
const think=(w,g)=>new Promise(r=>w.searchMove(g,level,g.turn,null,r));
(async()=>{
 let A=0,B=0,D=0,idx=0; const maxp=+(process.env.PLIES||200);
 for(const o of OPEN) for(const aWhite of [true,false]){
  if((idx++)%+nsh!==+shard) continue;
  const g=new Chess(); const seen=new Map();
  for(const mv of o.split(' ')){const m=g.legalMovesFrom(f(mv.slice(0,2))).find(x=>x.to===f(mv.slice(2,4)));g.makeMove(m);}
  let result='D', streak=0, plies=0;
  for(;plies<maxp;plies++){
   const aTurn=(g.turn===WHITE)===aWhite; const w=aTurn?winA:winB;
   const m=await think(w,g); if(!m)break;
   g.makeMove(m);
   const k=w.positionKey(g); seen.set(k,(seen.get(k)||0)+1); if(seen.get(k)>=3){result='D';break}
   if(!g.hasLegalMove()){ if(g.inCheck(g.turn)) result=aTurn?'A':'B'; else result='D'; break;}
   if(g.halfmove>=100){result='D';break}
   const d=matv(g)*(aWhite?1:-1);
   if(Math.abs(d)>=5){streak++; if(streak>=12){result=d>0?'A':'B';break}} else streak=0;
   if(plies===maxp-1){ result=d>=3?'A':d<=-3?'B':'D'; }
  }
  if(result==='A')A++;else if(result==='B')B++;else D++;
  console.log(`${o.split(' ').slice(0,3).join(' ')} ${aWhite?'A=w':'A=b'} ${result} (${plies} plies)`);
 }
 console.log(`RESULT A ${A} B ${B} D ${D}`);
})();
