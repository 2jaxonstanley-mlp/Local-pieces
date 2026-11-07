/**
 * Drag and drop for pieces: press a piece, drag it, let go on a square. Tapping still works as before.
 * It works with the same "tap a square" code each board already has, so every rule (legal moves, promotion, ...) stays in one place.
 * A board offers hooks: { tap(sq), selected(), can(sq) }.
 */
(() => {
  'use strict';
  const LP = window.LP;
  const MOVE_PX = 8;   // how far you must drag before it counts as a drag and not a tap

  function attach(board, hooks) {
    if (!board || !hooks) return;
    let d = null;            // the press in progress: { id, from, x, y, started, ghost, pe }
    let suppress = false;    // swallow the click that follows a drag

    const sqOf = (el) => { const q = el && el.closest ? el.closest('.square') : null; return q && board.contains(q) ? q : null; };
    const clean = () => {
      if (!d) return;
      if (d.ghost) d.ghost.remove();
      if (d.pe) d.pe.style.opacity = '';
      board.classList.remove('dragging');
      try { board.releasePointerCapture(d.id); } catch (e) { /* not captured */ }
      d = null;
    };
    const place = (e) => {
      const wrap = d.wrap.getBoundingClientRect();
      d.ghost.style.left = (e.clientX - wrap.left - d.size / 2) + 'px';
      d.ghost.style.top = (e.clientY - wrap.top - d.size / 2) + 'px';
    };

    board.addEventListener('pointerdown', (e) => {
      if (d || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const sqEl = sqOf(e.target);
      if (!sqEl) return;
      const s = +sqEl.dataset.sq;
      const pe = sqEl._piece || sqEl.querySelector('.piece');
      if (!pe || (hooks.can && !hooks.can(s))) return;
      d = { id: e.pointerId, from: s, x: e.clientX, y: e.clientY, started: false, ghost: null, pe, sqEl };
    });

    board.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < MOVE_PX) return;
        if (hooks.selected() !== d.from) hooks.tap(d.from);          // select it, so the legal squares show while you drag
        if (hooks.selected() !== d.from) { suppress = true; clean(); return; }   // it could not be picked up
        d.started = true;
        try { board.setPointerCapture(d.id); } catch (err) { /* ignore */ }
        d.wrap = board.parentElement;
        d.size = d.sqEl.getBoundingClientRect().width;
        const g = d.pe.cloneNode(true);
        g.classList.add('drag-ghost');
        g.style.width = g.style.height = d.size + 'px';
        d.ghost = g;
        d.wrap.appendChild(g);
        d.pe.style.opacity = '.3';
        board.classList.add('dragging');
      }
      e.preventDefault();
      place(e);
    });

    const finish = (e, drop) => {
      if (!d || e.pointerId !== d.id) return;
      const was = d;
      const started = d.started;
      if (started && d.ghost) d.ghost.style.display = 'none';
      const under = started && drop ? sqOf(document.elementFromPoint(e.clientX, e.clientY)) : null;
      clean();
      if (!started) return;
      suppress = true;
      setTimeout(() => { suppress = false; }, 60);
      if (!drop) return;
      if (under && +under.dataset.sq !== was.from) hooks.tap(+under.dataset.sq);
      else if (!under) hooks.tap(was.from);   // let go off the board: put it back (deselect)
    };
    board.addEventListener('pointerup', (e) => finish(e, true));
    board.addEventListener('pointercancel', (e) => finish(e, false));
    board.addEventListener('click', (e) => { if (suppress) { suppress = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }

  if (LP.dragHooks) attach(document.getElementById('board'), LP.dragHooks);
  if (window.Puzzle && window.Puzzle.dragHooks) attach(document.getElementById('pz-board'), window.Puzzle.dragHooks);
  LP.drag = { attach };
})();
