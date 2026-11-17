/* Shop upgrades (bought with tokens, no crates): Piece Size and the Board Pen.
 *  - Piece Size: a slider that makes every piece smaller or a little bigger (never bigger than a square).
 *  - Board Pen: draw on any board with a finger (game, puzzle, Analyze) to help you think. Green, red or any colour from the wheel.
 *    The drawing disappears on the next move, when you switch the pen off, or with Clear. */
(function () {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const KEY = 'localPieces.upgrades';
  const COST = { size: 6, pen: 8 };
  const read = () => { try { return Object.assign({ size: 0, pen: 0, scale: 100, color: '#2ecc71' }, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return { size: 0, pen: 0, scale: 100, color: '#2ecc71' }; } };
  let U = read();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(U)); } catch (e) { /* ignore */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);

  /* ---------------------------------------------------------------- piece size */
  function applyScale() { document.documentElement.style.setProperty('--pscale', U.size ? String(Math.max(50, Math.min(110, U.scale)) / 100) : '1'); }
  applyScale();

  /* ---------------------------------------------------------------- shop section */
  function html() {
    const tk = LP.rewards && LP.rewards.tokens ? LP.rewards.tokens() : 0;
    const buy = (k, label) => `<button class="up-buy" data-buy="${k}" ${tk >= COST[k] ? '' : 'disabled'}><span class="coin" aria-hidden="true"><i></i></span>${label} ${COST[k]}</button>`;
    return `<h3 class="sh-sub">Upgrades</h3>
      <section class="up-card">
        <div class="up-top"><b>Piece Size</b>${U.size ? '<em>Owned</em>' : buy('size', 'Unlock for')}</div>
        <p>Make your pieces smaller or a bit bigger (never bigger than a square).</p>
        ${U.size ? `<div class="up-row"><input id="up-scale" type="range" min="50" max="110" step="1" value="${U.scale}" aria-label="Piece size"><b id="up-scale-n">${U.scale}%</b><button class="btn" id="up-scale-r">Reset</button></div>` : ''}
      </section>
      <section class="up-card">
        <div class="up-top"><b>Board Pen</b>${U.pen ? '<em>Owned</em>' : buy('pen', 'Unlock for')}</div>
        <p>Draw on the board to help you think. Green, red or any colour. It disappears on the next move or when you switch the pen off.</p>
        ${U.pen ? '<p class="up-hint">Tap the pen button at the corner of a board (games, puzzles and Analyze) to draw.</p>' : ''}
      </section>`;
  }
  function wire(root) {
    (root || document).querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.buy;
        if (!LP.rewards || !LP.rewards.spend || !LP.rewards.spend(COST[k])) return;
        U[k] = 1; save(); applyScale(); ensurePens();
        if (LP.rewards.rerender) LP.rewards.rerender();
      };
    });
    const sl = $('#up-scale', root);
    if (sl) {
      sl.oninput = () => { U.scale = +sl.value; $('#up-scale-n').textContent = U.scale + '%'; applyScale(); };
      sl.onchange = save;
      $('#up-scale-r').onclick = () => { U.scale = 100; save(); applyScale(); sl.value = 100; $('#up-scale-n').textContent = '100%'; };
    }
  }

  /* ---------------------------------------------------------------- the pen */
  const WRAPS = ['#game .board-wrap', '#puzzle .board-wrap', '#review .rv-board-wrap'];
  function sigOf(wrap) { return Array.from(wrap.querySelectorAll('.square .piece')).map((p) => (p.parentElement.dataset.sq || '') + p.textContent + (p.className || '')).join('|'); }

  function setup(wrap) {
    if (wrap._pen) return;
    const pen = wrap._pen = { on: false, drawing: false, sig: '', cv: null, ctx: null };
    const fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'pen-fab'; fab.setAttribute('aria-label', 'Draw on the board'); fab.innerHTML = '&#9998;';
    wrap.appendChild(fab);
    const bar = document.createElement('div');
    bar.className = 'pen-bar hidden';
    bar.innerHTML = '<button type="button" class="pen-c" data-c="#2ecc71" style="background:#2ecc71" aria-label="Green"></button><button type="button" class="pen-c" data-c="#e5484d" style="background:#e5484d" aria-label="Red"></button><label class="pen-wheel" aria-label="Colour wheel"><input type="color" value="#3b82f6"></label><button type="button" class="pen-clear">Clear</button><button type="button" class="pen-done">Done</button>';
    wrap.appendChild(bar);
    const cv = pen.cv = document.createElement('canvas');
    cv.className = 'pen-cv'; wrap.appendChild(cv);

    const fit = () => {
      const r = wrap.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      if (!r.width) return;
      cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
      pen.ctx = cv.getContext('2d'); pen.ctx.scale(d, d); pen.ctx.lineCap = 'round'; pen.ctx.lineJoin = 'round';
    };
    const clear = () => { if (pen.ctx) pen.ctx.clearRect(0, 0, cv.width, cv.height); };
    const mark = () => { bar.querySelectorAll('.pen-c').forEach((b) => b.classList.toggle('on', b.dataset.c === U.color)); };
    const off = () => { pen.on = false; clear(); bar.classList.add('hidden'); cv.classList.remove('on'); fab.classList.remove('on'); };
    const on = () => { fit(); pen.on = true; pen.sig = sigOf(wrap); bar.classList.remove('hidden'); cv.classList.add('on'); fab.classList.add('on'); mark(); };
    fab.onclick = (e) => { e.stopPropagation(); if (pen.on) off(); else on(); };
    bar.querySelector('.pen-done').onclick = off;
    bar.querySelector('.pen-clear').onclick = clear;
    bar.querySelectorAll('.pen-c').forEach((b) => { b.onclick = () => { U.color = b.dataset.c; save(); mark(); }; });
    const wheel = bar.querySelector('input[type=color]');
    wheel.oninput = () => { U.color = wheel.value; save(); mark(); };
    // drawing
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => {
      if (!pen.on || !pen.ctx) return;
      pen.drawing = true; cv.setPointerCapture(e.pointerId);
      const [x, y] = pt(e), c = pen.ctx;
      c.strokeStyle = U.color; c.fillStyle = U.color; c.globalAlpha = 0.85; c.lineWidth = Math.max(3, cv.getBoundingClientRect().width / 55);
      c.beginPath(); c.arc(x, y, c.lineWidth / 2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(x, y);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => { if (!pen.drawing) return; const [x, y] = pt(e); pen.ctx.lineTo(x, y); pen.ctx.stroke(); e.preventDefault(); });
    const up = () => { pen.drawing = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    // the next move wipes the drawing
    new MutationObserver(() => {
      if (!pen.on) return;
      const s = sigOf(wrap);
      if (s !== pen.sig) { pen.sig = s; clear(); }
    }).observe(wrap, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    new ResizeObserver(() => { if (pen.on) fit(); }).observe(wrap);
    // leaving the page switches the pen off
    new MutationObserver(() => { if (pen.on && !wrap.offsetParent) off(); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }
  function ensurePens() {
    WRAPS.forEach((sel) => document.querySelectorAll(sel).forEach((w) => {
      if (U.pen) setup(w);
      else if (w._pen) { ['.pen-fab', '.pen-bar', '.pen-cv'].forEach((q) => { const e = w.querySelector(q); if (e) e.remove(); }); w._pen = null; }
    }));
  }
  let raf = 0;
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (U.pen) ensurePens(); }); }).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  ensurePens();

  LP.upgrades = { html, wire, owned: (k) => !!U[k] };
})();
