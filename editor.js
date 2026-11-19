/**
 * Position editor: set up any chess position, check it is legal, then play it against the computer or a friend,
 * save it on this device, or copy / paste it as FEN code. Custom positions do not change your Elo, leaderboard or rewards.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const KEY = 'localPieces.positions';
  const MAXP = 200;
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const GLYPH = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
  const ORDER = ['k', 'q', 'r', 'b', 'n', 'p'];
  let cells = new Array(64).fill('');     // index = rank * 8 + file, 'P' = white pawn, 'p' = black pawn ...
  let turn = 'w', castle = { K: true, Q: true, k: true, q: true };
  let brush = 'P';                         // piece letter to place, or 'x' for the eraser
  let flipped = false;
  let ep = '', hm = 0, fm = 1;             // en passant square ('e3' or ''), half-move clock, move number
  let curId = null, curName = '';           // the saved position now on the board (so Save can update it in place)
  let hist = [], hi = -1, restoring = false;   // undo / redo: snapshots of the whole setup
  let dragFrom = -1, lpT = 0, lpFired = false, lpPos = null;
  const MR = window.MoveRating;
  let built = false;
  // creating a community puzzle: the same editor with a title, a category, Test and Publish
  const DRAFT = 'localPieces.communityDraft';
  let creating = false, moveSel = -1, title = '', cat = 'mate1', vhash = '';
  const cats = () => (LP.community && LP.community.cats) || [{ id: 'other', label: 'Win', n: 0 }];
  const catOf = (id) => cats().find((c) => c.id === id) || cats()[0];
  /** Identifies exactly what was solved: the position (with side to move) and the category. Any change makes it a different puzzle. */
  const hashOf = () => { const t = toFen() + '|' + cat; let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36) + t.length; };
  const verified = () => !!vhash && vhash === hashOf();
  const saveDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify({ fen: toFen(), title, cat, v: vhash })); } catch (e) { /* ignore */ } };
  const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT)) || null; } catch (e) { return null; } };

  const readSaved = () => { try { const l = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  const writeSaved = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, MAXP))); return true; } catch (e) { return false; } };

  function toFen() {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', e = 0;
      for (let f = 0; f < 8; f++) {
        const c = cells[r * 8 + f];
        if (!c) { e++; continue; }
        if (e) { row += e; e = 0; }
        row += c;
      }
      if (e) row += e;
      rows.push(row);
    }
    const cs = (castle.K ? 'K' : '') + (castle.Q ? 'Q' : '') + (castle.k ? 'k' : '') + (castle.q ? 'q' : '');
    return rows.join('/') + ' ' + turn + ' ' + (cs || '-') + ' ' + (ep || '-') + ' ' + hm + ' ' + fm;
  }
  function fromFen(fen) {
    const probe = new window.Chess();
    const err = probe.loadFen(fen);
    if (err) return err;
    const parts = fen.trim().split(/\s+/);
    const next = new Array(64).fill('');
    parts[0].split('/').forEach((row, i) => {
      let f = 0;
      for (const c of row) { if (/[1-8]/.test(c)) f += +c; else { next[(7 - i) * 8 + f] = c; f++; } }
    });
    cells = next;
    turn = parts[1] === 'b' ? 'b' : 'w';
    const cs = parts[2] || '-';
    castle = { K: cs.includes('K'), Q: cs.includes('Q'), k: cs.includes('k'), q: cs.includes('q') };
    ep = /^[a-h][36]$/.test(parts[3] || '') ? parts[3] : '';
    hm = Math.max(0, Math.min(99, parseInt(parts[4], 10) || 0));
    fm = Math.max(1, Math.min(999, parseInt(parts[5], 10) || 1));
    return '';
  }
  function problems() {
    const probe = new window.Chess();
    const err = probe.loadFen(toFen());
    if (err) return [err];
    return probe.problems();
  }


  /* ------------------------------------------------------------------ undo / redo, castling and en passant rules, highlights */
  const snap = () => ({ c: cells.slice(), t: turn, k: Object.assign({}, castle), e: ep, h: hm, f: fm });
  const snapKey = (s) => s.c.join(',') + '|' + s.t + s.k.K + s.k.Q + s.k.k + s.k.q + '|' + s.e + '|' + s.h + '|' + s.f;
  function track() {
    if (restoring) return;
    const s = snap();
    if (hi >= 0 && snapKey(hist[hi]) === snapKey(s)) return;
    hist = hist.slice(0, hi + 1); hist.push(s);
    if (hist.length > 150) hist.shift();
    hi = hist.length - 1;
    undoState();
  }
  function undoState() {
    const u = $('#ed-undo'), r = $('#ed-redo');
    if (u) u.disabled = hi <= 0;
    if (r) r.disabled = hi >= hist.length - 1;
  }
  function goHist(d) {
    const n = hi + d;
    if (n < 0 || n >= hist.length) return;
    hi = n;
    const s = hist[hi];
    restoring = true;
    cells = s.c.slice(); turn = s.t; castle = Object.assign({}, s.k); ep = s.e; hm = s.h; fm = s.f; moveSel = -1; dragFrom = -1;
    redraw();
    restoring = false;
    undoState();
  }
  const homeOk = () => ({ K: cells[4] === 'K' && cells[7] === 'R', Q: cells[4] === 'K' && cells[0] === 'R', k: cells[60] === 'k' && cells[63] === 'r', q: cells[60] === 'k' && cells[56] === 'r' });
  /** The squares where an en passant capture is possible right now (the square the pawn skipped over). */
  function epOptions() {
    const out = [];
    for (let f = 0; f < 8; f++) {
      const n = 'abcdefgh'[f];
      if (turn === 'w' && cells[4 * 8 + f] === 'p' && !cells[5 * 8 + f] && !cells[6 * 8 + f] && (cells[4 * 8 + f - 1] === 'P' && f > 0 || cells[4 * 8 + f + 1] === 'P' && f < 7)) out.push(n + '6');
      if (turn === 'b' && cells[3 * 8 + f] === 'P' && !cells[2 * 8 + f] && !cells[1 * 8 + f] && (cells[3 * 8 + f - 1] === 'p' && f > 0 || cells[3 * 8 + f + 1] === 'p' && f < 7)) out.push(n + '3');
    }
    return out;
  }
  /** Squares to mark in red: pawns on the first or last rank, extra kings, kings touching, and the king of the side NOT to move when it is attacked. */
  function badSquares() {
    const s = new Set();
    cells.forEach((c, i) => { if ((c === 'P' || c === 'p') && (i < 8 || i >= 56)) s.add(i); });
    ['K', 'k'].forEach((k) => { const at = []; cells.forEach((c, i) => { if (c === k) at.push(i); }); if (at.length > 1) at.forEach((i) => s.add(i)); });
    const wk = cells.indexOf('K'), bk = cells.indexOf('k');
    if (wk >= 0 && bk >= 0 && Math.abs((wk % 8) - (bk % 8)) <= 1 && Math.abs(Math.floor(wk / 8) - Math.floor(bk / 8)) <= 1) { s.add(wk); s.add(bk); }
    try {
      const g = new window.Chess();
      if (!g.loadFen(toFen())) {
        const opp = turn === 'w' ? BLACK : WHITE;
        if (g.inCheck(opp)) { const ks = g.kingSquare(opp); if (ks >= 0) s.add((ks >> 4) * 8 + (ks & 7)); }
      }
    } catch (x) { /* ignore */ }
    return s;
  }
  function countsHtml() {
    const line = (up, name) => {
      const ls = ORDER.map((t) => [t, cells.filter((c) => c === (up ? t.toUpperCase() : t)).length]);
      const total = ls.reduce((a, x) => a + x[1], 0), pawns = ls.find((x) => x[0] === 'p')[1], kings = ls.find((x) => x[0] === 'k')[1];
      const bad = total > 16 || pawns > 8 || kings !== 1;
      return `<span class="ed-cn${bad ? ' bad' : ''}"><b>${name} ${total}</b> ${ls.filter((x) => x[1]).map((x) => `<span class="ed-g">${GLYPH[x[0]]}</span>${x[1]}`).join(' ')}</span>`;
    };
    return line(true, 'White') + line(false, 'Black');
  }

  /* ------------------------------------------------------------------ drawing */
  function drawBoard() {
    const b = $('#ed-board');
    b.innerHTML = '';
    const bad = badSquares();
    for (let i = 0; i < 64; i++) {
      const r = flipped ? Math.floor(i / 8) : 7 - Math.floor(i / 8), f = flipped ? 7 - (i % 8) : i % 8;
      const el = document.createElement('div');
      el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark') + (moveSel === r * 8 + f ? ' ed-sel' : '') + (bad.has(r * 8 + f) ? ' ed-bad' : '');
      el.dataset.sq = r * 8 + f;
      const last = flipped ? 7 : 0;
      if (r === last) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = 'abcdefgh'[f]; el.appendChild(c); }
      if (f === (flipped ? 7 : 0)) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = r + 1; el.appendChild(c); }
      const p = cells[r * 8 + f];
      if (p) { const s = document.createElement('span'); s.className = 'piece ' + (p === p.toUpperCase() ? 'w' : 'b'); s.textContent = GLYPH[p.toLowerCase()]; el.appendChild(s); }
      el.onclick = () => put(r * 8 + f);
      b.appendChild(el);
    }
  }
  function drawPalette() {
    const pal = $('#ed-pal');
    const btn = (letter, glyph, cls) => `<button class="ed-pc${brush === letter ? ' on' : ''}" data-l="${letter}" aria-label="${letter === 'x' ? 'Eraser' : (cls === 'w' ? 'White ' : 'Black ') + glyph}"><span class="piece ${cls}">${letter === 'x' ? '✕' : GLYPH[letter.toLowerCase()]}</span></button>`;
    pal.innerHTML = '<div class="ed-prow">' + ORDER.map((t) => btn(t.toUpperCase(), t, 'w')).join('') + '</div><div class="ed-prow">' + ORDER.map((t) => btn(t, t, 'b')).join('') + '</div><div class="ed-prow"><button class="ed-pc ed-erase' + (brush === 'm' ? ' on' : '') + '" data-l="m" aria-label="Move pieces">&#10021; Move</button><button class="ed-pc ed-erase' + (brush === 'x' ? ' on' : '') + '" data-l="x">Eraser</button></div>';
    pal.querySelectorAll('.ed-pc').forEach((b) => {
      b.onclick = () => { if (b._sup) { b._sup = false; return; } brush = b.dataset.l; moveSel = -1; drawPalette(); drawBoard(); };
      if (/^[KQRBNPkqrbnp]$/.test(b.dataset.l)) b.addEventListener('pointerdown', (e) => palDrag(e, b));
    });
    const bd = $('#ed-board'); if (bd) bd.classList.toggle('ed-move', brush === 'm');
  }
  function drawInfo() {
    // castling is only possible with the king and rook on their home squares; an en passant square only where a capture exists
    const ok = homeOk();
    ['K', 'Q', 'k', 'q'].forEach((c) => { if (!ok[c]) castle[c] = false; });
    const opts = epOptions();
    if (ep && !opts.includes(ep)) ep = '';
    const pr = problems();
    const box = $('#ed-msg');
    box.className = 'ed-msg ' + (pr.length ? 'bad' : 'ok');
    box.innerHTML = pr.length ? pr.map((x) => '<div>' + esc(x) + '</div>').join('') : 'Looks good. This position can be played.';
    $('#ed-play0').disabled = $('#ed-play1').disabled = $('#ed-play2').disabled = $('#ed-an').disabled = pr.length > 0;
    $('#ed-white').classList.toggle('on', turn === 'w');
    $('#ed-black').classList.toggle('on', turn === 'b');
    ['K', 'Q', 'k', 'q'].forEach((c) => { const x = $('#ed-c' + c); x.checked = castle[c]; x.disabled = !ok[c]; x.parentElement.classList.toggle('dim', !ok[c]); });
    const sel = $('#ed-ep');
    sel.innerHTML = '<option value="">None</option>' + opts.map((o) => `<option value="${o}">${o}</option>`).join('');
    sel.value = ep; sel.disabled = !opts.length;
    if (document.activeElement !== $('#ed-hm')) $('#ed-hm').value = hm;
    if (document.activeElement !== $('#ed-fm')) $('#ed-fm').value = fm;
    $('#ed-cnt').innerHTML = countsHtml();
    $('#ed-fen').value = toFen();
    if (creating) drawCreate(pr);
    track();
    updateEval(pr.length > 0);
  }
  function drawCreate(pr) {
    const ok = verified(), box = $('#ed-ver');
    box.className = 'ed-ver ' + (ok ? 'ok' : 'no');
    box.innerHTML = ok ? '<b>Verified &#10003;</b> You solved it against the Insane computer.' : '<b>Not verified</b> Press Test and solve it (as the side to move) to unlock Publish. Any change to the position or category needs a new test.';
    $('#ed-test').disabled = pr.length > 0;
    $('#ed-pub').disabled = !ok || pr.length > 0 || !title.trim();
    saveDraft();
  }
  const redraw = () => { drawBoard(); drawInfo(); };

  /** Move tool: tap a piece, then tap where it should go (or drag it). Tapping another piece picks that one instead. */
  function moveTap(i) {
    if (moveSel < 0) { if (cells[i]) moveSel = i; }
    else if (moveSel === i) moveSel = -1;
    else if (cells[i]) moveSel = i;
    else { cells[i] = cells[moveSel]; cells[moveSel] = ''; moveSel = -1; }
    redraw();
  }
  function put(i) {
    if (brush === 'm') { moveTap(i); return; }
    const r = Math.floor(i / 8), f = i % 8;
    if (brush === 'x') cells[r * 8 + f] = '';
    else cells[r * 8 + f] = cells[r * 8 + f] === brush ? '' : brush;
    redraw();
  }


  /* ------------------------------------------------------------------ drag from the palette, press-and-hold, live eval */
  function palDrag(e0, btn) {
    if (e0.pointerType === 'mouse' && e0.button !== 0) return;
    const letter = btn.dataset.l, x0 = e0.clientX, y0 = e0.clientY;
    let ghost = null;
    const mv = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 8) return;
        const src = btn.querySelector('.piece');
        ghost = document.createElement('span');
        ghost.className = 'piece ' + (src ? src.className.replace('piece ', '') : '') + ' ed-ghost';
        ghost.textContent = src ? src.textContent : '';
        document.body.appendChild(ghost);
      }
      e.preventDefault();
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    };
    const up = (e) => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      btn._sup = true; setTimeout(() => { btn._sup = false; }, 80);
      const sq = e.type === 'pointerup' ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const q = sq && sq.closest ? sq.closest('#ed-board .square') : null;
      if (q) { cells[+q.dataset.sq] = letter; redraw(); }
    };
    document.addEventListener('pointermove', mv, { passive: false }); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  /** Drag hooks for pieces already on the board: drop on a square to move it, drop off the board to delete it. */
  const dTap = (i) => {
    if (brush === 'm') { put(i); return; }
    if (dragFrom < 0) { if (cells[i]) dragFrom = i; return; }
    if (i !== dragFrom) { cells[i] = cells[dragFrom]; cells[dragFrom] = ''; }
    dragFrom = -1; redraw();
  };
  const dOff = (i) => {
    if (brush === 'm') { put(i); return; }
    if (dragFrom >= 0) { cells[dragFrom] = ''; dragFrom = -1; redraw(); toast('Piece removed'); }
  };
  /** Press and hold a square: clear it, or fill / clear its whole rank or file. */
  function sqSheet(i) {
    const f = i % 8, r = Math.floor(i / 8), nm = 'abcdefgh'[f] + (r + 1);
    const piece = /^[KQRBNPkqrbnp]$/.test(brush);
    const fillLabel = piece ? `<span class="piece ${brush === brush.toUpperCase() ? 'w' : 'b'}">${GLYPH[brush.toLowerCase()]}</span>` : '';
    LP.openSheet(`<h2>Square ${nm}</h2><div class="stack">
      <button class="btn" id="sq-clr">Clear this square</button>
      ${piece ? `<button class="btn" id="sq-fr">Fill rank ${r + 1} with ${fillLabel}</button><button class="btn" id="sq-ff">Fill file ${'abcdefgh'[f]} with ${fillLabel}</button>` : ''}
      <button class="btn" id="sq-cr">Clear rank ${r + 1}</button><button class="btn" id="sq-cf">Clear file ${'abcdefgh'[f]}</button>
      <button class="btn" id="sq-x">Cancel</button></div>`, true);
    const go = (fn) => () => { fn(); LP.closeSheet(); redraw(); };
    $('#sq-clr').onclick = go(() => { cells[i] = ''; });
    if (piece) {
      $('#sq-fr').onclick = go(() => { for (let k = 0; k < 8; k++) cells[r * 8 + k] = brush; });
      $('#sq-ff').onclick = go(() => { for (let k = 0; k < 8; k++) cells[k * 8 + f] = brush; });
    }
    $('#sq-cr').onclick = go(() => { for (let k = 0; k < 8; k++) cells[r * 8 + k] = ''; });
    $('#sq-cf').onclick = go(() => { for (let k = 0; k < 8; k++) cells[k * 8 + f] = ''; });
    $('#sq-x').onclick = LP.closeSheet;
  }

  /** Mirror left-right, or swap the colours (the position seen from the other side). */
  function mirror() {
    const n = new Array(64).fill('');
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) n[r * 8 + (7 - f)] = cells[r * 8 + f];
    cells = n; ep = ep ? 'abcdefgh'[7 - 'abcdefgh'.indexOf(ep[0])] + ep[1] : '';
    castle = { K: false, Q: false, k: false, q: false }; curId = null; redraw();
  }
  function swapColours() {
    const n = new Array(64).fill('');
    const sw = (c) => (!c ? '' : c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) n[r * 8 + f] = sw(cells[(7 - r) * 8 + f]);
    cells = n; turn = turn === 'w' ? 'b' : 'w';
    castle = { K: castle.k, Q: castle.q, k: castle.K, q: castle.Q };
    ep = ep ? ep[0] + (ep[1] === '3' ? '6' : '3') : ''; curId = null; redraw();
  }
  const PRESETS = [
    ['Start position', START],
    ['Just two kings', '4k3/8/8/8/8/8/8/4K3 w - - 0 1'],
    ['King and queen vs king', '4k3/8/8/8/8/8/8/3QK3 w - - 0 1'],
    ['King and rook vs king', '4k3/8/8/8/8/8/8/R3K3 w - - 0 1'],
    ['Two rooks vs king', '4k3/8/8/8/8/8/8/R2K3R w - - 0 1'],
    ['Two bishops vs king', '4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1'],
    ['Bishop and knight vs king', '4k3/8/8/8/8/8/8/2B1K1N1 w - - 0 1'],
    ['King and pawn: opposition', '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1'],
    ['Lucena position', '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1'],
    ['Philidor position', '4k3/8/r7/3PK3/8/8/R7/8 b - - 0 1'],
    ['Back-rank mate in 1', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'],
  ];
  function presetSheet() {
    LP.openSheet('<h2>Quick starts<span class="sub">Pick a position to start from.</span></h2><div class="ed-saved">' + PRESETS.map((p, k) => `<div class="ed-sv"><button class="ed-sv-go" data-k="${k}"><b>${esc(p[0])}</b></button></div>`).join('') + '</div><button class="btn wide" id="ed-lx">Close</button>', true);
    $('#ed-lx').onclick = LP.closeSheet;
    document.querySelectorAll('.ed-sv-go').forEach((b) => { b.onclick = () => { if (!fromFen(PRESETS[+b.dataset.k][1])) { curId = null; LP.closeSheet(); redraw(); } }; });
  }

  /* ---- live evaluation bar beside the board, and the full analysis */
  let evBar = null, evKey = '', evT = 0;
  function updateEval(bad) {
    const wrap = document.querySelector('#editor .board-wrap');
    if (!wrap || !LP.evalBar || !MR || !window.AIAnalyse) return;
    if (!evBar) evBar = LP.evalBar.attach(wrap);
    if (!evBar) return;
    if (bad) { evBar.hide(); evKey = ''; return; }
    const fen = toFen(), key = fen + '|' + flipped;
    if (key === evKey) return;
    evKey = key; clearTimeout(evT);
    evT = setTimeout(() => {
      if (evKey !== key || !$('#editor').classList.contains('active')) return;
      let w = 0.5, mate = 0, fin = false;
      try {
        const g = new window.Chess();
        if (g.loadFen(fen)) return;
        if (!g.hasLegalMove()) { if (g.inCheck(g.turn)) { w = g.turn === WHITE ? 0 : 1; fin = true; } }
        else {
          const A = window.AIAnalyse.run(MR.clone(g), null, 300, 9, 4), s = A.top[0].score, p = MR.wp(s);
          w = g.turn === WHITE ? p : 1 - p;
          if (Math.abs(s) >= MR.MATE - 100) mate = Math.ceil((MR.MATE - Math.abs(s)) / 2) * ((s > 0) === (g.turn === WHITE) ? 1 : -1);
        }
      } catch (x) { w = 0.5; }
      if (evKey === key) evBar.set(w, flipped, mate, fin);
    }, 450);
  }
  /** The best moves with a score, and the shortest forced mate if there is one. */
  function analyseSheet() {
    if (problems().length) return;
    LP.openSheet('<h2>Analysing…</h2><p class="note">Looking for the best moves.</p>');
    setTimeout(() => {
      let html = '';
      try {
        const g = new window.Chess(); g.loadFen(toFen());
        const side = g.turn === WHITE ? 'White' : 'Black';
        if (!g.hasLegalMove()) html = g.inCheck(g.turn) ? `<p class="note"><b>Checkmate.</b> ${side} has no moves and is in check.</p>` : '<p class="note"><b>Stalemate.</b> ' + side + ' has no moves, so it is a draw.</p>';
        else {
          const A = window.AIAnalyse.run(MR.clone(g), null, 1800, 12, 6);
          const fmtS = (s) => { if (Math.abs(s) >= MR.MATE - 100) { const n = Math.ceil((MR.MATE - Math.abs(s)) / 2); return (s > 0 ? side : (g.turn === WHITE ? 'Black' : 'White')) + ' mates in ' + n; } const wv = MR.wp(s), ww = g.turn === WHITE ? wv : 1 - wv; return LP.evalBar.label(ww, false) + ' for White'; };
          const rows = A.top.slice(0, 3).map((t, k) => `<div class="ed-an-r${k ? '' : ' best'}"><b>${esc(g.moveToSan(t.move))}</b><span>${esc(fmtS(t.score))}</span></div>`).join('');
          let mate = '';
          try { const m = window.findMateLine ? window.findMateLine(g, 6, 1200) : null; mate = m ? `<p class="ed-an-m"><b>Forced mate in ${m.n}</b> for ${side}, starting with <b>${esc(g.moveToSan(m.move))}</b>.</p>` : '<p class="note">No forced mate found within 6 moves.</p>'; } catch (x) { mate = ''; }
          html = `<p class="note">${side} to move. Best moves:</p><div class="ed-an">${rows}</div>${mate}`;
        }
      } catch (x) { html = '<p class="note">Could not analyse this position.</p>'; }
      LP.openSheet('<h2>Position analysis</h2>' + html + '<button class="btn wide" id="ed-anx">Close</button>', true);
      $('#ed-anx').onclick = LP.closeSheet;
    }, 60);
  }

  /* ------------------------------------------------------------------ saved positions */
  function stamp(t) { const d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  const folders = () => [...new Set(readSaved().map((p) => p.folder).filter(Boolean))];
  function saveSheet() {
    const cur = curId && readSaved().find((x) => x.id === curId);
    LP.openSheet(`<h2>Save this position<span class="sub">Give it a name so you can find it again.</span></h2>
      <input id="ed-name" class="text-in" maxlength="30" placeholder="My position" autocomplete="off" value="${cur ? esc(cur.name) : ''}">
      <input id="ed-folder" class="text-in" maxlength="20" placeholder="Folder (optional)" autocomplete="off" list="ed-folders" value="${cur ? esc(cur.folder || '') : ''}" style="margin-top:.5rem">
      <datalist id="ed-folders">${folders().map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
      <div class="row"><button class="btn" id="ed-sx">Cancel</button>${cur ? '<button class="btn" id="ed-snew">Save as new</button><button class="btn primary" id="ed-sok">Update</button>' : '<button class="btn primary" id="ed-sok">Save</button>'}</div>`, true);
    const nm = $('#ed-name');
    nm.focus();
    const go = (asNew) => {
      const l = readSaved(), name = nm.value.trim(), fo = $('#ed-folder').value.trim();
      let id = curId;
      if (!asNew && cur) { const x = l.find((q) => q.id === curId); if (x) { x.name = name || x.name; x.folder = fo; x.fen = toFen(); x.date = Date.now(); } }
      else { id = Date.now().toString(36); l.unshift({ id, name: name || 'Position ' + (l.length + 1), fen: toFen(), date: Date.now(), folder: fo }); }
      LP.closeSheet();
      if (writeSaved(l)) { curId = id; toast(!asNew && cur ? 'Position updated' : 'Position saved'); } else toast('Could not save on this device');
    };
    $('#ed-sok').onclick = () => go(false);
    if (cur) $('#ed-snew').onclick = () => go(true);
    $('#ed-sx').onclick = LP.closeSheet;
    nm.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(false); });
  }
  let folderSel = '';
  function loadSheet() {
    const all = readSaved(), fl = folders();
    if (folderSel && !fl.includes(folderSel)) folderSel = '';
    const l = folderSel ? all.filter((p) => p.folder === folderSel) : all;
    const chips = fl.length ? '<div class="ed-chips"><button class="ed-chip' + (folderSel ? '' : ' on') + '" data-f="">All</button>' + fl.map((f) => `<button class="ed-chip${folderSel === f ? ' on' : ''}" data-f="${esc(f)}">${esc(f)}</button>`).join('') + '</div>' : '';
    LP.openSheet('<h2>Saved positions</h2>' + chips + (l.length ? '<div class="ed-saved">' + l.map((p) => `<div class="ed-sv" data-id="${p.id}"><button class="ed-sv-go"><b>${esc(p.name)}</b><small>${p.folder ? esc(p.folder) + ' · ' : ''}${stamp(p.date)}</small></button><button class="ed-sv-del" aria-label="Delete ${esc(p.name)}">✕</button></div>`).join('') + '</div>' : '<p class="note">Nothing saved yet. Set up a position and press Save.</p>') + '<button class="btn wide" id="ed-lx">Close</button>', true);
    $('#ed-lx').onclick = LP.closeSheet;
    document.querySelectorAll('.ed-chip').forEach((c) => { c.onclick = () => { folderSel = c.dataset.f; loadSheet(); }; });
    document.querySelectorAll('.ed-sv').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('.ed-sv-go').onclick = () => { const p = readSaved().find((x) => x.id === id); if (p && !fromFen(p.fen)) { curId = id; curName = p.name; LP.closeSheet(); redraw(); toast('Loaded ' + p.name); } };
      row.querySelector('.ed-sv-del').onclick = () => { writeSaved(readSaved().filter((x) => x.id !== id)); if (curId === id) curId = null; loadSheet(); };
    });
  }
  function pasteSheet() {
    LP.openSheet('<h2>Import from FEN<span class="sub">Paste or type a FEN code (the standard text for a chess position). A board alone also works.</span></h2><textarea id="ed-paste" class="text-in" rows="3" placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"></textarea><div id="ed-perr" class="note"></div><div class="row"><button class="btn" id="ed-px">Cancel</button><button class="btn" id="ed-pclip">Paste</button><button class="btn primary" id="ed-pok">Import</button></div>', true);
    $('#ed-px').onclick = LP.closeSheet;
    $('#ed-pclip').onclick = () => {
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => { $('#ed-paste').value = t.trim(); }, () => { $('#ed-perr').textContent = 'Your browser blocked the clipboard. Paste into the box instead.'; });
      else $('#ed-perr').textContent = 'Paste into the box instead.';
    };
    $('#ed-pok').onclick = () => {
      let txt = $('#ed-paste').value.trim().replace(/\s+/g, ' ');
      if (txt && txt.split(' ').length === 1) txt += ' w - - 0 1';   // just the board
      const err = fromFen(txt);
      if (err) { $('#ed-perr').textContent = err; return; }
      curId = null; LP.closeSheet(); redraw();
    };
  }
  /** Import and Export both start by asking which format: FEN or PGN. */
  function askFormat(verb, onFen, onPgn, onLink) {
    LP.openSheet(`<h2>${verb}<span class="sub">${verb === 'Import' ? 'What are you importing?' : 'What do you want to export?'}</span></h2>
      <div class="stack"><button class="btn big" id="ed-fmt-fen">FEN<small>One position as a line of text</small></button>
      <button class="btn big" id="ed-fmt-pgn">PGN<small>${verb === 'Import' ? 'A whole game: the editor shows its final position' : 'The position as a PGN file'}</small></button>
      ${onLink ? '<button class="btn big" id="ed-fmt-link">Link<small>A web link that opens this position in the editor</small></button>' : ''}
      <button class="btn" id="ed-fmt-x">Cancel</button></div>`, true);
    $('#ed-fmt-fen').onclick = onFen;
    $('#ed-fmt-pgn').onclick = onPgn;
    if (onLink) $('#ed-fmt-link').onclick = onLink;
    $('#ed-fmt-x').onclick = LP.closeSheet;
  }
  const shareUrl = () => location.origin + location.pathname + '?fen=' + encodeURIComponent(toFen());
  function linkSheet() {
    const url = shareUrl();
    LP.openSheet('<h2>Share link<span class="sub">Anyone who opens it lands on this position in the editor.</span></h2><textarea id="ex-text" class="ex-text" readonly rows="4" spellcheck="false"></textarea><div class="row"><button class="btn primary" id="ed-lkc">Copy link</button><button class="btn" id="ed-lkx">Close</button></div>', true);
    const ta = $('#ex-text'); ta.value = url;
    $('#ed-lkx').onclick = LP.closeSheet;
    $('#ed-lkc').onclick = async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch (x) { try { ta.removeAttribute('readonly'); ta.focus(); ta.select(); ok = document.execCommand('copy'); ta.setAttribute('readonly', ''); } catch (y) { ok = false; } }
      $('#ed-lkc').textContent = ok ? 'Copied!' : 'Press and hold the text to copy';
    };
  }

  /* ---- PGN import: play the moves through and show the final position */
  const normSan = (t) => String(t).replace(/[+#!?]/g, '').replace(/=/g, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');
  function parsePgn(text) {
    const g = new window.Chess();
    g.reset();
    const fm = /\[FEN\s+"([^"]+)"\s*\]/i.exec(text);
    if (fm) { const e = g.loadFen(fm[1]); if (e) return { err: 'The FEN inside the PGN is not valid. ' + e }; }
    let body = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let prev;
    do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);   // variations
    body = body.replace(/\$\d+/g, ' ').replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ').replace(/\d+\.+/g, ' ');
    const toks = body.split(/\s+/).filter(Boolean);
    if (!toks.length && !fm) return { err: 'No moves found. Paste the text of a PGN game.' };
    let n = 0;
    for (const t of toks) {
      const want = normSan(t);
      const m = g.legalMoves().find((x) => normSan(g.moveToSan(x)) === want);
      if (!m) return { err: 'Move ' + (n + 1) + ' (' + t + ') is not legal in this game.' };
      g.makeMove(m);
      n++;
    }
    return { fen: g.toFen(), n };
  }
  function pgnImportSheet() {
    LP.openSheet('<h2>Import from PGN<span class="sub">Paste the PGN of a game. The editor will show the position after its last move.</span></h2><textarea id="ed-paste" class="text-in" rows="6" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"></textarea><div id="ed-perr" class="note"></div><div class="row"><button class="btn" id="ed-px">Cancel</button><button class="btn" id="ed-pclip">Paste</button><button class="btn primary" id="ed-pok">Import</button></div>', true);
    $('#ed-px').onclick = LP.closeSheet;
    $('#ed-pclip').onclick = () => {
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => { $('#ed-paste').value = t.trim(); }, () => { $('#ed-perr').textContent = 'Your browser blocked the clipboard. Paste into the box instead.'; });
      else $('#ed-perr').textContent = 'Paste into the box instead.';
    };
    $('#ed-pok').onclick = () => {
      const r = parsePgn($('#ed-paste').value);
      if (r.err) { $('#ed-perr').textContent = r.err; return; }
      const err = fromFen(r.fen);
      if (err) { $('#ed-perr').textContent = err; return; }
      curId = null; LP.closeSheet(); redraw();
      toast(r.n ? 'Loaded ' + r.n + ' move' + (r.n === 1 ? '' : 's') : 'Position loaded');
    };
  }

  /* ---- export */
  function exportFenSheet() {
    if (LP.exporter && LP.exporter.boardSheet) LP.exporter.boardSheet(toFen(), false);   // FEN text or a picture, copy or download
    else copyFen();
  }
  function positionPgn() {
    const d = new Date(), z = (x) => String(x).padStart(2, '0');
    return ['[Event "Local Pieces position"]', '[Site "Local Pieces"]', '[Date "' + d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate()) + '"]', '[Round "-"]', '[White "White"]', '[Black "Black"]', '[Result "*"]', '[SetUp "1"]', '[FEN "' + toFen() + '"]', '', '*', ''].join('\n');
  }
  function exportPgnSheet() {
    const text = positionPgn();
    LP.openSheet('<h2>Export PGN<span class="sub">The position, ready to open in any chess program.</span></h2><textarea id="ex-text" class="ex-text" readonly rows="8" spellcheck="false"></textarea><div class="row"><button class="btn" id="ed-pgc">Copy</button><button class="btn primary" id="ed-pgd">Download</button></div><button class="btn wide" id="ed-pgx" style="margin-top:.6rem">Close</button>', true);
    const ta = $('#ex-text');
    ta.value = text;
    const flash = (b, t) => { const o = b.dataset.t || b.textContent; b.dataset.t = o; b.textContent = t; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = o; }, 1600); };
    $('#ed-pgc').onclick = async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { try { ta.removeAttribute('readonly'); ta.focus(); ta.select(); ok = document.execCommand('copy'); ta.setAttribute('readonly', ''); } catch (x) { ok = false; } }
      flash($('#ed-pgc'), ok ? 'Copied!' : 'Press and hold the text to copy');
    };
    $('#ed-pgd').onclick = () => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
      a.href = url; a.download = 'position-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.pgn'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      flash($('#ed-pgd'), 'Downloaded');
    };
    $('#ed-pgx').onclick = LP.closeSheet;
  }
  function copyFen() {
    const f = toFen();
    const done = () => toast('FEN copied');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(f).then(done, () => { $('#ed-fen').select(); toast('Select the code above and copy it'); });
    else { $('#ed-fen').select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Select the code above and copy it'); } }
  }
  let tt = 0;
  function toast(t) { const e = $('#ed-toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 1400); }

  /* ------------------------------------------------------------------ page */
  function build() {
    const sec = document.createElement('section');
    sec.id = 'editor'; sec.className = 'page';
    sec.innerHTML = `<header class="game-header">
        <button id="ed-back" class="text-btn" aria-label="Back to menu">&larr; Menu</button>
        <span class="pz-head"><span class="mode-title" id="ed-ttl">Position editor</span></span>
        <span class="header-spacer"></span>
      </header>
      <div class="layout"><div class="board-col">
        <div class="board-wrap"><div id="ed-board" class="board"></div><div id="ed-toast" class="toast" role="status"></div></div>
        <div id="ed-pal" class="ed-pal"></div>
      </div><div class="panel ed-panel">
        <div id="ed-cr" class="ed-cr hidden">
          <input id="ed-title" class="text-in" maxlength="28" placeholder="Puzzle title" autocomplete="off" aria-label="Puzzle title">
          <label class="ed-cl"><span>Category</span><select id="ed-cat" class="text-in"></select></label>
          <div id="ed-ver" class="ed-ver"></div>
          <div class="controls ed-go"><button class="btn" id="ed-test">Test</button><button class="btn primary" id="ed-pub">Publish</button></div>
        </div>
        <div id="ed-msg" class="ed-msg"></div>
        <div class="ed-row"><span class="ed-l">To move</span><button class="btn seg" id="ed-white">White</button><button class="btn seg" id="ed-black">Black</button></div>
        <div id="ed-cnt" class="ed-cnt"></div>
        <div class="ed-row ed-cast"><span class="ed-l">Castling</span>
          <label><input type="checkbox" id="ed-cK"> White short</label><label><input type="checkbox" id="ed-cQ"> White long</label>
          <label><input type="checkbox" id="ed-ck"> Black short</label><label><input type="checkbox" id="ed-cq"> Black long</label></div>
        <div class="ed-row"><span class="ed-l">En passant</span><select id="ed-ep" class="text-in ed-num" aria-label="En passant square"></select>
          <span class="ed-l ed-l2">Half-moves</span><input id="ed-hm" class="text-in ed-num" type="number" min="0" max="99" inputmode="numeric" aria-label="Half-move clock">
          <span class="ed-l ed-l2">Move no.</span><input id="ed-fm" class="text-in ed-num" type="number" min="1" max="999" inputmode="numeric" aria-label="Move number"></div>
        <div class="controls ed-tools"><button class="btn" id="ed-undo">Undo</button><button class="btn" id="ed-redo">Redo</button><button class="btn" id="ed-clear">Clear</button><button class="btn" id="ed-presets">Quick starts</button></div>
        <div class="controls ed-tools"><button class="btn" id="ed-flip">Flip board</button><button class="btn" id="ed-mirror">Mirror</button><button class="btn" id="ed-swap">Swap colours</button><button class="btn" id="ed-an">Analyse</button></div>
        <div class="ed-row"><input id="ed-fen" class="text-in ed-fen" readonly aria-label="FEN code"></div>
        <div class="controls ed-tools"><button class="btn" id="ed-import">Import</button><button class="btn" id="ed-export">Export</button><button class="btn" id="ed-save">Save</button><button class="btn" id="ed-load">Saved</button></div>
        <div class="controls ed-go ed-playrow"><button class="btn primary ed-wide" id="ed-play0">Open in Sandbox</button></div>
        <div class="controls ed-go ed-playrow"><button class="btn" id="ed-play1">Play the computer</button><button class="btn" id="ed-play2">Play 2 players</button></div>
        <p class="note ed-fun">The Sandbox lets you undo, get hints and see the eval bar. Position games are for fun: they never change your Elo, leaderboard or rewards. Press and hold a square for more tools, or drag pieces to move them (drop one off the board to delete it).</p>
      </div></div>`;
    $('#app').insertBefore(sec, $('#sheet-bg'));
    $('#ed-back').onclick = () => { if (creating && LP.community) LP.community.open(); else LP.showPage('menu'); };
    $('#ed-title').oninput = (e) => { title = e.target.value; drawInfo(); };
    $('#ed-cat').onchange = (e) => { cat = e.target.value; drawInfo(); };
    $('#ed-test').onclick = testIt;
    $('#ed-pub').onclick = publish;
    if (LP.drag && LP.drag.attach) LP.drag.attach($('#ed-board'), { tap: dTap, selected: () => (brush === 'm' ? moveSel : dragFrom), can: (i) => !!cells[i], off: dOff, done: () => { dragFrom = -1; } });
    const bd = $('#ed-board');
    bd.addEventListener('pointerdown', (ev) => {
      const q = ev.target.closest && ev.target.closest('.square');
      if (!q || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      clearTimeout(lpT); lpPos = { x: ev.clientX, y: ev.clientY };
      lpT = setTimeout(() => { lpFired = true; sqSheet(+q.dataset.sq); }, 600);
    });
    bd.addEventListener('pointermove', (ev) => { if (lpPos && Math.hypot(ev.clientX - lpPos.x, ev.clientY - lpPos.y) > 8) clearTimeout(lpT); });
    ['pointerup', 'pointercancel'].forEach((t) => bd.addEventListener(t, () => clearTimeout(lpT)));
    bd.addEventListener('contextmenu', (ev) => ev.preventDefault());
    bd.addEventListener('click', (ev) => { if (lpFired) { lpFired = false; ev.stopImmediatePropagation(); ev.preventDefault(); } }, true);
    $('#ed-ep').onchange = (ev) => { ep = ev.target.value; drawInfo(); };
    $('#ed-hm').oninput = (ev) => { hm = Math.max(0, Math.min(99, parseInt(ev.target.value, 10) || 0)); drawInfo(); };
    $('#ed-fm').oninput = (ev) => { fm = Math.max(1, Math.min(999, parseInt(ev.target.value, 10) || 1)); drawInfo(); };
    $('#ed-undo').onclick = () => goHist(-1);
    $('#ed-redo').onclick = () => goHist(1);
    $('#ed-mirror').onclick = mirror;
    $('#ed-swap').onclick = swapColours;
    $('#ed-presets').onclick = presetSheet;
    $('#ed-an').onclick = analyseSheet;
    $('#ed-white').onclick = () => { turn = 'w'; drawInfo(); };
    $('#ed-black').onclick = () => { turn = 'b'; drawInfo(); };
    ['K', 'Q', 'k', 'q'].forEach((c) => { $('#ed-c' + c).onchange = (e) => { castle[c] = e.target.checked; drawInfo(); }; });
    $('#ed-clear').onclick = () => { cells = new Array(64).fill(''); castle = { K: false, Q: false, k: false, q: false }; ep = ''; hm = 0; fm = 1; curId = null; redraw(); };
    $('#ed-flip').onclick = () => { flipped = !flipped; drawBoard(); updateEval(false); };
    $('#ed-import').onclick = () => askFormat('Import', pasteSheet, pgnImportSheet);
    $('#ed-export').onclick = () => askFormat('Export', exportFenSheet, exportPgnSheet, linkSheet);
    $('#ed-save').onclick = saveSheet;
    $('#ed-load').onclick = loadSheet;
    $('#ed-play0').onclick = () => { if (!problems().length) LP.playPosition(toFen(), 0); };
    $('#ed-play1').onclick = () => { if (!problems().length) LP.playPosition(toFen(), 1); };
    $('#ed-play2').onclick = () => { if (!problems().length) LP.playPosition(toFen(), 2); };
    built = true;
  }
  /** Test: play the position against the Insane computer as the side to move. Solving it is what unlocks Publish. */
  function testIt() {
    if (problems().length) return;
    const c = catOf(cat), fen = toFen();
    LP.playPopular({ id: 'test-draft', name: title.trim() || 'Your puzzle', goal: c.n ? 'Mate in ' + c.n : 'Win', fen, n: c.n, src: 'test', hash: hashOf() });
  }
  /** Called by the game when a Test is won. Counts only if the editor still holds exactly what was solved. */
  function tested(h) {
    if (h && h === hashOf()) { vhash = h; saveDraft(); }
    else if (h) { vhash = ''; }
  }
  async function publish() {
    if (!verified() || problems().length || !title.trim()) return;
    const N = LP.onlineApi;
    if (!N || !N.url()) { toast('Online is not set up'); return; }
    const go = async () => {
      const fen = toFen();
      LP.openSheet('<h2>Publishing…</h2>');
      const r = await N.post({ a: 'cmpub', pid: LP.global ? LP.global.pid() : '', name: LP.profile.name(), title: title.trim(), cat, fen }, 2);
      if (!r || r.error || !r.id) {
        LP.openSheet(`<h2>Could not publish</h2><p class="note">${esc((r && r.error) || 'Something went wrong.')}</p><button class="btn wide" id="ed-px2">Close</button>`, true);
        $('#ed-px2').onclick = LP.closeSheet;
        return;
      }
      LP.closeSheet();
      try { localStorage.removeItem(DRAFT); } catch (e) { /* ignore */ }
      title = ''; vhash = '';
      if (LP.community) LP.community.published(r.id);
    };
    N.profileName(go);
  }
  function show(opts) {
    if (!built) { build(); fromFen(START); }
    creating = !!(opts && opts.create);
    moveSel = -1;
    if (creating) {
      const d = loadDraft();
      if (opts.fresh) { try { localStorage.removeItem(DRAFT); } catch (e) { /* ignore */ } }
      if (d && !opts.fresh && d.fen && !fromFen(d.fen)) { title = d.title || ''; cat = d.cat || 'mate1'; vhash = d.v || ''; }
      else if (opts.fresh) { fromFen(START); title = ''; cat = 'mate1'; vhash = ''; }
      const sel = $('#ed-cat');
      sel.innerHTML = cats().map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
      sel.value = cat; $('#ed-title').value = title;
    }
    $('#ed-cr').classList.toggle('hidden', !creating);
    document.querySelectorAll('.ed-playrow, .ed-fun, #ed-an').forEach((e) => e.classList.toggle('hidden', creating));
    $('#ed-ttl').textContent = creating ? 'Create a puzzle' : 'Position editor';
    drawPalette();
    redraw();
    LP.showPage('editor');
  }
  // a shared link (?fen=...) opens the editor on that position
  try {
    const q = new URLSearchParams(location.search).get('fen');
    if (q) setTimeout(() => { show(); if (!fromFen(q)) { curId = null; redraw(); } try { history.replaceState(null, '', location.pathname); } catch (x) { /* ignore */ } }, 700);
  } catch (x) { /* ignore */ }
  const m = document.querySelector('.mode[data-mode="editor"]');
  if (m) m.addEventListener('click', show);
  LP.editor = { show, tested, toFen, fromFen: (f) => { const e = fromFen(f); if (built && !e) redraw(); return e; } };
})();
