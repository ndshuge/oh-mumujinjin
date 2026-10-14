"use strict";
const fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"../..");
function edit(name,fn){const p=path.join(root,name),old=fs.readFileSync(p,"utf8"),next=fn(old);if(next===old)throw Error("No change "+name);fs.writeFileSync(p,next);}
function once(s,a,b){if(!s.includes(a))throw Error("Missing anchor "+a.slice(0,80));return s.replace(a,b);}
edit("index.html",s=>{s=once(s,'<script defer src="./game.js', '<script defer src="./xiaodi-engine.js?v=g4-h13-20261014"></script>\n<script defer src="./game.js');s=once(s,'id="ai-hell" type="button">', 'id="ai-hell" type="button">');const anchor=/<button class="ai-level hell-level" id="ai-hell"[^>]*>[^<]*<\/button>/;if(!anchor.test(s))throw Error("Hell level button missing");s=s.replace(anchor,m=>m+'<button class="ai-level hell-level" id="ai-xiaodi" type="button" title="G4-h13 冻结冠军 · 本地运行">小迪</button>');return s;});
edit("game.js",s=>{s=once(s,'var tactical=level==="hell"?hellChooseAction():null;','var tactical=level==="xiaodi"?xiaodiChooseAction():level==="hell"?hellChooseAction():null;');s=once(s,'  function computerTakeTurn(){',`  function xiaodiChooseAction(){
    if(!window.MumuXiaodi){console.error("Xiaodi engine unavailable");return null;}
    var snapshot={players:state.players.map(function(p){return {x:p.x,y:p.y};}),dirs:state.slideDir.map(function(d){return d?{x:d.x,y:d.y}:null;}),walls:state.walls.map(function(w){return {x:w.x,y:w.y,o:w.o};}),left:state.left.slice()};
    var engine={terrain:{CAMPS:CAMPS,PORTALS:PORTALS,ICE:ICE,BOOST:BOOST},setRocks:function(){},movementOptions:movementOptions,computerDistance:computerDistance,hellWallAllowed:hellWallAllowed,hellApply:hellApply,hellEvaluate:hellEvaluate,portal:portal};
    return window.MumuXiaodi.choose(engine,snapshot,1,{rocks:ROCKS},260);
  }
  function computerTakeTurn(){`);s=once(s,'var wall=tactical?tactical.wall:computerWallChoice(level);','var wall=tactical?tactical.wall:computerWallChoice(level);');s=once(s,'["easy","normal","hard","hell"].forEach(function(level){','["easy","normal","hard","hell","xiaodi"].forEach(function(level){');s=once(s,'["easy","normal","hard","hell"].forEach(function(level){','["easy","normal","hard","hell","xiaodi"].forEach(function(level){');s=once(s,'["easy","normal","hard","hell"].indexOf(state.aiLevel)','["easy","normal","hard","hell","xiaodi"].indexOf(state.aiLevel)');return s;});
edit("mobile.js",s=>once(s,'"ai-hell","mapEditorButton"','"ai-hell","ai-xiaodi","mapEditorButton"'));
console.log("XIAODI_UI_INTEGRATED");
