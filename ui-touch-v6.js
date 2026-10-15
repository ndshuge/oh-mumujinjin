/* UI-only soft tactile response. Native rules and button click handlers untouched. */
(() => {
  const selector='button:not(:disabled)';
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const timers=new WeakMap();
  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest(selector);if(!b||reduced.matches||e.button!==0)return;
    const t=timers.get(b);if(t)clearTimeout(t);
    b.classList.remove('mmjj-return');b.classList.add('mmjj-down');
  },{passive:true});
  const release=e=>{
    const b=e.target.closest('button');if(!b||!b.classList.contains('mmjj-down'))return;
    b.classList.remove('mmjj-down');
    if(reduced.matches)return;
    b.classList.remove('mmjj-return');
    void b.offsetWidth;
    b.classList.add('mmjj-return');
    timers.set(b,setTimeout(()=>b.classList.remove('mmjj-return'),820));
  };
  document.addEventListener('pointerup',release,{passive:true});
  document.addEventListener('pointercancel',release,{passive:true});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const b=e.target.closest('button');if(!b||reduced.matches||e.repeat)return;
    b.classList.add('mmjj-down');
  });
  document.addEventListener('keyup',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const b=e.target.closest('button');if(!b)return;
    b.classList.remove('mmjj-down');
    if(!reduced.matches){b.classList.remove('mmjj-return');void b.offsetWidth;b.classList.add('mmjj-return')}
  });
})();
