/* A slim vertical evaluation bar along the left edge of a board (Analyze and Sandbox only).
 * LP.evalBar.attach(wrapEl) -> { set(whiteWinChance 0..1, flipped), hide(), remove() } */
(function () {
  'use strict';
  const LP = (window.LP = window.LP || {});
  /** Win chance -> a rough pawn score for the label (the chance is 1 / (1 + 10^(-cp/400))). */
  function label(w, final) {
    if (final && w >= 0.999) return '1-0';
    if (final && w <= 0.001) return '0-1';
    w = Math.max(0.0001, Math.min(0.9999, w));
    const p = Math.max(-99, Math.min(99, 400 * Math.log10(w / (1 - w)) / 100));
    return (p > 0 ? '+' : '') + (Math.abs(p) >= 10 ? Math.round(p) : p.toFixed(1));
  }
  function attach(wrap) {
    if (!wrap) return null;
    let el = wrap.querySelector(':scope > .evbar');
    if (!el) {
      el = document.createElement('div');
      el.className = 'evbar';
      el.setAttribute('role', 'img');
      el.innerHTML = '<i class="ev-fill"></i><b class="ev-lab"></b>';
      wrap.appendChild(el);
    }
    const fill = el.querySelector('.ev-fill'), lab = el.querySelector('.ev-lab');
    return {
      set(w, flipped, mate, final) {
        w = Math.max(0, Math.min(1, Number.isFinite(w) ? w : 0.5));
        el.classList.remove('hidden');
        el.classList.toggle('flip', !!flipped);
        fill.style.height = (w * 100).toFixed(1) + '%';
        if (mate) { w = mate > 0 ? 1 : 0; fill.style.height = (w * 100) + '%'; }
        lab.textContent = mate ? 'M' + Math.abs(mate) : label(w, final);
        el.setAttribute('aria-label', 'Evaluation ' + lab.textContent);
        el.classList.toggle('is-mate', !!mate);
        lab.className = 'ev-lab ' + (w >= 0.5 ? 'on-white' : 'on-black') + (mate ? ' mate' : '');
      },
      hide() { el.classList.add('hidden'); },
      remove() { el.remove(); },
    };
  }
  LP.evalBar = { attach, label };
})();
