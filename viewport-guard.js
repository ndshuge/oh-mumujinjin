/* Touch-safe fixed game viewport: suppress browser pinch, preserve one-finger scroll. */
(() => {
  'use strict';
  const block = e => { if (e.cancelable) e.preventDefault(); };
  ['gesturestart','gesturechange','gestureend'].forEach(type => {
    document.addEventListener(type, block, {passive:false,capture:true});
  });
  document.addEventListener('touchstart', e => {
    if (e.touches && e.touches.length > 1) block(e);
  }, {passive:false,capture:true});
  document.addEventListener('touchmove', e => {
    if (e.touches && e.touches.length > 1) block(e);
  }, {passive:false,capture:true});
  document.addEventListener('wheel', e => {
    if (e.ctrlKey) block(e); // precision trackpad pinch mapped to ctrl-wheel
  }, {passive:false});
})();
