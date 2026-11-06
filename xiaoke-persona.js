/* XiaoKe persona - presentation-only data. Never selects a game AI. */
(function (root) {
  'use strict';

  // Alternating crafted glitch glyphs and kaomoji, never natural-language speech.
  const QUOTE_POOL = Object.freeze({
    opening: Object.freeze(['⌁∿⟡∴⌁', '( ˙꒳˙ )', '░▒▓⌇▓▒░', '(๑˃̵ᴗ˂̵)و']),
    thinking: Object.freeze(['⧖⌁⧖⌁', '( •̀ᴗ•́ )و', '∴⟡…⟡∴', '(・・;)']),
    move: Object.freeze(['⊹↗⌁↘⊹', '(๑•̀ㅂ•́)و✧', '╳∿⟐∿╳', '(≧▽≦)']),
    wall: Object.freeze(['▥▦▥▦', '(｡•̀ᴗ-)✧', '⌁≋╳≋⌁', '(｀・ω・´)']),
    portal: Object.freeze(['∿⟡↯⟡∿', '(⊙_☉)', '∴⌁⧖⌁∴', '( •᷄⌓•᷅ )']),
    danger: Object.freeze(['░▒▓▒░', '(；´Д｀)', '⍰⌁⍰⌁', '(╥﹏╥)']),
    win: Object.freeze(['✦⟡✦⟡', '٩(ˊᗜˋ*)و', '⊹≋⊹≋', '(ﾉ◕ヮ◕)ﾉ']),
    lose: Object.freeze(['⌓⋯⌓⋯', '(╥_╥)', '▒░…░▒', '(；＿；)']),
    tap: Object.freeze(['⌁∿⟡‽', '(｡•̀ᴗ-)✧', '░▒▓…▓▒░', '( ˘ω˘ )', '⟐⧖⟐⌁', '(๑˃̵ᴗ˂̵)و'])
  });

  function createPersona() {
    let position = -1;
    return Object.freeze({
      name: '小克',
      nextLine(event = 'move') {
        const lines = QUOTE_POOL[event] || QUOTE_POOL.move;
        position += 1;
        return lines[position % lines.length];
      }
    });
  }
  const api = Object.freeze({ QUOTE_POOL, createPersona });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MMJJXiaokePersona = api;
})(typeof window !== 'undefined' ? window : globalThis);
