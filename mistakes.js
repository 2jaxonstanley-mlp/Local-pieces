/**
 * Mistake Training: the blunders and mistakes found in your analysed games come back as quick puzzles ("find a better move").
 * Each one is cleared after 2 correct answers (5 tokens). Saved in localStorage 'localPieces.mistakes':
 *   { items: { 'gameId#ply': { fen, best, ok[], played, r, vs, side, why, correct, miss } }, gone: { id: 1 }, streak: { last, n }, fixed }
 * LP.mistakes.open() shows the page. Reads games from LP.store and the analysis made by analyze.js (e.an.plies).
 */
(() => {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => (LP.esc ? LP.esc(String(t == null ? '' : t)) : String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const KEY = 'localPieces.mistakes';
  const BAD = { mistake: 'Mistake', blunder: 'Blunder', missedwin: 'Missed win', missedmate: 'Missed mate', throw: 'Threw away the win' };
  const MODES = { basic: 1, bullet: 1, rapid: 1 };   // modes whose positions a normal board can show
  const NEED = 2;          // correct answers to clear a mistake
  const TOKENS = 5;        // per cleared mistake
  const PER = 10;          // positions in one training round
  const GLYPH = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };
  const files = 'abcdefgh';

  /* ------------------------------------------------------------------ storage */
  let D = { items: {}, gone: {}, streak: { last: '', n: 0 }, fixed: 0 };
  try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.items) D = Object.assign(D, x); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* ignore */ } };
  const day = () => new Date().toISOString().slice(0, 10);
  const count = () => Object.keys(D.items).length;

  /* ------------------------------------------------------------------ finding mistakes in analysed games */
  const sqName = (s) => files[s & 7] + ((s >> 4) + 1);
  const uciOf = (m) => sqName(m.from) + sqName(m.to) + (m.promo ? 'nbrq'[m.promo - 2] || '' : '');
  const keyUci = (k) => sqName(k.f) + sqName(k.t) + (k.p ? 'nbrq'[k.p - 2] || '' : '');
  const humanOf = (e) => (e.human ? e.human : e.level ? 'w' : null);

  /** Looks through the saved games for new mistakes. Safe to call often: games already seen are skipped. */
  function scan() {
    let list = [];
    try { list = LP.store.get() || []; } catch (e) { return 0; }
    const AC = window.AnalyzeCore, Ch = window.Chess;
    let added = 0;
    list.forEach((e) => {
      if (!e || e.tas || e.kind === 'rush' || !MODES[e.mode] || e.vp || !e.an || !e.an.done || !e.an.plies || !e.moves) return;
      const h = humanOf(e);
      if (!h) return;
      const want = Object.keys(e.an.plies).map(Number).filter((i) => {
        const p = e.an.plies[i], id = e.id + '#' + i;
        return p && BAD[p.r] && p.b && i % 2 === (h === 'w' ? 0 : 1) && !D.items[id] && !D.gone[id];
      });
      if (!want.length || !AC || !Ch) return;
      try {
        const g = AC.startPosition({ mode: e.mode, vp: null, fen: e.fen || null, secrets: { w: -1, b: -1 }, moves: e.moves });
        const set = new Set(want);
        for (let i = 0; i < e.moves.length; i++) {
          if (set.has(i)) {
            const p = e.an.plies[i], fen = g.toFen();
            const best = keyUci(p.b), played = uciOf(e.moves[i]);
            const ok = [best];
            (p.top || []).forEach((t) => { try { if (t && t[0] && p.bs - t[1] <= 25) ok.push(keyUci(t[0])); } catch (x) { /* ignore */ } });
            if (best !== played) {
              D.items[e.id + '#' + i] = {
                fen, best, ok: Array.from(new Set(ok)).filter((u) => u !== played), played, r: p.r, side: h,
                vs: e.level ? (LP.LEVEL_LABEL && LP.LEVEL_LABEL[e.level]) || e.level : 'a friend', mv: Math.floor(i / 2) + 1,
                why: p.n && p.n.t ? String(p.n.t).slice(0, 260) : '', correct: 0, miss: 0, at: Date.now(),
              };
              added++;
            }
          }
          g.makeMove(e.moves[i]);
        }
      } catch (x) { /* a game that cannot be replayed is skipped */ }
    });
    const ks = Object.keys(D.items);
    if (ks.length > 80) ks.sort((a, b) => D.items[a].at - D.items[b].at).slice(0, ks.length - 80).forEach((k) => { delete D.items[k]; });
    if (added) save();
    return added;
  }

  /* ------------------------------------------------------------------ page */
  const page = () => $('#mistakes');
  const mascot = (m) => `<img class="mt-mascot" src="lp-mascot-${m}.png" alt="">`;
  function shell() {
    const p = page();
    if (!p || p.dataset.built) return p;
    p.dataset.built = '1';
    p.innerHTML = `<header class="game-header">
        <button id="mt-home" class="text-btn" type="button" aria-label="Back to the menu">&larr; Home</button><span class="pz-head"></span><span></span>
      </header><div class="mt-wrap" id="mt-view"></div>`;
    $('#mt-home').onclick = () => { LP.showPage('menu'); if (LP.menuPane) LP.menuPane('home'); };
    return p;
  }
  function open() {
    scan();
    LP.showPage('mistakes');
    shell();
    render();
  }
  function render() {
    const v = $('#mt-view'), n = count();
    const due = Object.values(D.items);
    const list = due.sort((a, b) => b.at - a.at).slice(0, 12).map((m) => `<div class="mt-row"><b>${esc(BAD[m.r])}</b><span>Move ${m.mv} vs ${esc(m.vs)}</span><i>${'●'.repeat(m.correct)}${'○'.repeat(NEED - m.correct)}</i></div>`).join('');
    v.innerHTML = `<div class="mt-hero">${mascot(n ? 'think' : 'happy')}<div><h2 class="ln-h">Mistake Training</h2>
        <p class="ln-sub">${n ? 'Fix the moves that cost you games. Get each one right twice to clear it.' : 'Nothing to fix right now.'}</p></div></div>
      <div class="mt-stats"><div><img src="lp-mistake.png" alt=""><b>${n}</b><span>to fix</span></div><div><img src="learn-badge-gold.png" alt=""><b>${D.fixed || 0}</b><span>cleared</span></div><div><img src="lp-streak.png" alt=""><b>${D.streak.n || 0}</b><span>day streak</span></div></div>
      ${n ? `<button class="btn primary wide" id="mt-go" type="button">Start training (${Math.min(PER, n)})</button><div class="mt-list">${list}</div>`
        : `<p class="mt-empty">Open <b>Review</b>, analyze a game you played against the computer, and your blunders and mistakes will appear here as puzzles.</p><button class="btn wide" id="mt-an" type="button">Go to Review</button>`}`;
    const go = $('#mt-go'); if (go) go.onclick = start;
    const an = $('#mt-an'); if (an) an.onclick = () => { LP.showPage('menu'); if (LP.menuPane) LP.menuPane('analysis'); };
  }

  /* ------------------------------------------------------------------ the training round */
  let root = null, g = null, S = null;
  function build() {
    root = document.createElement('div');
    root.id = 'mt-play'; root.className = 'lesson ln-player mt-player';
    root.innerHTML = `<div class="ls-top"><b id="mt-title">Fix your mistakes</b><span class="ls-dots" id="mt-dots"></span><button class="text-btn" id="mt-x" type="button" aria-label="Close">Close</button></div>
      <div class="ls-bw"><div class="ls-board"><div class="board" id="mt-board"></div><svg class="ls-arrows" id="mt-arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true"></svg><div class="mt-burst" id="mt-burst"><img src="lp-confetti.png" alt=""></div></div></div>
      <div class="ls-card mt-card"><div class="mt-say">${mascot('think')}<div><h3 id="mt-t"></h3><p id="mt-d"></p></div></div><div class="row" id="mt-btns"></div></div>`;
    (document.getElementById('app') || document.body).appendChild(root);
    $('#mt-x').onclick = close;
    $('#mt-board').addEventListener('click', (e) => { const q = e.target.closest('.square'); if (q && S && S.state === 'ask') onSquare(+q.dataset.i); });
  }
  function close() {
    if (root) root.classList.remove('on');
    document.body.classList.remove('ls-open');
    S = null;
    if (page() && page().classList.contains('active')) render();
  }
  const say = (t, d, m) => {
    $('#mt-t').textContent = t; $('#mt-d').textContent = d;
    const im = root.querySelector('.mt-mascot'); if (im && m) im.src = 'lp-mascot-' + m + '.png';
  };
  const btns = (list) => {
    const b = $('#mt-btns'); b.innerHTML = '';
    list.forEach((x) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'btn' + (x.p ? ' primary' : ''); el.textContent = x.t; el.onclick = x.f; b.appendChild(el); });
  };
  const dots = () => { $('#mt-dots').innerHTML = S.q.map((_, k) => `<i class="${k === S.i ? 'on' : k < S.i ? 'done' : ''}"></i>`).join(''); };

  function start() {
    scan();
    const ids = Object.keys(D.items).sort((a, b) => D.items[a].correct - D.items[b].correct || D.items[a].at - D.items[b].at);
    const q = ids.slice(0, PER).sort(() => Math.random() - 0.5);
    if (!q.length) return render();
    if (!root) build();
    S = { q, i: 0, got: 0, cleared: 0, state: 'ask', sel: -1, tries: 0 };
    LP.closeSheet && LP.closeSheet();
    root.classList.add('on');
    document.body.classList.add('ls-open');
    root.scrollTop = 0;
    ask();
  }

  const flip = () => !!(S && S.rec && S.rec.side === 'b');
  function draw(o) {
    o = o || {};
    const b = $('#mt-board'); b.innerHTML = '';
    const f2 = flip(), hl = new Set(o.hl || []), last = new Set(o.last || []);
    const dm = {}; (o.dests || []).forEach((m) => { dm[(m.to >> 4) * 8 + (m.to & 7)] = m; });
    let chk = -1;
    try { if (g.inCheck(g.turn)) { const k = g.kingSquare(g.turn); chk = (k >> 4) * 8 + (k & 7); } } catch (e) { /* ignore */ }
    for (let k = 0; k < 64; k++) {
      const r = f2 ? (k >> 3) : 7 - (k >> 3), f = f2 ? 7 - (k & 7) : k & 7, idx = r * 8 + f, p = g.board[f + r * 16];
      const el = document.createElement('div');
      el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark') + (hl.has(idx) ? ' ls-hl' : '') + (last.has(idx) ? ' ln-last' : '') + (idx === chk ? ' check' : '') + (dm[idx] ? ' legal ' + (dm[idx].cap ? 'capture' : 'x') : '') + (o.sel === idx ? ' ln-sel' : '');
      el.dataset.i = idx;
      if ((f2 ? r === 7 : r === 0)) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = files[f]; el.appendChild(c); }
      if ((f2 ? f === 7 : f === 0)) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = r + 1; el.appendChild(c); }
      if (p) { const s = document.createElement('span'); s.className = 'piece ' + ((p & 24) === 8 ? 'w' : 'b'); s.textContent = GLYPH[p & 7]; el.appendChild(s); }
      b.appendChild(el);
    }
  }
  const idxOfName = (n) => (+n[1] - 1) * 8 + files.indexOf(n[0]);
  function arrow(u, col) {
    const f2 = flip(), svg = $('#mt-arrows');
    if (!u) { svg.innerHTML = ''; return; }
    const P = (n) => { const i = idxOfName(n), f = i & 7, r = i >> 3; return [(f2 ? 7 - f : f) + 0.5, (f2 ? r : 7 - r) + 0.5]; };
    const [x1, y1] = P(u.slice(0, 2)), [x2, y2] = P(u.slice(2, 4));
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const ex = x2 - ux * 0.14, ey = y2 - uy * 0.14, bx = ex - ux * 0.42, by = ey - uy * 0.42, hw = 0.2;
    svg.innerHTML = `<g class="ls-arr"><line x1="${x1 + ux * 0.22}" y1="${y1 + uy * 0.22}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width=".17" stroke-linecap="round" opacity=".92"/><polygon points="${ex},${ey} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}" fill="${col}"/></g>`;
  }
  const legalFrom = (i) => g.legalMoves().filter((m) => (m.from >> 4) * 8 + (m.from & 7) === i);

  function ask() {
    const id = S.q[S.i], rec = D.items[id];
    if (!rec) { S.i++; return S.i >= S.q.length ? finish() : ask(); }
    S.id = id; S.rec = rec; S.state = 'ask'; S.sel = -1; S.tries = 0; S.hint = 0;
    if (!g) g = new window.Chess();
    g.reset(); g.loadFen(rec.fen);
    dots(); $('#mt-burst').classList.remove('on'); arrow(null);
    say('Find a better move', `${BAD[rec.r]} on move ${rec.mv} vs ${rec.vs}. You played ${rec.played.slice(0, 2)}–${rec.played.slice(2, 4)}. What should it have been?`, 'think');
    btns([{ t: 'Hint', f: hint }, { t: 'Skip', f: () => next(false) }]);
    draw({});
  }
  function hint() {
    if (!S || S.state !== 'ask') return;
    S.hint++;
    const from = idxOfName(S.rec.best.slice(0, 2));
    if (S.hint === 1) { draw({ hl: [from], sel: S.sel, dests: S.sel >= 0 ? legalFrom(S.sel) : [] }); say('Hint', 'Look at the highlighted piece.', 'think'); }
    else { arrow(S.rec.best, '#3fbf6a'); say('Hint', 'The green arrow shows the move.', 'think'); }
  }
  function onSquare(i) {
    if (S.sel >= 0) {
      const mv = legalFrom(S.sel).filter((m) => (m.to >> 4) * 8 + (m.to & 7) === i);
      if (mv.length) { return tryMove(mv.find((m) => m.promo === 5) || mv[0]); }
    }
    const own = legalFrom(i);
    if (own.length) { S.sel = i; draw({ sel: i, dests: own.map((m) => ({ to: m.to, cap: !!g.board[m.to] || m.flags === 2 })), hl: S.hint === 1 ? [idxOfName(S.rec.best.slice(0, 2))] : [] }); }
    else { S.sel = -1; draw({}); }
  }
  function tryMove(m) {
    const u = uciOf(m), rec = S.rec;
    g.makeMove(m);
    draw({ last: [(m.from >> 4) * 8 + (m.from & 7), (m.to >> 4) * 8 + (m.to & 7)] });
    if (rec.ok.includes(u)) return right();
    S.tries++;
    const b = $('#mt-board'); b.classList.remove('ln-shake'); void b.offsetWidth; b.classList.add('ln-shake');
    say('Not quite', S.tries >= 2 ? 'Still not the best. Press Show answer if you are stuck.' : 'That is not the move to look for. Try again.', 'sad');
    btns(S.tries >= 2 ? [{ t: 'Hint', f: hint }, { t: 'Show answer', f: reveal }] : [{ t: 'Hint', f: hint }]);
    setTimeout(() => { if (S && S.state === 'ask') { g.reset(); g.loadFen(rec.fen); S.sel = -1; draw({}); } }, 650);
  }
  function right() {
    const rec = S.rec;
    S.state = 'done'; S.got++;
    rec.correct++;
    let msg = 'Nice find!';
    if (rec.correct >= NEED) {
      delete D.items[S.id]; D.gone[S.id] = 1; D.fixed = (D.fixed || 0) + 1; S.cleared++;
      try { if (LP.rewards) LP.rewards.addTokens(TOKENS); } catch (e) { /* ignore */ }
      msg = 'Mistake cleared! +' + TOKENS + ' tokens';
    } else msg += ' Get it right once more later to clear it.';
    bumpStreak(); save();
    const bu = $('#mt-burst'); bu.classList.remove('on'); void bu.offsetWidth; bu.classList.add('on');
    say(msg, rec.why ? 'Why it matters: ' + rec.why : 'That was the move.', 'happy');
    btns([{ t: S.i + 1 >= S.q.length ? 'Finish' : 'Next', p: true, f: () => next(true) }]);
  }
  function reveal() {
    const rec = S.rec;
    S.state = 'done'; rec.miss++; rec.correct = 0; save();
    g.reset(); g.loadFen(rec.fen); draw({}); arrow(rec.best, '#3fbf6a');
    say('Here is the move', (rec.why ? rec.why + ' ' : '') + 'It will come back so you can try again.', 'think');
    btns([{ t: S.i + 1 >= S.q.length ? 'Finish' : 'Next', p: true, f: () => next(true) }]);
  }
  function next(solved) {
    if (!solved && S.rec) { S.rec.miss++; save(); }
    S.i++;
    if (S.i >= S.q.length) finish(); else ask();
  }
  function bumpStreak() {
    const t = day(), s = D.streak;
    if (s.last === t) return;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    s.n = s.last === y ? (s.n || 0) + 1 : 1; s.last = t;
  }
  function finish() {
    S.state = 'end'; arrow(null); dots();
    const left = count();
    say(S.got + ' of ' + S.q.length + ' found', S.cleared ? S.cleared + ' mistake' + (S.cleared === 1 ? '' : 's') + ' cleared. ' + (left ? left + ' left to fix.' : 'Nothing left to fix!') : left + ' left to fix.', S.got >= S.q.length / 2 ? 'happy' : 'think');
    btns([{ t: 'Done', p: true, f: close }].concat(left ? [{ t: 'Another round', f: start }] : []));
  }

  LP.mistakes = { open, scan, count };
  // keep the sidebar count fresh
  document.addEventListener('DOMContentLoaded', () => setTimeout(scan, 1500));
})();
