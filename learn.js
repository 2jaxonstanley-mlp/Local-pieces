/**
 * Learn: a winding path of topic "pads" (Forks, Pins, Castling ...). Each topic has 10 levels that unlock in order.
 * Level kinds (data lives in learn-<topic>.js as window.LPLessons[topic]):
 *   teach / demo: slides on a board (arrows, auto-played moves).   play: puzzles where you make the moves; the bot answers.
 * A puzzle's answer is a small tree: { o: { 'e7f5': { say, r: bot reply, rs: text after the reply, n: next tree } } }.
 *   LP.learn.open() shows the page.
 */
(() => {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => (LP.esc ? LP.esc(String(t == null ? '' : t)) : String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const KEY = 'localPieces.learn';
  const GLYPH = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };
  const LEVELS = 10;
  const TOKENS = 30;   // for finishing a whole topic (once)

  const IC = {
    forks: '<path d="M12 21V9M5 4v5a7 7 0 0 0 14 0V4M12 4v5"/>',
    pins: '<path d="M9 3h6l-1 6 3 3H7l3-3zM12 12v9"/>',
    skewers: '<path d="M3 21L21 3M15 3h6v6"/><circle cx="9" cy="15" r="2.2"/><circle cx="14" cy="10" r="2.2"/>',
    hanging: '<circle cx="12" cy="4.5" r="2.5"/><path d="M12 7v3M9 21h6l-1.2-9h-3.6z"/>',
    castling: '<path d="M5 21h14M6 21v-9h12v9M6 12V7h2.5v2h2V7h3v2h2V7H18v5"/>',
    enpassant: '<circle cx="8" cy="7" r="2.4"/><circle cx="16" cy="7" r="2.4"/><path d="M5.5 20v-5a2.5 2.5 0 0 1 5 0v5M13.5 20v-5a2.5 2.5 0 0 1 5 0v5"/>',
    promotion: '<path d="M12 21V8M6 13l6-6 6 6M8 3h8"/>',
    develop: '<path d="M7 21h10M8 21c0-5 1-8 4-10-2-1-4-3-4-6 4 0 8 2 8 6 1 3 0 7 0 10"/>',
    defend: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
    kingdef: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8 15l1-4 3 3 3-3 1 4z"/>',
    mates: '<path d="M12 2v4M10 4h4M7 21h10l1-10-4 3-2-5-2 5-4-3z"/>',
  };
  const CAT = { Tactics: '#ff8a5c', Rules: '#5ab0ff', Basics: '#6bd68b', Checkmate: '#c58bff' };
  const TOPICS = [
    { id: 'develop', name: 'Develop pieces', cat: 'Basics', d: 'Get your pieces into the game fast.' },
    { id: 'defend', name: 'Defending pieces', cat: 'Basics', d: 'Keep your pieces safe.' },
    { id: 'kingdef', name: 'Defending the king', cat: 'Basics', d: 'Keep your king out of trouble.' },
    { id: 'castling', name: 'Castling', cat: 'Rules', d: 'When you can castle, when you cannot, and why it helps.' },
    { id: 'enpassant', name: 'En passant', cat: 'Rules', d: 'The special pawn capture.' },
    { id: 'promotion', name: 'Promotion', cat: 'Rules', d: 'Turn a pawn into a queen (or something else).' },
    { id: 'hanging', name: 'Hanging piece', cat: 'Tactics', d: 'Spot pieces nobody is protecting.' },
    { id: 'forks', name: 'Forks', cat: 'Tactics', d: 'One piece attacks two. Win material with forks.' },
    { id: 'pins', name: 'Pins', cat: 'Tactics', d: 'Freeze a piece that cannot move without losing something bigger.' },
    { id: 'skewers', name: 'Skewer', cat: 'Tactics', d: 'Attack a big piece so it has to move and expose the one behind it.' },
    { id: 'mates', name: 'Checkmate', cat: 'Checkmate', d: 'Back rank mate, queen and rook mates, ladder mate.' },
  ];
  const HAS_IMG = ['develop', 'defend', 'kingdef', 'castling', 'enpassant', 'promotion', 'hanging', 'forks', 'pins', 'skewers', 'mates'];   // topic ids that have a picture learn-<id>.png in the site folder (shown instead of the drawn icon)
  const data = (id) => (window.LPLessons && window.LPLessons[id]) || null;

  /* ------------------------------------------------------------------ progress */
  let PR = {};
  try { PR = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { PR = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(PR)); } catch (e) { /* ignore */ } };
  const done = (id) => Math.min(LEVELS, (PR[id] && PR[id].done) || 0);

  /* ------------------------------------------------------------------ page */
  let focus = 0, view = 'path', topic = null, root = null;
  const page = () => $('#learn');

  function shell() {
    const p = page();
    if (!p || p.dataset.built) return p;
    p.dataset.built = '1';
    p.innerHTML = `<header class="game-header">
        <button id="ln-home" class="text-btn" type="button" aria-label="Back to the menu">&larr; Home</button>
        <span class="pz-head"></span>
        <button id="ln-redo" class="text-btn ln-redo" type="button">Redo tutorial lesson</button>
      </header>
      <div class="ln-wrap"><h2 class="ln-h">Learn</h2><p class="ln-sub">Chess lessons for plebs</p><div id="ln-view"></div></div>`;
    $('#ln-home').onclick = () => { if (view === 'topic') { view = 'path'; render(); } else { LP.showPage('menu'); if (LP.menuPane) LP.menuPane('home'); } };
    $('#ln-redo').onclick = () => { if (LP.lesson) LP.lesson.start(); };
    document.addEventListener('keydown', (e) => {
      if (!page() || !page().classList.contains('active') || view !== 'path' || (root && root.classList.contains('on'))) return;
      if (e.key === 'ArrowRight') go(focus + 1); else if (e.key === 'ArrowLeft') go(focus - 1);
    });
    window.addEventListener('resize', () => { if (page() && page().classList.contains('active') && view === 'path') layout(); });
    return p;
  }
  function open() {
    let k = -1;
    try { const l = localStorage.getItem(KEY + '.last'); k = TOPICS.findIndex((t) => t.id === l); } catch (e) { /* ignore */ }
    if (k < 0) k = Math.max(0, TOPICS.findIndex((t) => data(t.id) && done(t.id) < LEVELS));
    focus = k;
    view = 'path';
    LP.showPage('learn');
    shell();
    render();
  }

  function render() {
    shell();
    $('#ln-home').innerHTML = view === 'topic' ? '&larr; Topics' : '&larr; Home';
    $('#ln-redo').classList.toggle('hidden', view === 'topic');
    if (view === 'topic') renderTopic(); else renderPath();
  }

  /* ---------------- the winding path: pads (discs) with the drawing standing on them and a label on the other side */
  const STEP = 132, ROWH = 120;
  const icon = (t, big) => `<span class="ln-ic">${HAS_IMG.includes(t.id) ? `<img src="learn-${t.id}.png" alt="" onerror="this.remove()">` : ''}<svg width="${big}" height="${big}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[t.id]}</svg></span>`;
  /** Mastery badge for a topic: bronze from 3 levels, silver from 6, gold when all 10 are done. */
  const badge = (n) => (n >= LEVELS ? 'gold' : n >= 6 ? 'silver' : n >= 3 ? 'bronze' : '');
  /** "Next lesson": the first topic (in order) that still has levels to do. */
  function nextCard() {
    const i = TOPICS.findIndex((t) => data(t.id) && done(t.id) < LEVELS);
    if (i < 0) return `<div class="ln-next"><img src="lp-mascot-happy.png" alt=""><div><b>All lessons finished!</b><span>Revisit any topic to practise.</span></div></div>`;
    const t = TOPICS[i], dn = done(t.id);
    return `<button class="ln-next" id="ln-next" type="button" data-i="${i}"><img src="lp-mascot-${dn ? 'happy' : 'think'}.png" alt=""><div><b>${dn ? 'Keep going' : 'Start here'}: ${esc(t.name)}</b><span>Level ${dn + 1} of ${LEVELS}</span></div></button>`;
  }
  function renderPath() {
    const v = $('#ln-view');
    v.innerHTML = `<div class="ln-stage" id="ln-stage">
        <button class="ln-arr l" id="ln-l" type="button" aria-label="Previous topic"><img src="learn-arrow-l.png" alt="" width="38"></button>
        <div class="ln-track" id="ln-track">${TOPICS.map((t, i) => {
    const dn = done(t.id), has = !!data(t.id);
    return `<div class="ln-row${dn >= LEVELS ? ' full' : ''}${has ? '' : ' soon'}" data-i="${i}" style="--pc:${CAT[t.cat]}">
            <button class="ln-disc" type="button" aria-label="${esc(t.name)}">${icon(t, 56)}<b>${esc(t.name)}</b></button>
            <span class="ln-lab">${dn >= LEVELS ? '&#10003; ' : ''}${dn}/${LEVELS} completed${badge(dn) ? `<img class="ln-badge" src="learn-badge-${badge(dn)}.png" alt="${badge(dn)} badge">` : ''}${has ? '' : '<em>Coming soon</em>'}</span></div>`;
  }).join('')}</div>
        <button class="ln-arr r" id="ln-r" type="button" aria-label="Next topic"><img src="learn-arrow-r.png" alt="" width="38"></button>
      </div>
      <div class="ln-cap" id="ln-cap"></div>${nextCard()}`;
    const nx = $('#ln-next'); if (nx) nx.onclick = () => { const i = +nx.dataset.i; if (i === focus) openTopic(TOPICS[i].id); else go(i); };
    $('#ln-l').onclick = () => go(focus - 1);
    $('#ln-r').onclick = () => go(focus + 1);
    v.querySelectorAll('.ln-row').forEach((r) => r.addEventListener('click', (e) => { if (!e.target.closest('.ln-disc, .ln-lab')) return; const i = +r.dataset.i; if (i === focus) openTopic(TOPICS[i].id); else go(i); }));
    let sx = null;
    const st = $('#ln-stage');
    st.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    st.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) go(focus + (dx < 0 ? 1 : -1)); });
    layout();
  }
  function go(n) {
    focus = Math.max(0, Math.min(TOPICS.length - 1, n));
    try { localStorage.setItem(KEY + '.last', TOPICS[focus].id); } catch (e) { /* ignore */ }
    layout();
  }
  function layout() {
    const st = $('#ln-stage'), tr = $('#ln-track');
    if (!st || !tr) return;
    const W = st.clientWidth || 340, H = st.clientHeight || 460;
    const dw = Math.min(190, Math.round(W * 0.5));
    Array.from(tr.querySelectorAll('.ln-row')).forEach((r, i) => {
      const d = Math.abs(i - focus), left = i % 2 === 0;
      r.style.top = i * STEP + 'px'; r.style.height = ROWH + 'px';
      r.style.setProperty('--dw', dw + 'px');
      r.classList.toggle('lft', left); r.classList.toggle('rgt', !left);
      r.classList.toggle('now', d === 0); r.classList.toggle('d1', d === 1); r.classList.toggle('d2', d === 2); r.classList.toggle('far', d > 2);
      const disc = r.querySelector('.ln-disc'); disc.tabIndex = d > 2 ? -1 : 0;
    });
    tr.style.height = TOPICS.length * STEP + 'px';
    tr.style.transform = 'translateY(' + Math.round(H * 0.34 - (focus * STEP + ROWH * 0.62)) + 'px)';
    $('#ln-l').disabled = focus === 0; $('#ln-r').disabled = focus === TOPICS.length - 1;
    const t = TOPICS[focus];
    $('#ln-cap').innerHTML = `<b>${esc(t.name)}</b><span>${esc(t.cat)} &middot; ${focus + 1} of ${TOPICS.length}</span><small>Tap the front pad to open it</small>`;
  }

  /* ---------------- one topic: its 10 levels */
  function openTopic(id) {
    topic = TOPICS.find((t) => t.id === id);
    view = 'topic';
    render();
  }
  function renderTopic() {
    const t = topic, D = data(t.id), dn = done(t.id), v = $('#ln-view');
    if (!D) {
      v.innerHTML = `<div class="ln-top" style="--pc:${CAT[t.cat]}">${icon(t, 40)}<div><b>${esc(t.name)}</b><span>${esc(t.cat)}</span></div></div>
        <p class="ln-soon">${esc(t.d)}</p><p class="note">This course is coming in a later update. Try Forks first!</p>`;
      return;
    }
    const KIND = { teach: 'Lesson', demo: 'Examples', play: 'Practice' };
    v.innerHTML = `<div class="ln-top" style="--pc:${CAT[t.cat]}">${icon(t, 40)}<div><b>${esc(t.name)}</b><span>${dn}/${LEVELS} completed</span></div></div>
      <i class="ln-bar" aria-hidden="true"><i style="width:${dn * 10}%"></i></i>
      <div class="ln-levels">${D.levels.map((L, i) => {
    const st = i < dn ? 'done' : i === dn ? 'open' : 'lock';
    return `<button class="ln-lv ${st}" type="button" data-i="${i}" ${st === 'lock' ? 'disabled' : ''}>
          <span class="ln-n">${st === 'done' ? '&#10003;' : st === 'lock' ? '&#128274;' : i + 1}</span>
          <span class="ln-lt"><b>${i + 1}. ${esc(L.t)}</b><small>${esc(L.d)}</small></span>
          <span class="ln-k">${KIND[L.k] || ''}</span></button>`;
  }).join('')}</div>
      <p class="note">Finish a level to unlock the next one. Finish all ${LEVELS} for ${TOKENS} tokens.</p>`;
    v.querySelectorAll('.ln-lv').forEach((b) => b.addEventListener('click', () => play(t.id, +b.dataset.i)));
  }

  /* ------------------------------------------------------------------ the lesson player */
  const files = 'abcdefgh';
  const name88 = (s) => files[s & 7] + ((s >> 4) + 1);
  const idx88 = (i) => (i & 7) + (i >> 3) * 16;
  const idxOf = (a) => (a.charCodeAt(0) - 97) + (parseInt(a[1], 10) - 1) * 8;
  const PLET = { 2: 'n', 3: 'b', 4: 'r', 5: 'q' }, PNAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  const uciOf = (m) => name88(m.from) + name88(m.to) + (m.promo ? PLET[m.promo & 7] : '');
  let g = null, timers = [], S = null;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function buildPlayer() {
    root = document.createElement('div');
    root.id = 'ln-play'; root.className = 'lesson ln-player';
    root.innerHTML = `<div class="ls-top"><b id="lp-title"></b><span class="ls-dots" id="lp-dots"></span><button class="text-btn" id="lp-x" type="button" aria-label="Close the lesson">Close</button></div>
      <div class="ls-bw"><div class="ls-board"><div class="board" id="lp-board"></div><svg class="ls-arrows" id="lp-arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true"></svg></div></div>
      <div class="ls-card"><h3 id="lp-t"></h3><p id="lp-d"></p><div class="row" id="lp-btns"></div></div>`;
    (document.getElementById('app') || document.body).appendChild(root);
    $('#lp-x').onclick = closePlayer;
    $('#lp-board').addEventListener('click', (e) => { const q = e.target.closest('.square'); if (q && S && S.kind === 'play') onSquare(+q.dataset.i); });
  }
  function closePlayer() {
    clear();
    if (root) root.classList.remove('on');
    document.body.classList.remove('ls-open');
    S = null;
    if (page() && view === 'topic') renderTopic();
    else if (page() && page().classList.contains('active')) render();
  }
  function btns(list) {
    const b = $('#lp-btns'); b.innerHTML = '';
    list.forEach((x) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'btn' + (x.p ? ' primary' : ''); el.textContent = x.t; if (x.off) el.disabled = true; el.onclick = x.f; b.appendChild(el); });
  }
  function dots(n, cur) { $('#lp-dots').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k === cur ? 'on' : k < cur ? 'done' : ''}"></i>`).join(''); }
  function text(t, d) { $('#lp-t').textContent = t; $('#lp-d').textContent = d; }

  function drawArrows(list) {
    const svg = $('#lp-arrows');
    const P = (a) => { const n = idxOf(a); return [(n & 7) + 0.5, 7 - (n >> 3) + 0.5]; };
    svg.innerHTML = list.map((a) => {
      const [x1, y1] = P(a[0]), [x2, y2] = P(a[1]);
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const ex = x2 - ux * 0.14, ey = y2 - uy * 0.14, bx = ex - ux * 0.42, by = ey - uy * 0.42, hw = 0.2;
      const sx = x1 + ux * 0.22, sy = y1 + uy * 0.22;
      const col = a[2] === 'r' ? '#e5484d' : '#3fbf6a';
      return `<g class="ls-arr"><line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width=".17" stroke-linecap="round" opacity=".92"/><polygon points="${ex},${ey} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}" fill="${col}" opacity=".92"/></g>`;
    }).join('');
  }

  /** Draw the board from the engine position. o: { hl: [names], dests: [{to,cap}], last: [a, b] } */
  function drawBoard(o) {
    o = o || {};
    const b = $('#lp-board'); b.innerHTML = '';
    const hl = new Set((o.hl || []).map(idxOf)), last = new Set((o.last || []).map(idxOf)), dm = {};
    (o.dests || []).forEach((m) => { dm[m.to] = m; });
    let chk = -1;
    try { if (g.inCheck(g.turn)) { const k = g.kingSquare(g.turn); chk = (k >> 4) * 8 + (k & 7); } } catch (e) { /* ignore */ }
    for (let k = 0; k < 64; k++) {
      const r = 7 - (k >> 3), f = k & 7, idx = r * 8 + f, p = g.board[f + r * 16];
      const el = document.createElement('div');
      el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark') + (hl.has(idx) ? ' ls-hl' : '') + (last.has(idx) ? ' ln-last' : '') + (idx === chk ? ' check' : '') + (dm[idx] ? ' legal ' + (dm[idx].cap ? 'capture' : 'x') : '') + (o.sel === idx ? ' ln-sel' : '');
      el.dataset.i = idx;
      if (r === 0) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = files[f]; el.appendChild(c); }
      if (f === 0) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = r + 1; el.appendChild(c); }
      if (p) { const s = document.createElement('span'); s.className = 'piece ' + ((p & 24) === 8 ? 'w' : 'b'); s.textContent = GLYPH[p & 7]; el.appendChild(s); }
      b.appendChild(el);
    }
  }
  const load = (fen) => { if (!g) g = new window.Chess(); g.reset(); g.loadFen(fen); };
  function mv(u) {
    const m = g.legalMoves().find((x) => uciOf(x) === u);
    if (!m) return null;
    g.makeMove(m);
    return m;
  }

  function play(id, li) {
    const D = data(id); if (!D) return;
    if (!root) buildPlayer();
    S = { id, li, D, L: D.levels[li], kind: 'slides' };
    LP.closeSheet && LP.closeSheet();
    root.classList.add('on');
    document.body.classList.add('ls-open');
    root.scrollTop = 0;
    $('#lp-title').textContent = D.name + ' · Level ' + (li + 1);
    if (S.L.k === 'play') { S.kind = 'play'; S.pi = 0; puzzle(); } else { S.si = 0; slide(0); }
  }

  /* ---------------- slides (teach and demo) */
  function slide(n) {
    clear();
    const L = S.L, sl = L.slides, i = Math.max(0, Math.min(sl.length - 1, n)), s = sl[i];
    S.si = i;
    load(s.fen);
    drawBoard({ hl: s.hl });
    drawArrows([]);
    text(s.t, s.d);
    dots(sl.length > 12 ? 0 : sl.length, i);
    if (sl.length > 12) $('#lp-dots').innerHTML = `<span class="ls-count">${i + 1} / ${sl.length}</span>`;
    const lastS = i === sl.length - 1;
    btns([{ t: 'Back', f: () => slide(i - 1), off: i === 0 }, { t: lastS ? 'Finish' : 'Next', p: true, f: () => (lastS ? finish() : slide(i + 1)) }]);
    // arrows come in one by one
    const arrows = s.arrows || [];
    arrows.forEach((a, k) => later(() => drawArrows(arrows.slice(0, k + 1)), 500 + k * 650));
    // moves play by themselves
    let t0 = 800;
    (s.play || []).forEach((u, k) => {
      later(() => { const m = mv(u); if (m) drawBoard({ last: [name88(m.from), name88(m.to)] }); drawArrows([]); }, t0);
      t0 += 1100;
    });
    if (s.arr && s.arr.length) later(() => drawArrows(s.arr), t0 - 500);
  }

  /* ---------------- puzzles */
  function puzzle() {
    clear();
    const L = S.L, P = L.puzzles[S.pi];
    S.P = P; S.node = P.tree; S.sel = -1; S.busy = false; S.wrong = 0; S.solved = false; S.last = null;
    load(P.fen);
    dots(L.puzzles.length, S.pi);
    text('Puzzle ' + (S.pi + 1) + ' of ' + L.puzzles.length, P.ask);
    drawBoard(); drawArrows([]);
    controls();
    if (P.pre) {   // the bot makes the first move (for example a pawn jumping two squares)
      S.busy = true;
      $('#lp-d').textContent = 'Black is about to move...';
      later(() => { const m = mv(P.pre); if (m) { S.last = [name88(m.from), name88(m.to)]; drawBoard({ last: S.last }); } $('#lp-d').textContent = P.ask; S.busy = false; }, 900);
    }
  }
  function controls() {
    if (S.solved) {
      const lastP = S.pi === S.L.puzzles.length - 1;
      btns([{ t: lastP ? 'Finish level' : 'Next puzzle', p: true, f: () => { if (lastP) finish(); else { S.pi++; puzzle(); } } }]);
    } else {
      btns([{ t: 'Hint', f: hint }, { t: 'Restart', f: puzzle }]);
    }
  }
  function hintMove() { const k = Object.keys(S.node.o)[0]; return k; }
  function hint() {
    if (S.busy || S.solved) return;
    const k = hintMove();
    S.hintStage = (S.hintStage || 0) + 1;
    if (S.hintStage === 1) { drawBoard({ hl: [k.slice(0, 2)], last: S.last }); drawArrows([]); $('#lp-d').textContent = 'Look at the highlighted piece. Where can it go to attack two things at once?'; }
    else { drawBoard({ last: S.last }); drawArrows([[k.slice(0, 2), k.slice(2, 4), 'g']]); $('#lp-d').textContent = 'The green arrow shows the move. Try playing it.'; }
  }
  function legalFrom(i) {
    const s = idx88(i);
    const seen = {};
    return g.legalMoves().filter((m) => m.from === s && !seen[m.to] && (seen[m.to] = 1)).map((m) => ({ to: (m.to >> 4) * 8 + (m.to & 7), cap: !!g.board[m.to] || m.flags === 2 }));
  }
  function onSquare(i) {
    if (!S || S.busy || S.solved) return;
    const p = g.board[idx88(i)];
    const mine = p && (p & 24) === g.turn;
    if (S.sel >= 0 && !mine) {
      const from = S.sel, ds = legalFrom(from);
      if (ds.some((d) => d.to === i)) { tryMove(name88(idx88(from)) + name88(idx88(i))); return; }
      S.sel = -1; drawBoard({ last: S.last }); return;
    }
    if (mine) {
      if (S.sel === i) { S.sel = -1; drawBoard({ last: S.last }); return; }
      S.sel = i;
      drawBoard({ sel: i, dests: legalFrom(i), last: S.last });
      return;
    }
    if (S.sel >= 0 && mine === false) { /* empty square, not a legal move */ }
  }
  function tryMove(u) {
    const promos = g.legalMoves().filter((m) => m.promo && uciOf(m).slice(0, 4) === u);
    if (promos.length) {   // pick the new piece first
      S.sel = -1; drawBoard({ last: S.last });
      S.busy = true;
      btns(promos.map((m) => ({ t: PNAME[PLET[m.promo & 7]], p: PLET[m.promo & 7] === 'q', f: () => { S.busy = false; controls(); tryMove(uciOf(m)); } })).concat([{ t: 'Cancel', f: () => { S.busy = false; controls(); } }]));
      $('#lp-d').textContent = 'Choose the piece your pawn becomes.';
      return;
    }
    const x = S.node.o[u];
    S.sel = -1; drawArrows([]);
    if (!x) {
      S.wrong++;
      const b = $('#lp-board'); b.classList.remove('ln-shake'); void b.offsetWidth; b.classList.add('ln-shake');
      drawBoard({ last: S.last });
      $('#lp-d').textContent = S.wrong >= 2 ? 'Not quite. Tap Hint if you are stuck.' : 'That does not win material. Try another move.';
      return;
    }
    S.busy = true; S.hintStage = 0;
    const m = mv(u);
    S.last = [name88(m.from), name88(m.to)];
    drawBoard({ last: S.last });
    $('#lp-t').textContent = x.r || x.n ? 'Good move!' : 'Nice!';
    $('#lp-d').textContent = x.say;
    if (!x.r) { S.busy = false; S.solved = true; $('#lp-t').textContent = 'Puzzle solved!'; controls(); return; }
    later(() => {
      const r = mv(x.r);
      if (r) { S.last = [name88(r.from), name88(r.to)]; drawBoard({ last: S.last }); }
      $('#lp-d').textContent = x.rs;
      S.node = x.n; S.busy = false;
      if (!x.n) { S.solved = true; $('#lp-t').textContent = 'Puzzle solved!'; controls(); }
    }, 900);
  }

  /* ---------------- finishing a level */
  function finish() {
    clear();
    const { id, li, D } = S;
    const pr = (PR[id] = PR[id] || { done: 0 });
    const first = li >= pr.done;
    if (first) pr.done = li + 1;
    let extra = '';
    if (pr.done >= LEVELS && !pr.paid) {
      pr.paid = 1;
      if (LP.rewards && LP.rewards.addTokens) LP.rewards.addTokens(TOKENS);
      extra = ' You finished the whole topic and earned ' + TOKENS + ' tokens!';
    }
    save();
    const hasNext = li + 1 < D.levels.length;
    text('Level complete!', (first ? 'Level ' + (li + 1) + ' done.' : 'Nice revision.') + (hasNext ? ' The next level is unlocked.' : '') + extra);
    drawArrows([]);
    dots(0, 0);
    btns([{ t: 'Levels', f: closePlayer }, hasNext ? { t: 'Next level', p: true, f: () => play(id, li + 1) } : { t: 'Done', p: true, f: closePlayer }]);
  }

  LP.learn = { open, close: closePlayer, done, topics: () => TOPICS.slice() };
})();
