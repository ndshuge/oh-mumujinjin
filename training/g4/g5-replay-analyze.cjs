"use strict";
const fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"../..");
const output=[];
for(const seat of [0,1]){
 const file=path.join(root,`training/output/lab/g5/replay-h13-odd-map8-seat${seat}.json`),r=JSON.parse(fs.readFileSync(file,"utf8"));
 const moves=r.steps.filter(x=>x.player==="g4-h13"),hawks=r.steps.filter(x=>x.player==="odd-hawks");
 const wallMoves=arr=>arr.filter(x=>!!x.action.wall).length;
 const warps=arr=>arr.filter(x=>!!x.action.warp).length;
 const elapsed=arr=>Math.round(arr.reduce((n,x)=>n+(x.elapsedMs||0),0)/Math.max(1,arr.length));
 const tail=r.steps.slice(-8).map(x=>({ply:x.ply,player:x.player,position:x.after.players[x.who],opponentPosition:x.after.players[1-x.who],wall:!!x.action.wall,warp:!!x.action.warp}));
 output.push({seat,winner:r.winner,plies:r.plies,ourMoves:moves.length,hawkMoves:hawks.length,ourWalls:wallMoves(moves),hawkWalls:wallMoves(hawks),ourWarps:warps(moves),hawkWarps:warps(hawks),ourAvgMs:elapsed(moves),hawkAvgMs:elapsed(hawks),tail});
}
const out=path.join(root,"training/output/lab/g5/replay-h13-odd-map8-analysis.json");fs.writeFileSync(out,JSON.stringify({developmentOnly:true,analysis:output},null,2));console.log(JSON.stringify(output));
