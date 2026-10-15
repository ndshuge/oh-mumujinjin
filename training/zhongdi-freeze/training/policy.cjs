"use strict";
// Route-relative action index V2: no aliasing for boost turns.
// 4 one-step dirs * 2 teleport + 4x4 two-step routes * 2 + 192 walls = 232.
const DIR=[[0,-1],[1,0],[0,1],[-1,0]],MOVE=40,WALL=192,SIZE=232,VERSION=2;
function direction(d){const i=DIR.findIndex(t=>t[0]===d.x&&t[1]===d.y);if(i<0)throw Error("invalid direction");return i;}
function encode(a){
 if(a.wall){const w=a.wall;if(!["h","v"].includes(w.o)||!Number.isInteger(w.x)||!Number.isInteger(w.y)||w.x<0||w.x>7||w.y<0||w.y>11)throw Error("invalid wall");return MOVE+(w.o==="v"?96:0)+w.y*8+w.x;}
 const m=a.route||a.move;if(!m)throw Error("missing route");const warp=Number(!!a.warp);
 if(m.steps===1)return direction(m.d)*2+warp;
 if(m.steps===2)return 8+(direction(m.firstDir)*4+direction(m.d))*2+warp;
 throw Error("invalid steps");
}
function decode(i){
 if(!Number.isInteger(i)||i<0||i>=SIZE)throw Error("index");
 if(i<MOVE){
   const warp=!!(i%2),n=Math.floor(i/2);
   if(i<8){const d=DIR[n];return{route:{steps:1,d:{x:d[0],y:d[1]}},warp};}
   const first=DIR[Math.floor((n-4)/4)],last=DIR[(n-4)%4];
   return{route:{steps:2,firstDir:{x:first[0],y:first[1]},d:{x:last[0],y:last[1]}},warp};
 }
 const j=i-MOVE,k=j%96;return{wall:{o:j>=96?"v":"h",x:k%8,y:Math.floor(k/8)}};
}
function actions(e,s,side){const list=e.hellCandidates(s,side),ids=list.map(encode);if(new Set(ids).size!==ids.length)throw Error("policy alias");return{list,ids};}
function mask(ids){const result=new Uint8Array(SIZE);for(const id of ids)result[id]=1;return result;}
module.exports={DIR,MOVE,WALL,SIZE,S:SIZE,VERSION,index:encode,encode,decode,actions,mask};
