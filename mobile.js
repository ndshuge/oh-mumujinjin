/* Mobile HUD adapter. Observes the existing game UI; leaves the game engine unchanged. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const settingsButton = el("mobileSettingsBtn");
  const settingsPanel = el("mobileSettingsPanel");
  const statusSource = el("phaseInfo");
  const messageSource = el("message");
  const wallTools = el("wallTools");

  const synchronize = () => {
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
    document.body.classList.remove("mobile-settings-open");
    settingsButton.setAttribute("aria-expanded", "false");
  };
  settingsButton.addEventListener("click", () => {
    const opened = document.body.classList.toggle("mobile-settings-open");
    settingsButton.setAttribute("aria-expanded", String(opened));
  });
  document.addEventListener("pointerdown", event => {
    if (!document.body.classList.contains("mobile-settings-open")) return;
    if (settingsPanel.contains(event.target) || settingsButton.contains(event.target)) return;
    closeSettings();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSettings();
  });
  ["modeClassic","modeAdvanced","playLocal","ai-easy","ai-normal","ai-hard","ai-hell","ai-xiaodi","mapEditorButton"].forEach(id => {
    el(id).addEventListener("click", closeSettings);
  });

  // In the mobile viewport the top status replaces the off-screen desktop sidebar.
  synchronize();
})();