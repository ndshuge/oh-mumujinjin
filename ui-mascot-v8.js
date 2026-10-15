/* V8 animated Mumu. UI reads existing game DOM only. No rule or AI modifications. */
(() => {
  "use strict";
  const byId=id=>document.getElementById(id);
  const face=byId("mascotTap"),guide=document.querySelector(".mascot-v8"),
        speech=byId("mascotMessage"),role=byId("mascotRole"),
        moodLabel=byId("mascotEmotion"),popup=byId("mascotExpanded"),
        detail=byId("mascotDetail"),dismiss=byId("mascotDismiss"),banter=byId("aiBanter");
  if(!face||!speech||!popup||!role||!detail)return;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  const moodNames={
    calm:"好心情",thinking:"思考中",happy:"开心",celebrate:"太棒了",
    smug:"有点得意",surprised:"惊讶",worried:"紧张",sad:"失落",angry:"不服气"
  };
  // The game's real AI dialogue stays in its original DOM nodes,
  // but is presented inside the optional character-detail popover.
  if(banter)popup.appendChild(banter);
  let lastQuote=byId("aiBanterText")?.textContent||"";
  let reactiveMood=null,reactiveText="",reactiveUntil=0,clickCount=0,updateQueued=false;
  const cpu=()=>byId("playAI")?.classList.contains("selected")===true;
  const visible=id=>{const e=byId(id);return!!e&&!e.hidden};
  const phase=()=>byId("phaseInfo")?.textContent?.trim()||"";
  const readQuote=()=>byId("aiBanterText")?.textContent?.trim()||"";
  const readMoodFromQuote=q=>{
    if(/你赢了|被你|失算|输/.test(q))return "sad";
    if(/危险|认真|小心|抓住|漂亮/.test(q))return "worried";
    if(/将军|我赢|这道墙|近路没了/.test(q))return "smug";
    if(/传送门|捷径|空间/.test(q))return "surprised";
    if(/别急|看看|走多远/.test(q))return "happy";
    return "calm";
  };
  const react=(emotion,text,duration=2600)=>{
    reactiveMood=emotion;reactiveText=text;reactiveUntil=Date.now()+duration;
    requestUpdate();
    setTimeout(requestUpdate,duration+35);
  };
  const update=()=>{
    updateQueued=false;
    const isAI=cpu();
    const title=phase();
    const isWin=visible("winModal")||/获胜|胜利|赢得胜利|平局/.test(title);
    const wallOpen=byId("wallSlot")?.dataset.open==="true";
    const direction=byId("wallSlot")?.dataset.direction||"none";
    const aiSpeaking=isAI&&visible("aiBanter");
    let emotion="calm",message="轮到你啦，找找前进的路！",expandedText="点击棋盘移动或筑墙，试试从另一条路突破吧。";
    if(/起点|营地/.test(title)&&!/回合/.test(title)){
      emotion="happy";message="准备好啦！先选择你的营地。";
    }else if(wallOpen){
      emotion="thinking";message=direction==="none"?"先选横向或纵向，再点击棋盘筑墙。":direction==="h"?"横向墙准备好啦！选个位置吧。":"纵向墙准备好啦！选个位置吧。";
    }else if(/木方|电脑/.test(title)&&isAI){
      emotion="thinking";message="让我仔细想一想这步棋……";
    }
    if(isAI&&aiSpeaking&&readQuote()&&/金方|回合/.test(title)){
      expandedText=readQuote();
      if(Date.now()>reactiveUntil)message=readQuote();
    } else expandedText=message;
    if(isWin){
      const wonByGold=/金方/.test(byId("winTitle")?.textContent||title);
      emotion=isAI?(wonByGold?"sad":"celebrate"):"celebrate";
      message=isAI?(wonByGold?"哇，你赢了！这局下得真漂亮。":"这局我赢啦！下次再来挑战我！"):"好棋！这一局太精彩啦！";
      expandedText=message;
    }else if(reactiveMood&&Date.now()<reactiveUntil){
      emotion=reactiveMood;
      if(reactiveText)message=reactiveText;
    }
    const persona=window.MMJJPersona;
    const xiaodi=!!(isAI&&persona?.isXiaodi());
    if(xiaodi){
      message=persona.currentLine();
      expandedText=message;
      emotion=persona.currentMood();
      face.dataset.photo=String(persona.currentPhoto());
    }
    face.dataset.persona=xiaodi?"xiaodi":"mumu";
    const newRole=xiaodi?(persona.displayName()+" · AI 对手"):isAI?"木木 · 小白":"木木 · 棋局向导";
    if(role.textContent!==newRole)role.textContent=newRole;
    if(face.dataset.emotion!==emotion)face.dataset.emotion=emotion;
    if(moodLabel&&moodLabel.textContent!==moodNames[emotion])moodLabel.textContent=moodNames[emotion];
    if(speech.textContent!==message)speech.textContent=message;
    if(detail.textContent!==expandedText)detail.textContent=expandedText;
    guide.classList.toggle("mascot-ai-mode",isAI);
    guide.classList.toggle("mascot-xiaodi",xiaodi);
    guide.hidden=!isAI;
  };
  function requestUpdate(){
    if(updateQueued)return;
    updateQueued=true;requestAnimationFrame(update);
  }
  const sourceIds=["phaseInfo","wallSlot","aiBanterText","aiBanter","winModal","winTitle","playAI","playLocal","ai-xiaodi","ai-hell","mascotMessage"];
  const watch=new MutationObserver(records=>{
    for(const record of records){
      if(record.target===byId("aiBanterText")){
        const quote=readQuote();
        if(quote&&quote!==lastQuote){lastQuote=quote;react(readMoodFromQuote(quote),quote,2200)}
      }
    }
    requestUpdate();
  });
  sourceIds.forEach(id=>{
    const e=byId(id);if(!e)return;
    watch.observe(e,{attributes:true,attributeFilter:["class","hidden","data-direction","data-open"],childList:true,characterData:true,subtree:true});
  });
  let open=false;
  const show=next=>{
    open=!!next;
    popup.hidden=!open;
    face.setAttribute("aria-expanded",String(open));
    if(open)requestUpdate();
  };
  face.addEventListener("click",()=>{
    if(open){show(false);return;}
    if(window.MMJJPersona?.isXiaodi()){
      const line=window.MMJJPersona.nextLine();
      react(window.MMJJPersona.currentMood(),line,2000);
      show(true);
      return;
    }
    clickCount++;
    const messages=[
      ["happy","嘿嘿，我正在认真陪你下棋呢！"],
      ["surprised","哇，你想出了什么新路线？"],
      ["smug","这盘棋，可要认真一点哦。"],
      ["angry","哼，再厉害的棋我也会接住！"]
    ];
    const [emotion,text]=messages[(clickCount-1)%messages.length];
    react(emotion,text,1900);
    show(true);
  });
  dismiss?.addEventListener("click",e=>{e.stopPropagation();show(false);face.focus({preventScroll:true})});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&open){show(false);face.focus({preventScroll:true})}});
  document.addEventListener("pointerdown",e=>{if(open&&!guide.contains(e.target))show(false)},{passive:true});
  const settingsHelp=byId("settingsHelp");
  settingsHelp?.addEventListener("click",()=>{byId("settingsCloseBtn")?.click();byId("helpTop")?.click()});
  document.querySelectorAll(".settings-jump a").forEach(link=>{
    link.addEventListener("click",e=>{
      const target=document.querySelector(link.getAttribute("href"));
      if(!target)return;
      e.preventDefault();
      target.scrollIntoView({block:"start",behavior:reduced.matches?"instant":"smooth"});
    });
  });
  requestUpdate();
})();