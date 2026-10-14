"use strict";
// Engine-independent bounded adversarial search for configurable 9x13 maps.
// Node and browser compatible. Never bypasses the host game's wall/path validation.
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.MumuSearch=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function choose(engine,state,side,options={}){
    const maxDepth=Math.min(5,Math.max(1,options.depth||2));
    const timeLimitMs=Math.max(20,Math.min(5000,options.timeMs||450));
    const start=Date.now();
    // Deterministic mode is opt-in and leaves the default path untouched: the
    // wall-clock cutoff is replaced by a fixed node budget, so identical inputs
    // yield identical move choices regardless of CPU speed or machine load.
    const maxNodes=Number.isFinite(options.maxNodes)&&options.maxNodes>0?Math.floor(options.maxNodes):null;
    const timeCapped=!options.deterministic&&maxNodes===null;
    const deadline=timeCapped?start+timeLimitMs:Infinity;
    const overBudget=()=>maxNodes!==null?visited>maxNodes:timeCapped&&Date.now()>=deadline;
    const camps=engine.terrain.CAMPS;
    let visited=0,cacheHit=0,timeouts=0,wallChecks=0;
    const tt=new Map(),distanceMemo=new Map(),wallMemo=new Map();
    const win=(s,player)=>camps[1-player].some(p=>p.x===s.players[player].x&&p.y===s.players[player].y);
    function imminent(s,p){
      const goal=camps[1-p],isGoal=x=>goal.some(t=>x.x===t.x&&x.y===t.y);
      const opts=engine.movementOptions(s.players[p],s.dirs[p],s.walls);
      for(const m of opts){
        if(isGoal(m.p))return true;
        const gate=engine.portal(m.p);
        if(gate&&isGoal(gate.a.x===m.p.x&&gate.a.y===m.p.y?gate.b:gate.a))return true;
      }
      return false;
    }
    const wallKey=(s)=>s.walls.map(w=>w.o+":"+w.x+":"+w.y).sort().join("|");
    const positionKey=(s,p)=>JSON.stringify([p,s.players,s.dirs,s.left,wallKey(s)]);
    function distance(s,p){
      const key=p+"#"+s.players[p].x+","+s.players[p].y+"#"+JSON.stringify(s.dirs[p])+"#"+wallKey(s);
      if(distanceMemo.has(key))return distanceMemo.get(key);
      const value=engine.computerDistance(s.players[p],camps[1-p],s.walls,s.dirs[p]);
      distanceMemo.set(key,value);
      return value;
    }
    function evaluate(s,p){
      if(win(s,p))return 100000;
      if(win(s,1-p))return -100000;
      if(!engine.movementOptions(s.players[p],s.dirs[p],s.walls).length)return -99000;
      if(imminent(s,p))return 700;
      const ours=distance(s,p),theirs=distance(s,1-p);
      if(!Number.isFinite(ours))return -80000;
      if(!Number.isFinite(theirs))return 80000;
      return 7*(theirs-ours)+0.55*(s.left[p]-s.left[1-p]);
    }
    function wallEffect(s,who,w,beforeOwn,beforeOpponent){
      const id=positionKey(s,who)+"#"+w.o+w.x+","+w.y;
      if(wallMemo.has(id))return wallMemo.get(id);
      // Cheap: check whether the candidate wall lengthens opponent travel;
      // do not waste path legality checks on walls that have no strategic effect.
      const trial={...s,walls:s.walls.concat([w])};
      const afterTheir=distance(trial,1-who);
      const afterOwn=distance(trial,who);
      const impact=afterTheir-beforeOpponent,ownLoss=afterOwn-beforeOwn;
      let merit= -Infinity;
      if(impact>0&&Number.isFinite(afterOwn)&&impact>=ownLoss-0.1){
        wallChecks++;
        if(engine.hellWallAllowed(s,w,who))merit=Number.isFinite(afterTheir)?5*impact-3*ownLoss-2.5:10000;
      }
      wallMemo.set(id,merit);
      return merit;
    }
    function candidates(s,who,withFarWalls,wide){
      const orig=engine.movementOptions(s.players[who],s.dirs[who],s.walls);
      const result=[];
      for(const move of orig){
        result.push({p:move.p,lock:move.nextLock,move,warp:false});
        const gate=engine.portal(move.p);
        if(gate){
          const target=(gate.a.x===move.p.x&&gate.a.y===move.p.y)?gate.b:gate.a;
          result.push({p:target,lock:null,move,warp:true});
        }
      }
      const own=distance(s,who),op=distance(s,1-who),emergency=imminent(s,1-who);
      if(s.left[who]>0){
        const wallChoices=[],seen=new Set();
        function testWall(x,y,o){
          if(x<0||y<0||x>7||y>11)return;
          const w={x,y,o},key=o+x+","+y;
          if(seen.has(key))return;
          seen.add(key);
          const gain=wallEffect(s,who,w,own,op);
          if(Number.isFinite(gain))wallChoices.push({wall:w,score:gain});
        }
        if(withFarWalls){
          // Search entire board, not only near the opponent: bridges,
          // portal corridors, choke points may be far from either pawn.
          for(let y=0;y<12;y++)for(let x=0;x<8;x++){
            testWall(x,y,"h");testWall(x,y,"v");
          }
        }else{
          // At internal search nodes cover both pieces and their next 3 squares.
          for(const p of s.players){
            for(let dy=-3;dy<=2;dy++)for(let dx=-3;dx<=2;dx++){
              testWall(p.x+dx,p.y+dy,"h");
              testWall(p.x+dx,p.y+dy,"v");
            }
          }
        }
        if(emergency){
          for(const w of wallChoices){
            const s2=engine.hellApply(s,who,{wall:w.wall});
            w.saves=!imminent(s2,1-who);
          }
          wallChoices.sort((a,b)=>Number(b.saves)-Number(a.saves)||b.score-a.score);
        }else wallChoices.sort((a,b)=>b.score-a.score);
        result.push(...wallChoices.slice(0,wide?(emergency?10:6):(emergency?6:3)).map(a=>({wall:a.wall})));
      }
      const ranked=result.map(a=>{
        const next=engine.hellApply(s,who,a);
        const old=own,newDist=distance(next,who);
        const impact=distance(next,1-who)-op;
        const tactic=win(next,who)?50000:
          emergency?(imminent(next,1-who)?-30000:20000):
          0;
        // Prioritize progress, favor effective tactical blocks, penalize
        // pointless waiting with a finite supply of walls.
        const score=tactic+(!a.wall?8*(old-newDist)+1.6*impact+0.5:4.8*impact-3*(newDist-old)-2.5)
          +0.15*evaluate(next,who);
        return{action:a,next,score};
      });
      ranked.sort((a,b)=>b.score-a.score);
      return ranked.slice(0,wide?10:6);
    }
    let best=null,bestScore=-Infinity,depthCompleted=0;
    // Fallback must be a verified legal movement if deadline already expired.
    const safeActions=engine.hellCandidates(state,side);
    const fallback=safeActions.find(a=>!a.wall)||safeActions[0]||null;
    best=fallback;
    function negamax(s,player,depth,alpha,beta,history){
      visited++;
      if((maxNodes!==null||visited%16===0)&&overBudget())throw Error("SEARCH_TIMEOUT");
      if(win(s,player))return 100000+depth;
      if(win(s,1-player))return -100000-depth;
      if(!engine.movementOptions(s.players[player],s.dirs[player],s.walls).length)return -99000;
      if(depth===0)return evaluate(s,player);
      const key=positionKey(s,player);
      if(history.has(key))return 0;
      const entry=tt.get(key);
      if(entry&&entry.depth>=depth){cacheHit++;return entry.value;}
      const moves=candidates(s,player,false,false);
      if(!moves.length)return -99999;
      history.add(key);let max=-Infinity;
      for(const item of moves){
        const v=-negamax(item.next,1-player,depth-1,-beta,-alpha,history);
        if(v>max)max=v;
        if(v>alpha)alpha=v;
        if(alpha>=beta)break;
      }
      history.delete(key);
      // This is not a full alpha-beta bound; only cache exact non-cutoff results.
      if(alpha<beta)tt.set(key,{depth,value:max});
      return max;
    }
    if(!engine.movementOptions(state.players[side],state.dirs[side],state.walls).length)
      return {action:null,score:-99000,depth:0,visited,cacheHits:cacheHit,wallChecks,timeMs:Date.now()-start,emergency:false};
    let roots=candidates(state,side,true,true);
    for(const item of roots)if(win(item.next,side)){
      return{action:item.action,score:100000,depth:1,visited,cacheHits:cacheHit,wallChecks,timeMs:Date.now()-start,emergency:false};
    }
    // Preserve the best immediate, legal candidate under extremely short deadlines.
    if(roots.length)best=roots[0].action;
    for(let depth=1;depth<=maxDepth;depth++){
      let currentBest=null,currentScore=-Infinity;
      try{
        let alpha=-Infinity;
        for(const item of roots){
          if(overBudget())throw Error("SEARCH_TIMEOUT");
          const val=-negamax(item.next,1-side,depth-1,-Infinity,-alpha,new Set([positionKey(state,side)]));
          if(val>currentScore){currentScore=val;currentBest=item.action;}
          if(val>alpha)alpha=val;
        }
        if(currentBest){best=currentBest;bestScore=currentScore;depthCompleted=depth;}
      }catch(err){
        if(err.message!=="SEARCH_TIMEOUT")throw err;
        timeouts++;break;
      }
    }
    return{action:best,score:bestScore,depth:depthCompleted,visited,cacheHits:cacheHit,wallChecks,timeMs:Date.now()-start,emergency:timeouts>0};
  }
  return{choose};
});
