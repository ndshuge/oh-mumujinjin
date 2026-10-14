/* Mobile HUD adapter. Observes the existing game UI; leaves the game engine unchanged. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const settingsButton = el("mobileSettingsBtn");
  const settingsPanel = el("mobileSettingsPanel");
  const settingsClose = el("settingsCloseBtn");
  const settingsInline = el("openSettingsInline");
  const statusSource = el("phaseInfo");
  const messageSource = el("message");
  const wallTools = el("wallTools");
  let previousPhase = statusSource.textContent.trim();

  const synchronize = () => {
    const nextPhase = statusSource.textContent.trim();
    if (nextPhase !== previousPhase) {
      previousPhase = nextPhase;
      [statusSource, el("mobilePhase")].filter(Boolean).forEach(node => {
        node.classList.remove("ui-phase-flash");
        void node.offsetWidth;
        node.classList.add("ui-phase-flash");
      });
    }
    if (el("mobilePhase")) el("mobilePhase").textContent = statusSource.textContent;
    if (el("mobileMessage")) el("mobileMessage").textContent = messageSource.textContent;
    const round = el("roundBadge").textContent.trim();
    el("mobileRound").textContent = round.replace("ROUND", "回合");
    const count = id => (el(id).textContent.match(/✦/g) || []).length;
    el("mobileWalls").textContent = "金 " + count("walls0") + " · 木 " + count("walls1");
    document.body.classList.toggle("mobile-wall-open", !wallTools.hidden);
  };

  const observeText = id => {
    const node = el(id);
    new MutationObserver(synchronize).observe(node, {childList:true, characterData:true, subtree:true});
  };
  ["phaseInfo", "message", "roundBadge", "walls0", "walls1"].forEach(observeText);
  new MutationObserver(synchronize).observe(wallTools, {attributes:true, attributeFilter:["hidden"]});

  const closeSettings = () => {
    const wasOpen = document.body.classList.contains("mobile-settings-open");
    document.body.classList.remove("mobile-settings-open");
    settingsButton.setAttribute("aria-expanded", "false");
    if (wasOpen) settingsButton.focus({preventScroll:true});
  };
  if (settingsClose) settingsClose.addEventListener("click", closeSettings);
  if (settingsInline) settingsInline.addEventListener("click", () => settingsButton.click());
  settingsButton.addEventListener("click", () => {
    const opened = document.body.classList.toggle("mobile-settings-open");
    settingsButton.setAttribute("aria-expanded", String(opened));
    if (opened) settingsClose?.focus({preventScroll:true});
  });
  document.addEventListener("pointerdown", event => {
    if (!document.body.classList.contains("mobile-settings-open")) return;
    if (settingsPanel.contains(event.target) || settingsButton.contains(event.target)) return;
    closeSettings();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSettings();
  });
  ["modeClassic","modeAdvanced","playLocal","playAI","ai-easy","ai-normal","ai-hard","ai-hell","ai-xiaodi","mapEditorButton"].forEach(id => {
    el(id).addEventListener("click", closeSettings);
  });

  // Presentation-only pointer light: does not alter canvas coordinates or game state.
  const board = el("board");
  const boardWrap = board.closest(".board-wrap");
  board.addEventListener("pointerdown", event => {
    if (!event.isPrimary || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = boardWrap.getBoundingClientRect();
    const spark = document.createElement("span");
    spark.className = "board-tap";
    spark.style.left = (event.clientX - rect.left) + "px";
    spark.style.top = (event.clientY - rect.top) + "px";
    spark.setAttribute("aria-hidden", "true");
    boardWrap.appendChild(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  });

  // In the mobile viewport the top status replaces the off-screen desktop sidebar.
  synchronize();
})();