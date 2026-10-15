/* V7 wall mode presentation adapter.
 * Gameplay engine remains authoritative. No rule or game state mutations.
 * A wall direction must be explicitly chosen before forwarding board input. */
(() => {
  "use strict";
  const byId=id=>document.getElementById(id);
  const slot=byId("wallSlot"), wallMode=byId("wallMode"), wallTools=byId("wallTools"),
        moveMode=byId("moveMode"), h=byId("wallH"), v=byId("wallV"), board=byId("board");
  if(!slot||!wallMode||!wallTools||!moveMode||!h||!v||!board)return;
  let direction=null;
  let lastOpen=false;
  const isOpen=()=>!wallTools.hidden&&wallMode.classList.contains("selected")&&!wallMode.disabled;
  const paint=()=>{
    const open=isOpen();
    if(!open)direction=null;
    const next=open?(direction||"none"):"none";
    if(slot.dataset.open!==String(open))slot.dataset.open=String(open);
    if(slot.dataset.direction!==next)slot.dataset.direction=next;
    if(wallMode.getAttribute("aria-expanded")!==String(open))wallMode.setAttribute("aria-expanded",String(open));
    for(const [button,axis] of [[h,"h"],[v,"v"]]){
      const pressed=open&&direction===axis;
      if(button.getAttribute("aria-pressed")!==String(pressed))button.setAttribute("aria-pressed",String(pressed));
    }
    if(open&&!lastOpen){
      const hint=byId("mascotMessage");
      if(hint)hint.textContent="先选横向或纵向，再点击棋盘筑墙。";
    }
    lastOpen=open;
  };
  wallMode.addEventListener("click",()=>{
    direction=null;
    paint();
  });
  moveMode.addEventListener("click",()=>{direction=null;paint()});
  h.addEventListener("click",()=>{if(isOpen()){direction="h";paint()}});
  v.addEventListener("click",()=>{if(isOpen()){direction="v";paint()}});
  board.addEventListener("click",e=>{
    if(isOpen()&&!direction){e.preventDefault();e.stopImmediatePropagation();const hint=byId("mascotMessage");if(hint)hint.textContent="请选择横向或纵向墙。"}
  },true);
  board.addEventListener("pointermove",e=>{if(isOpen()&&!direction)e.stopImmediatePropagation()},true);
  document.addEventListener("keyup",e=>{
    if((e.key==="r"||e.key==="R")&&isOpen()){
      direction=h.classList.contains("selected")?"h":"v";
      paint();
    }
  });
  const watcher=new MutationObserver(paint);
  watcher.observe(wallTools,{attributes:true,attributeFilter:["hidden"]});
  watcher.observe(wallMode,{attributes:true,attributeFilter:["class","disabled"]});
  paint();
})();