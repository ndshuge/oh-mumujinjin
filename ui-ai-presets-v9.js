/* MMJJ V9 AI personas: UI-only profiles, original AI algorithms/IDs intact. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const quotes=Object.freeze(["哦哦哦","你吃","布什","捕食","我是你爸爸","柠檬","基本","输了要艾草哦"]);
  const photos=Object.freeze({"哦哦哦":0,"你吃":1,"布什":2,"捕食":1,"我是你爸爸":3,"柠檬":2,"基本":4,"输了要艾草哦":4});
  const emotions=Object.freeze({"哦哦哦":"surprised","你吃":"calm","布什":"calm","捕食":"thinking","我是你爸爸":"smug","柠檬":"happy","基本":"smug","输了要艾草哦":"smug"});
  // Future 中迪 / 大迪 can reuse the exact same face and dialogue pool when their
  // actual engines and buttons are introduced, without creating fictional AI levels now.
  const didiKeys=["xiaodi","zhongdi","dadi"];
  const selectedDidi=()=>didiKeys.find(key=>$("ai-"+key)?.classList.contains("selected"))||null;
  const isXiaodi=()=>!!($("playAI")?.classList.contains("selected")&&selectedDidi());
  const displayName=()=>({xiaodi:"小迪",zhongdi:"中迪",dadi:"大迪"})[selectedDidi()]||"小迪";
  const isXiaobai=()=>$("playAI")?.classList.contains("selected")&&$("ai-hell")?.classList.contains("selected");
  let current=quotes[0],counter=1;
  const setLine=q=>{
    if(!quotes.includes(q))return;
    current=q;
    const e=$("aiBanterText");
    if(isXiaodi()&&e&&e.textContent!==q)e.textContent=q;
  };
  const chooseFromEvent=source=>{
    // Keep replies strictly from the eight supplied phrases; map genuine game events only.
    if(/你赢了|这一局你赢/.test(source))return "输了要艾草哦";
    if(/将军|下次再来挑战/.test(source))return "基本";
    if(/墙|近路/.test(source))return quotes[(counter++)%quotes.length];
    if(/危险|认真/.test(source))return "柠檬";
    const q=quotes[counter%quotes.length];counter++;return q;
  };
  const nextLine=()=>{const q=quotes[counter%quotes.length];counter++;setLine(q);return q};
  const profile=Object.freeze({quotes,isXiaodi,isXiaobai,displayName,currentLine:()=>current,nextLine,
    currentMood:()=>emotions[current]||"calm",currentPhoto:()=>photos[current]??0});
  window.MMJJPersona=profile;
  // Older game versions default to 'normal'. Keep engine node/handlers for compatibility,
  // but select the retained hell algorithm ('小白') when starting a fresh AI game.
  $("playAI")?.addEventListener("click",()=>{
    if($("playAI")?.classList.contains("selected")&&!$("ai-hell")?.classList.contains("selected")&&!$("ai-xiaodi")?.classList.contains("selected"))$("ai-hell")?.click();
  });
  $("ai-xiaodi")?.addEventListener("click",()=>{
    if(isXiaodi()){current="哦哦哦";counter=1;const e=$("aiBanterText");if(e)e.textContent=current}
  });
  const banter=$("aiBanterText");
  if(banter && isXiaodi() && !quotes.includes(banter.textContent?.trim()))banter.textContent=current;
  if(banter){
    const observer=new MutationObserver(()=>{
      if(!isXiaodi())return;
      const original=banter.textContent?.trim()||"";
      if(quotes.includes(original)){
        // Existing game UI may set an approved quote directly; reflect that.
        if(current!==original)current=original;
        return;
      }
      setLine(chooseFromEvent(original));
    });
    observer.observe(banter,{subtree:true,childList:true,characterData:true});
  }
  // The old difficulties must stay in DOM for the unchanged game's click listeners.
  const phaseNode=$("phaseInfo");
  if(phaseNode){
    let previous=phaseNode.textContent||"";
    new MutationObserver(()=>{
      const value=phaseNode.textContent||"";
      if(value===previous)return;
      const wasAI=/木方|电脑/.test(previous);
      const nowHuman=/金方/.test(value);
      previous=value;
      if(isXiaodi()&&wasAI&&nowHuman)nextLine();
    }).observe(phaseNode,{subtree:true,childList:true,characterData:true});
  }
  ["ai-easy","ai-normal","ai-hard"].forEach(id=>{
    const e=$(id);if(e){e.hidden=true;e.tabIndex=-1;e.setAttribute("aria-hidden","true")}
  });
})();