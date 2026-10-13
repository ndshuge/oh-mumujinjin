"use strict";
const W=9,H=13,M=234,S=M+192;
function encode(a){if(a.wall){const q=a.wall;if(!["h","v"].includes(q.o)||q.x<0||q.x>7||q.y<0||q.y>11)throw Error("wall");return M+(q.o==="v"?96:0)+q.y*8+q.x;}const p=a.p;if(!p||p.x<0||p.x>=W||p.y<0||p.y>=H)throw Error("move");return(p.y*W+p.x)*2+Number(!!a.warp);}
function decode(i){if(!Number.isInteger(i)||i<0||i>=S)throw Error("index");if(i<M)return{p:{x:Math.floor(i/2)%W,y:Math.floor(i/2/W)},warp:!!(i%2)};const j=i-M,k=j%96;return{wall:{o:j>=96?"v":"h",x:k%8,y:Math.floor(k/8)}};}
function actions(e,s,side){const list=e.hellCandidates(s,side),ids=list.map(encode);if(new Set(ids).size!==ids.length)throw Error("collision");return{list,ids};}
module.exports={W,H,M,S,encode,decode,actions};
