/* Download heavyweight frozen AI only when that AI is selected. Never substitute another model. */
(() => {
  'use strict';
  const engines = Object.freeze({
    xiaodi: {src:'./xiaodi-engine.js?v=g4-h13-20261014',global:'MumuXiaodi'},
    zhongdi:{src:'./zhongdi-engine.js?v=g5-phase-defense-20261015',global:'MumuZhongdi'}
  });
  const loading = Object.create(null);
  function ensure(level) {
    const engine = engines[level];
    if (!engine) return Promise.resolve(null);
    if (window[engine.global]) return Promise.resolve(window[engine.global]);
    if (loading[level]) return loading[level];
    const pending = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = engine.src;
      script.async = true;
      script.onload = () => {
        if (window[engine.global]) resolve(window[engine.global]);
        else reject(new Error(level + ' model loaded without its expected engine'));
      };
      script.onerror = () => reject(new Error(level + ' model download failed'));
      document.head.appendChild(script);
    });
    loading[level] = pending.finally(() => {loading[level] = null;});
    return loading[level];
  }
  window.MMJJEnsureAIEngine = ensure;
})();
