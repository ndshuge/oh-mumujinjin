/* Character showcase only. Intentionally does not touch any game engine or AI selection. */
(() => {
  'use strict';
  const btn = document.getElementById('xiaokePreviewBtn');
  const dialog = document.getElementById('xiaokePreviewDialog');
  const next = document.getElementById('xiaokeNextLine');
  const close = document.getElementById('xiaokeClose');
  const speech = document.getElementById('xiaokeSpeech');
  const avatar = document.getElementById('xiaokeAvatar');
  const types = document.querySelectorAll('[data-xiaoke-event]');
  if (!btn || !dialog || !speech || !window.MMJJXiaokePersona) return;

  const persona = window.MMJJXiaokePersona.createPersona();
  let currentEvent = 'opening';
  let last = '';
  function speak(event = currentEvent) {
    currentEvent = event;
    let line = persona.nextLine(currentEvent);
    if (line === last) line = persona.nextLine(currentEvent);
    last = line;
    speech.textContent = line;
    avatar?.classList.remove('xiaoke-bounce');
    if (avatar && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Restart only the short per-speech pulse; no continuous animated loops.
      void avatar.offsetWidth;
      avatar.classList.add('xiaoke-bounce');
    }
    types.forEach(node => node.setAttribute('aria-pressed', node.dataset.xiaokeEvent === event ? 'true' : 'false'));
  }
  btn.addEventListener('click', () => {
    speak('opening');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  next?.addEventListener('click', () => speak('tap'));
  types.forEach(node => node.addEventListener('click', () => speak(node.dataset.xiaokeEvent)));
  close?.addEventListener('click', () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    btn.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', e => {
    if (e.target === dialog) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  });
})();
