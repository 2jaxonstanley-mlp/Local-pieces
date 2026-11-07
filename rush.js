/**
 * Capture Rush: White has two of one piece type (queen, rook, bishop or knight) and 2 minutes 30 seconds
 * to capture as many Black pieces as it can. Captures score double points. Black starts with 1 piece and
 * grows (gains one every 2–3 Black turns, or immediately when a piece is taken while Black has ≤ 3).
 * Spawns never appear on occupied squares or in positions that attack White. Black can take White's piece
 * (it comes back, but that costs White its turn). The clock starts when White makes its first move.
 * There are no kings and no check in this mode.
 * Runs on its own page and board; it only borrows the sheet/page helpers from app.js (window.LP).
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  let TOTAL = 150000;
  const W = 'w', B = 'b';
  const IC = { p: 0, b: 1, q: 2, k: 3, n: 4, r: 5 };   // sprite cell of each piece in the pack sheets
  const GLYPH = { p: '♟︎', n: '♞︎', b: '♝︎', r: '♜︎', q: '♛︎' };
  // Points: every capture scores DOUBLE the captured piece's value. If White's own piece is taken, White loses points by its value (queen 9, rook 5, bishop 3, knight 3).
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const COST = { q: 9, r: 5, b: 3, n: 3 };
  const fmtPts = (n) => (n < 0 ? '\u2212' + Math.abs(n) : String(n));
  const PNAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const DG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const OR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const STARTS = { q: [3, 4], r: [0, 7], b: [2, 5], n: [1, 6] };   // White begins with two of its piece on the back rank
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);

  /* ------------------------------------------------------------------ rules */
  /** Squares the piece on `s` can move to. attackOnly: the squares it threatens (pawns: both diagonals). */
  function gen(cells, s, attackOnly) {
    const p = cells[s], f = s & 7, r = s >> 3, out = [];
    const slide = (dirs) => {
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const q = rr * 8 + ff, o = cells[q];
          if (!o) out.push(q);
          else { if (o.c !== p.c) out.push(q); break; }
          ff += df; rr += dr;
        }
      }
    };
    if (p.t === 'n') {
      for (const [df, dr] of KN) {
        const ff = f + df, rr = r + dr;
        if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        const q = rr * 8 + ff, o = cells[q];
        if (!o || o.c !== p.c) out.push(q);
      }
    } else if (p.t === 'b') slide(DG);
    else if (p.t === 'r') slide(OR);
    else if (p.t === 'q') { slide(DG); slide(OR); }
    else if (p.t === 'p') {                                   // Black pawns walk down the board
      const rr = r - 1;
      if (rr >= 0) {
        for (const df of [-1, 1]) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          const q = rr * 8 + ff;
          if (attackOnly || (cells[q] && cells[q].c === W)) out.push(q);
        }
        if (!attackOnly) {
          if (!cells[rr * 8 + f]) {
            out.push(rr * 8 + f);
            if (r === 6 && !cells[(r - 2) * 8 + f]) out.push((r - 2) * 8 + f);
          }
        }
      }
    }
    return out;
  }

  function whiteSquares(cells) { const o = []; for (let i = 0; i < 64; i++) if (cells[i] && cells[i].c === W) o.push(i); return o; }
  function blackSquares(cells) { const o = []; for (let i = 0; i < 64; i++) if (cells[i] && cells[i].c === B) o.push(i); return o; }
  function attackedByBlack(cells, s) { for (const b of blackSquares(cells)) if (gen(cells, b, true).includes(s)) return true; return false; }

  function allMoves(cells, side) {
    const out = [];
    for (let i = 0; i < 64; i++) if (cells[i] && cells[i].c === side) for (const t of gen(cells, i)) out.push({ from: i, to: t });
    return out;
  }

  /* ------------------------------------------------------------------ computer player */
  const LEVELS = {
    // aware: how well the bot understands that White's captures score double (1 = treats them like Black's, 2 = fully understands)
    dumb:   { depth: 1, worst: true, delay: 1100, aware: 1 },
    easy:   { depth: 1, blunder: 0.35, delay: 900, aware: 1.4 },
    medium: { depth: 2, blunder: 0.12, delay: 750, aware: 1.7 },
    hard:   { depth: 3, time: 300, delay: 650, aware: 2 },
    insane: { depth: 5, time: 450, delay: 600, aware: 2 },
    godly:  { depth: 7, time: 650, delay: 550, aware: 2 },
  };
  const INF = 1e9;
  const UNIT = 250;                                // evaluation units per point
  let abort = false, nodes = 0, until = 0;
  // AW = how many times a piece's value White scores for a capture (2 in the real rules; weaker bots use less than 2).
  // TEMPO = small bonus for capturing now rather than later (bots only; Analyze turns it off so scores are real points).
  let AW = 2, TEMPO = 150;
  const HIT = 150;
  /** Evaluation units White gains by capturing a piece of type t. */
  const capUnits = (t) => TEMPO + UNIT * AW * VALUE[t];
  /** Units for an attacked Black piece of value v (before it is actually taken). */
  const hitUnits = (v) => HIT + UNIT * AW * v;

  /** From White's point of view. `toMove` matters: Black can only save one attacked piece per turn. */
  function evalState(cells, toMove) {
    const wss = whiteSquares(cells);
    if (!wss.length) return 0;
    const bl = blackSquares(cells), wt = new Set();
    for (const w of wss) for (const x of gen(cells, w)) wt.add(x);
    let e = 0, hit = 0;
    const vals = [];
    for (const b of bl) {
      if (wt.has(b)) { hit++; vals.push(VALUE[cells[b].t]); }
      let d = 9;
      for (const w of wss) d = Math.min(d, Math.max(Math.abs((b & 7) - (w & 7)), Math.abs((b >> 3) - (w >> 3))));
      e -= 2 * d;
    }
    vals.sort((a, c) => c - a);
    // a capture is available right now / two attacked pieces: Black saves the best one, White takes the other
    // (hitUnits already applies the 2x White scoring)
    if (toMove === W) e += hit ? hitUnits(vals[0]) : 0;
    else e += hit >= 2 ? hitUnits(vals[1]) : hit === 1 ? hitUnits(vals[0]) * 0.15 : 0;
    // White pieces Black could take
    const threats = new Set();
    for (const b of bl) for (const x of gen(cells, b, true)) if (wss.includes(x)) threats.add(x);
    let danger = 0;
    for (const w of threats) danger += UNIT * COST[cells[w].t] * (toMove === B ? 1 : 0.35);
    return e - danger;
  }

  function ab(cells, side, depth, alpha, beta, acc) {
    if ((++nodes & 255) === 0 && performance.now() > until) abort = true;
    if (abort) return 0;
    if (depth === 0) return acc + evalState(cells, side);
    const moves = allMoves(cells, side);
    if (!moves.length) return ab(cells, side === W ? B : W, depth - 1, alpha, beta, acc);
    moves.sort((a, b) => (cells[b.to] ? 1 : 0) - (cells[a.to] ? 1 : 0));
    let best = side === W ? -INF : INF;
    for (const m of moves) {
      const mover = cells[m.from], cap = cells[m.to];
      cells[m.to] = mover; cells[m.from] = null;
      let add = 0, terminal = false;
      if (side === W && cap) add = capUnits(cap.t);   // double points
      if (side === B && cap) { add = -UNIT * COST[cap.t]; terminal = true; }
      if (side === B && mover.t === 'p' && (m.to >> 3) === 0) cells[m.to] = { c: B, t: 'q' };
      const v = terminal ? acc + add : ab(cells, side === W ? B : W, depth - 1, alpha, beta, acc + add);
      cells[m.from] = mover; cells[m.to] = cap;
      if (abort) return 0;
      if (side === W) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else { if (v < best) best = v; if (best < beta) beta = best; }
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Best move for `side` at the given level (or null). */
  function think(cells, side, level) {
    const cfg = LEVELS[level] || LEVELS.medium;
    const moves = allMoves(cells, side);
    if (!moves.length) return null;
    if (cfg.blunder && Math.random() < cfg.blunder) return pick(moves);
    const work = cells.map((c) => (c ? { c: c.c, t: c.t } : null));
    const sign = side === W ? 1 : -1;
    let scores = null;
    const t0 = performance.now();
    until = t0 + (cfg.time || 5000);
    AW = cfg.aware || 2; TEMPO = 150;   // how well this bot knows White's captures score double
    for (let d = 1; d <= cfg.depth; d++) {
      abort = false; nodes = 0;
      const cur = [];
      for (const m of moves) {
        const mover = work[m.from], cap = work[m.to];
        work[m.to] = mover; work[m.from] = null;
        let add = 0, terminal = false;
        if (side === W && cap) add = capUnits(cap.t);
        if (side === B && cap) { add = -UNIT * COST[cap.t]; terminal = true; }
        if (side === B && mover.t === 'p' && (m.to >> 3) === 0) work[m.to] = { c: B, t: 'q' };
        const v = terminal ? add : ab(work, side === W ? B : W, d - 1, -INF, INF, add);
        work[m.from] = mover; work[m.to] = cap;
        if (abort) break;
        cur.push(v * sign);
      }
      if (abort || cur.length < moves.length) break;
      scores = cur;
      if (cfg.worst) break;
    }
    if (!scores) return pick(moves);
    // pick at random among the moves that are about as good as the best, so two computers never get stuck repeating
    const val = scores.map((v) => (cfg.worst ? -v : v));
    const top = Math.max(...val);
    const near = [];
    val.forEach((v, i) => { if (v >= top - 25) near.push(i); });
    const bestI = pick(near);
    return moves[bestI];
  }

  /** Every move of `side` scored by a search (points of advantage for that side, bigger is better). Used by Analyze. */
  function rank(cells, side, depth, ms) {
    const moves = allMoves(cells, side);
    const work = cells.map((c) => (c ? { c: c.c, t: c.t } : null));
    const sign = side === W ? 1 : -1;
    let scores = null;
    until = performance.now() + (ms || 600);
    AW = 2; TEMPO = 0;   // Analyze uses the real rules: White's captures score double, no bot bonuses
    for (let d = 1; d <= depth; d++) {
      abort = false; nodes = 0;
      const cur = [];
      for (const m of moves) {
        const mover = work[m.from], cap = work[m.to];
        work[m.to] = mover; work[m.from] = null;
        let add = 0, terminal = false;
        if (side === W && cap) add = capUnits(cap.t);
        if (side === B && cap) { add = -UNIT * COST[cap.t]; terminal = true; }
        if (side === B && mover.t === 'p' && (m.to >> 3) === 0) work[m.to] = { c: B, t: 'q' };
        const v = terminal ? add : ab(work, side === W ? B : W, d - 1, -INF, INF, add);
        work[m.from] = mover; work[m.to] = cap;
        if (abort) break;
        cur.push(v * sign);
      }
      if (abort || cur.length < moves.length) break;
      scores = cur;
    }
    TEMPO = 150;
    if (!scores) scores = moves.map((m) => (cells[m.to] ? 1 : 0));
    return moves.map((m, i) => ({ from: m.from, to: m.to, score: scores[i] / UNIT })).sort((a, b) => b.score - a.score);
  }

  /* ------------------------------------------------------------------ game state */
  let cfg = null;        // { players, level, human, names {w,b}, piece, hints }
  let g = null;          // the running round
  let els = {};
  let flipped = false;
  let timerId = null;
  let aiTimer = null;
  let toastTimer = null;
  let token = 0;

  const bestStore = {
    get() { try { return JSON.parse(localStorage.getItem('localPieces.rushBestPts')) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem('localPieces.rushBestPts', JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  const isAI = (side) => cfg.players === 0 || (cfg.players === 1 && cfg.human !== side);
  const levelOf = (side) => (cfg.players === 0 ? cfg.levels[side] : cfg.level);
  const nameOf = (side) => cfg.names[side];

  /** Which bar a side sits in: the side the board is turned toward is at the bottom. */
  const barOf = (side) => ((side === W) !== flipped ? 'bottom' : 'top');

  function emptySquares(cells) { const o = []; for (let i = 0; i < 64; i++) if (!cells[i]) o.push(i); return o; }

  function spawnBlack(cells) {
    const t = pick(['p', 'p', 'p', 'n', 'n', 'b', 'b', 'r', 'r', 'q']);
    const wss = whiteSquares(cells);
    const atk = new Set();
    for (const w of wss) for (const x of gen(cells, w)) atk.add(x);
    const ok = [];
    for (const q of emptySquares(cells)) {
      const rank = q >> 3;
      if (rank < (t === 'p' ? 2 : 1) || (t === 'p' && rank > 6)) continue;
      if (atk.has(q)) continue;
      cells[q] = { c: B, t };
      const hitsWhite = gen(cells, q, true).some((x) => wss.includes(x));
      cells[q] = null;
      if (!hitsWhite) ok.push(q);
    }
    const spots = ok.length ? ok : emptySquares(cells).filter((q) => !atk.has(q));
    if (!spots.length) return -1;
    const q = pick(spots);
    cells[q] = { c: B, t };
    return q;
  }

  function respawnWhite(cells) {
    let spots = emptySquares(cells).filter((q) => q < 16 && !attackedByBlack(cells, q));
    if (!spots.length) spots = emptySquares(cells).filter((q) => !attackedByBlack(cells, q));
    if (!spots.length) spots = emptySquares(cells);
    const q = pick(spots);
    cells[q] = { c: W, t: g.piece };
    return q;
  }

  function newRound() {
    token++;
    LP.session.fresh();
    clearInterval(timerId); clearTimeout(aiTimer);
    const cells = new Array(64).fill(null);
    g = { cells, piece: cfg.piece, turn: W, score: 0, taken: 0, caps: [], t0: 0, ended: false, selected: -1, targets: [], last: null, ai: false, bTurns: 0, nextGrowth: 2 + rnd(2) };
    STARTS[g.piece].forEach((s) => { cells[s] = { c: W, t: g.piece }; });
    spawnBlack(cells);   // Black starts with only 1 piece
    g.init = cells.map((c, i) => (c ? { sq: i, c: c.c, t: c.t } : null)).filter(Boolean);
    g.log = [];
    flipped = cfg.players === 1 && cfg.human === B;
    buildBoard();
    for (const side of [W, B]) {
      const bar = barOf(side);
      $('#rush-' + bar + '-name').textContent = nameOf(side);
      $('#rush-' + bar).querySelector('.dot').className = 'dot ' + side;
    }
    render();
    updateHud();
    LP.closeSheet();
    LP.showPage('rush');
    setStatus();
    scheduleAI();
  }

  /* ------------------------------------------------------------------ board UI */
  function buildBoard() {
    const boardEl = $('#rush-board');
    boardEl.innerHTML = '';
    els = {};
    const order = [];
    for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) order.push(r * 8 + f);
    if (flipped) order.reverse();
    order.forEach((s, i) => {
      const f = s & 7, r = s >> 3;
      const el = document.createElement('div');
      el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark');
      el.dataset.sq = s;
      if (Math.floor(i / 8) === 7) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = 'abcdefgh'[f]; el.appendChild(c); }
      if (i % 8 === 0) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = r + 1; el.appendChild(c); }
      boardEl.appendChild(el);
      els[s] = el;
    });
  }

  function render(popSq) {
    const pops = Array.isArray(popSq) ? popSq : [popSq];
    const legal = new Set(cfg.hints ? g.targets : []);
    for (let s = 0; s < 64; s++) {
      const el = els[s], p = g.cells[s];
      el.classList.toggle('selected', s === g.selected);
      el.classList.toggle('last', !!g.last && (g.last[0] === s || g.last[1] === s));
      el.classList.toggle('legal', legal.has(s));
      el.classList.toggle('capture', legal.has(s) && !!p);
      const code = p ? p.c + p.t : '';
      if (!p) { if (el._piece) { el._piece.remove(); el._piece = null; el._code = ''; } }
      else if (el._code !== code) {
        let pe = el._piece;
        if (!pe) { pe = document.createElement('span'); el.appendChild(pe); el._piece = pe; }
        pe.className = 'piece ' + p.c;
        pe.textContent = GLYPH[p.t];
        el._code = code;
        if (pops.includes(s)) { pe.classList.add('spawn'); pe.addEventListener('animationend', () => pe.classList.remove('spawn'), { once: true }); }
      }
    }
    $('#rush-' + barOf(B)).classList.toggle('active', !g.ended && g.turn === B);
    $('#rush-' + barOf(W)).classList.toggle('active', !g.ended && g.turn === W);
  }

  function slide(src, dst) {
    const de = els[dst], se = els[src];
    if (!de || !se) return;
    const pe = de._piece;
    if (!pe) return;
    // Clear any leftover transform / transition so the starting offset is applied cleanly every time
    pe.style.transition = 'none';
    pe.style.transform = '';
    void pe.offsetWidth;
    const a = se.getBoundingClientRect(), b = de.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    pe.style.transform = `translate(${dx}px, ${dy}px)`;
    de.style.zIndex = 6;
    void pe.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pe.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)';
        pe.style.transform = '';
        setTimeout(() => {
          pe.style.transition = '';
          de.style.zIndex = '';
        }, 280);
      });
    });
  }

  /** A copy of a piece that shrinks away on `sq` (a captured piece), optionally sliding there first from `from`. */
  function ghost(sq, p, from) {
    const el = els[sq];
    if (!el || !p) return;
    const gh = document.createElement('div');
    gh.className = 'ghost';
    const pe = document.createElement('span');
    pe.className = 'piece ' + p.c;
    pe.textContent = GLYPH[p.t];
    gh.appendChild(pe);
    el.appendChild(gh);
    if (from !== undefined && els[from]) {
      const a = els[from].getBoundingClientRect(), b = el.getBoundingClientRect();
      pe.style.transition = 'none';
      pe.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
      void pe.offsetWidth;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pe.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)';
          pe.style.transform = '';
          setTimeout(() => gh.classList.add('out'), 220);
        });
      });
    } else {
      gh.classList.add('out');
    }
    setTimeout(() => gh.remove(), 700);
  }

  function setStatus(text, cls) {
    const el = $('#rush-status');
    el.className = 'status' + (cls ? ' ' + cls : '');
    if (text === undefined) {
      if (!g || g.ended) text = '';
      else if (!g.t0 && g.turn === W) text = isAI(W) ? nameOf(W) + ' is about to move' : nameOf(W) + ': make a move to start the clock';
      else text = nameOf(g.turn) + "'s move";
    }
    el.textContent = text || ' ';
  }

  function toast(text) {
    const t = $('#rush-toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  const fmtTime = (ms) => {
    if (ms <= 0) return '0:00';
    if (ms < 10000) return (ms / 1000).toFixed(1);
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  /** White's time used so far: the clock only runs while it is White's turn. */
  function elapsed() { return (g.used || 0) + (g.runStart ? performance.now() - g.runStart : 0); }
  function syncClock() {
    if (!g.t0) return;
    const now = performance.now();
    if (g.turn === W && !g.runStart) g.runStart = now;
    else if (g.turn !== W && g.runStart) { g.used = (g.used || 0) + (now - g.runStart); g.runStart = 0; }
  }
  function remaining() { if (g.fixedRem !== undefined) return g.fixedRem; return g.t0 ? Math.max(0, TOTAL - elapsed()) : TOTAL; }

  function updateHud() {
    const rem = remaining();
    const t = $('#rush-time');
    t.textContent = fmtTime(rem);
    t.classList.toggle('low', g.t0 > 0 && rem < 10000);
    $('#rush-fill').style.width = (rem / TOTAL * 100) + '%';
    $('#rush-score').textContent = fmtPts(g.score);
    $('#rush-score-label').textContent = Math.abs(g.score) === 1 ? 'point' : 'points';
    const box = $('#rush-' + barOf(W) + '-captured');
    box.innerHTML = '';
    g.caps.forEach((t2) => { const sp = document.createElement('span'); sp.className = 'cp b'; sp.textContent = GLYPH[t2]; box.appendChild(sp); });
    $('#rush-' + barOf(B) + '-captured').textContent = g.taken ? 'took White ×' + g.taken : '';
  }

  function tickClock() {
    if (!g || g.ended) return;
    updateHud();
    if (remaining() <= 0) endRound();
  }

  /* ------------------------------------------------------------------ moves */
  function onSquare(s) {
    if (!g || g.ended || g.ai || isAI(g.turn)) return;
    const p = g.cells[s];
    if (g.selected >= 0) {
      if (g.targets.includes(s)) { play(g.selected, s); return; }
      if (s === g.selected) { g.selected = -1; g.targets = []; render(); return; }
    }
    if (p && p.c === g.turn) {
      g.selected = s;
      g.targets = gen(g.cells, s);
      render();
    } else if (g.selected >= 0) { g.selected = -1; g.targets = []; render(); }
  }

  /** Rules for one move; returns what the UI needs to animate. */
  function applyMove(from, to, promo) {
    const cells = g.cells, mover = cells[from], cap = cells[to];
    const side = mover.c;
    cells[to] = mover; cells[from] = null;
    g.last = [from, to];
    let popSq = -1, slideTo = to, msg = '', walkOff = false;
    const ev = { f: from, t: to, at: g.t0 ? Math.round(elapsed()) : 0 };
    let nextTurn = side === W ? B : W;
    if (side === W && cap) {
      // Double points for White captures
      g.score += VALUE[cap.t] * 2;
      if (cfg.players !== 0 && LP.rewards) LP.rewards.event('capture', 1);
      g.caps.push(cap.t);
      // Only respawn if Black is at or under 3 pieces after the capture
      if (blackSquares(cells).length <= 3) {
        popSq = spawnBlack(cells);
        if (popSq >= 0) ev.sp = [popSq, cells[popSq].t];
      }
      msg = nameOf(W) + ' captured a ' + { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }[cap.t];
    } else if (side === B && cap) {
      g.taken++;
      g.score -= COST[g.piece];   // White's piece was taken
      popSq = respawnWhite(cells);
      ev.rw = popSq;
      msg = nameOf(B) + ' took ' + nameOf(W) + "'s piece. It respawns";
    }
    let promoSq = -1;
    if (side === B && mover.t === 'p' && (to >> 3) === 0) {   // a Black pawn reached the far side: it promotes
      const pt = promo || 'q';
      cells[to] = { c: B, t: pt };
      ev.pr = pt;
      promoSq = to;
      msg = (msg ? msg + '. ' : '') + nameOf(B) + ' promoted a pawn to a ' + PNAME[pt].toLowerCase();
    }
    if (nextTurn === B && !allMoves(cells, B).length) nextTurn = W;
    g.turn = nextTurn;
    if (g.log) g.log.push(ev);
    return { popSq, promoSq, slideTo, msg, walkOff, mover: { c: mover.c, t: mover.t }, cap: cap ? { c: cap.c, t: cap.t } : null };
  }

  function play(from, to, promo) {
    if (g.ended) return;
    const side = g.cells[from].c;
    if (side === B && g.cells[from].t === 'p' && (to >> 3) === 0 && !promo) {
      if (!isAI(B)) { askPromotion(from, to); return; }
      promo = levelOf(B) === 'dumb' ? pick(['q', 'r', 'b', 'n']) : 'q';
    }
    g.selected = -1; g.targets = [];
    if (side === W && !g.t0) { g.t0 = g.runStart = performance.now(); g.used = 0; clearInterval(timerId); timerId = setInterval(tickClock, 100); }
    const res = applyMove(from, to, promo);
    syncClock();

    // After a Black move, grow Black's army every 2–3 turns (while under 4 pieces)
    let growthSq = -1;
    if (side === B) {
      g.bTurns = (g.bTurns || 0) + 1;
      if (g.bTurns >= (g.nextGrowth || 2) && blackSquares(g.cells).length < 4) {
        growthSq = spawnBlack(g.cells);
        if (growthSq >= 0) {
          // Record the extra spawn on the last event so replays stay accurate
          if (g.log && g.log.length) {
            const lastEv = g.log[g.log.length - 1];
            lastEv.sp = [growthSq, g.cells[growthSq].t];
            lastEv.grow = 1;
          }
          g.bTurns = 0;
          g.nextGrowth = 2 + rnd(2);
        }
      }
    }

    render([res.popSq, growthSq, res.promoSq]);
    if (res.slideTo >= 0) slide(from, res.slideTo);
    if (res.cap && res.cap.c !== res.mover.c) ghost(to, res.cap);                 // the captured piece shrinks away
    updateHud();
    saveRush();
    if (res.msg) toast(res.msg);
    else if (growthSq >= 0) toast(nameOf(B) + ' gains a piece');
    setStatus();
    scheduleAI();
  }

  function askPromotion(from, to) {
    g.selected = -1; g.targets = []; render();
    LP.openSheet(`<h2>Promote your pawn<span class="sub">Choose what it becomes.</span></h2>
      <div class="rush-pieces">
        ${['q', 'r', 'b', 'n'].map((t) => `<button class="btn big" data-promo="${t}"><span class="rp-g"><i class="ic-sp" style="--i:${IC[t]}"></i></span>${PNAME[t]}</button>`).join('')}
      </div>`);
    document.querySelectorAll('[data-promo]').forEach((b) => { b.onclick = () => { LP.closeSheet(); if (g && !g.ended) play(from, to, b.dataset.promo); }; });
  }

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (!g || g.ended || !isAI(g.turn)) return;
    const my = token, side = g.turn, level = levelOf(side), lv = LEVELS[level] || LEVELS.medium;
    g.ai = true;
    setStatus('Thinking...', 'dim');
    aiTimer = setTimeout(() => {
      if (my !== token || g.ended) return;
      const m = think(g.cells, side, level);
      g.ai = false;
      if (m) play(m.from, m.to);
    }, lv.delay + Math.random() * 250);
  }

  /* ------------------------------------------------------------------ end of round */
  function endRound() {
    if (g.ended) return;
    g.ended = true;
    g.selected = -1; g.targets = [];
    clearInterval(timerId); clearTimeout(aiTimer);
    clearRush();
    updateHud(); render(); setStatus('Time is up');
    g.lb = recordScore();
    try {
      g.hist = buildReplay();
      if (LP.history && g.log.length) LP.history.add({ kind: 'rush', id: g.hist.id, mode: 'rush', modeLabel: 'Capture Rush', names: g.hist.names, level: g.hist.level, bots: cfg.players === 0, human: g.hist.human, result: g.score + (Math.abs(g.score) === 1 ? ' point' : ' points'), winner: null, dur: Math.round(TOTAL / 1000), moves: g.log.length, timed: true, score: g.score, payload: g.hist });
    } catch (e) { /* history is best effort */ }
    if (cfg.players !== 0 && LP.rewards) LP.rewards.event('rush', { score: g.score, piece: g.piece, level: cfg.players === 1 ? cfg.level : 'pvp', players: cfg.players, caps: g.caps.length, taken: g.taken });
    const my = token;
    setTimeout(() => {
      if (my !== token) return;
      if (g.lb && g.lb.isBest) LP.board.askName(g.lb.entry, () => showOver(), 'Your score is the best so far. Choose the name for the leaderboard.');
      else showOver();
    }, 500);
  }

  /** Put the round on the leaderboard (only when a person played White). */
  function recordScore() {
    if (!LP.board || cfg.players === 0 || (cfg.players === 1 && cfg.human !== W)) return null;
    const solo = cfg.players === 1;
    const opp = solo ? 'Computer (' + LP.LEVEL_LABEL[cfg.level] + ')' : cfg.names.b;
    const r = LP.board.record({
      cat: 'rush', key: 'rush:' + g.piece + ':' + (solo ? cfg.level : 'pvp'),
      group: PNAME[g.piece] + ' · ' + (solo ? LP.LEVEL_LABEL[cfg.level] : '2 players'),
      name: cfg.names.w, vs: opp, value: g.score, unit: 'pts', low: false,
    });
    return r;
  }

  function lbLine() {
    const l = g.lb;
    if (!l) return '';
    const pn = PNAME[g.piece].toLowerCase();
    if (l.isBest) return 'New best with the ' + pn + '!';
    const parts = [];
    if (l.rank) parts.push('#' + l.rank + ' on the leaderboard');
    if (l.prev !== undefined) parts.push('best ' + fmtPts(l.prev));
    return parts.join(' · ');
  }

  function showOver() {
    const saved = g.saved;
    const lost = g.taken * COST[g.piece], got = g.score + lost;
    LP.openSheet(`<h2>Time is up<span class="sub">${esc(nameOf(W))} scored ${fmtPts(g.score)} point${Math.abs(g.score) === 1 ? '' : 's'}</span></h2>
      <p class="rush-note">${g.caps.length} piece${g.caps.length === 1 ? '' : 's'} captured for ${got} points${g.taken ? ', minus ' + lost + ' for losing the ' + PNAME[g.piece].toLowerCase() + ' ' + g.taken + (g.taken === 1 ? ' time' : ' times') : ''}.${lbLine() ? '<br>' + esc(lbLine()) : ''}</p>
      <button class="btn primary wide" id="rs-analyze">Analyze game</button>
      <div class="row">${cfg.players === 0 ? '' : '<button class="btn" id="rs-swap">Swap sides</button>'}<button class="btn primary" id="rs-again">Play again</button></div>
      <button class="btn wide" id="rs-menu">Menu</button>`);
    $('#rs-again').onclick = () => newRound();
    if (cfg.players !== 0) $('#rs-swap').onclick = swapSides;
    $('#rs-menu').onclick = toMenu;
    $('#rs-analyze').onclick = () => {
      const d = g.hist || buildReplay();
      const list = LP.store.get();
      list.unshift(d);
      LP.store.set(list.slice(0, 40));
      g.saved = true;
      LP.closeSheet();
      if (LP.analyze) LP.analyze.begin(d.id);
    };
  }

  function buildReplay() {
    return {
      v: 1, kind: 'rush', id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: Date.now(),
      piece: g.piece, names: { w: cfg.names.w, b: cfg.names.b }, players: cfg.players,
      score: g.score, pts: 1, captures: g.caps.length, taken: g.taken, init: g.init, events: g.log, total: TOTAL,
      moves: g.log,   // lets the saved-replays list count them like any other game
      human: cfg.players === 1 ? cfg.human : null, level: cfg.players === 1 ? cfg.level : null,
    };
  }

  /* ------------------------------------------------------------------ continue later */
  function saveRush() {
    if (!g || !cfg || g.ended || !g.t0 || rp) return;
    LP.session.set({
      kind: 'rush', cfg, date: Date.now(),
      g: { cells: g.cells, piece: g.piece, turn: g.turn, score: g.score, taken: g.taken, caps: g.caps, used: Math.round(elapsed()), last: g.last, bTurns: g.bTurns, nextGrowth: g.nextGrowth, init: g.init, log: g.log },
    });
  }
  function clearRush() { LP.session.clear(); }

  function resume(d) {
    token++;
    LP.session.use(d.id);
    clearInterval(timerId); clearTimeout(aiTimer);
    rp = null;
    exitReplayUI();
    cfg = d.cfg;
    const now = performance.now();
    g = { cells: d.g.cells, piece: d.g.piece, turn: d.g.turn, score: d.g.score, taken: d.g.taken, caps: d.g.caps, t0: now, ended: false, selected: -1, targets: [], last: d.g.last, ai: false, bTurns: d.g.bTurns, nextGrowth: d.g.nextGrowth, init: d.g.init, log: d.g.log, used: d.g.used, runStart: d.g.turn === W ? now : 0 };
    timerId = setInterval(tickClock, 100);
    flipped = cfg.players === 1 && cfg.human === B;
    buildBoard();
    for (const side of [W, B]) {
      const bar = barOf(side);
      $('#rush-' + bar + '-name').textContent = nameOf(side);
      $('#rush-' + bar).querySelector('.dot').className = 'dot ' + side;
    }
    render();
    updateHud();
    LP.closeSheet();
    LP.showPage('rush');
    setStatus();
    scheduleAI();
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) saveRush(); });
  window.addEventListener('pagehide', saveRush);

  function toMenu() {
    saveRush();
    token++; clearInterval(timerId); clearTimeout(aiTimer);
    if (g) g.ended = true;
    LP.closeSheet();
    exitReplayUI();
    LP.renderSavedList();
    LP.showPage('menu');
  }

  /* ------------------------------------------------------------------ replay viewer */
  let rp = null;   // { data, frames, idx, playing, speed, timer, from, keep: { g, cfg } }

  function framesOf(d) {
    const cells = new Array(64).fill(null);
    d.init.forEach((p) => { cells[p.sq] = { c: p.c, t: p.t }; });
    let score = 0, taken = 0;
    const caps = [];
    const snap = (last, at) => ({ cells: cells.map((c) => (c ? { c: c.c, t: c.t } : null)), score, taken, caps: caps.slice(), last, at });
    const frames = [snap(null, 0)];
    for (const e of d.events) {
      const mover = cells[e.f], cap = cells[e.t];
      cells[e.t] = mover; cells[e.f] = null;
      if (mover.c === W && cap) { score += VALUE[cap.t] * 2; caps.push(cap.t); }  // double points
      if (mover.c === B && cap) { taken++; score -= COST[d.piece]; }
      if (e.rm) cells[e.t] = null;
      if (e.pr) cells[e.t] = { c: B, t: e.pr };
      if (e.rw !== undefined) cells[e.rw] = { c: W, t: d.piece };
      if (e.sp) cells[e.sp[0]] = { c: B, t: e.sp[1] };
      frames.push(snap([e.f, e.t], e.at));
    }
    return frames;
  }

  function watch(d, from) {
    clearInterval(timerId); clearTimeout(aiTimer); token++;
    if (rp && rp.timer) clearInterval(rp.timer);
    const keep = rp ? rp.keep : { g, cfg };
    cfg = { players: 2, names: d.names, hints: false, piece: d.piece };
    g = { cells: [], piece: d.piece, ended: true, selected: -1, targets: [], turn: W, caps: [], score: 0, taken: 0, t0: 0, fixedRem: TOTAL };
    rp = { data: d, frames: framesOf(d), idx: 0, playing: false, speed: 1, timer: null, from, keep, t: 0, total: d.total || TOTAL };
    flipped = false;
    buildBoard();
    for (const side of [W, B]) {
      const bar = barOf(side);
      $('#rush-' + bar + '-name').textContent = d.names[side];
      $('#rush-' + bar).querySelector('.dot').className = 'dot ' + side;
    }
    document.querySelector('#rush .controls').classList.add('hidden');
    $('#rush-replay').classList.remove('hidden');
    $('#rush-scrub').max = rp.total;      // the timeline runs in real time: the scrubber is the round clock
    $('#rush-scrub').step = 50;
    $('#rr-speed').textContent = '1x';
    LP.showPage('rush');
    showFrame(0, false);
  }

  function showFrame(i, animate, keepT) {
    const prev = rp.idx;
    rp.idx = Math.max(0, Math.min(rp.frames.length - 1, i));
    const f = rp.frames[rp.idx];
    if (!keepT) rp.t = f.at;
    g.cells = f.cells; g.score = f.score; g.taken = f.taken; g.caps = f.caps; g.last = f.last;
    g.fixedRem = Math.max(0, rp.total - rp.t);
    render();
    updateHud();
    $('#rush-scrub').value = rp.t;
    setStatus(rp.idx ? 'Move ' + rp.idx + ' of ' + (rp.frames.length - 1) : 'Start position', 'dim');
    $('#rr-play').textContent = rp.playing ? 'Pause' : 'Play';
    if (animate && f.last && rp.idx === prev + 1) {
      const was = rp.frames[prev].cells[f.last[1]];
      slide(f.last[0], f.last[1]);
      if (was && f.cells[f.last[1]] && was.c !== f.cells[f.last[1]].c) ghost(f.last[1], was);
      else if (!f.cells[f.last[1]] && rp.frames[prev].cells[f.last[0]]) ghost(f.last[1], rp.frames[prev].cells[f.last[0]], f.last[0]);
    }
  }

  function rpStop() { rp.playing = false; clearInterval(rp.timer); rp.timer = null; $('#rr-play').textContent = 'Play'; }
  /** Jump to a moment of the round: shows the board as it was then and runs the clock to that time. */
  function rpSeek(t, animate) {
    t = Math.max(0, Math.min(rp.total, t));
    let k = 0;
    while (k + 1 < rp.frames.length && rp.frames[k + 1].at <= t) k++;
    rp.t = t;
    showFrame(k, animate && k === rp.idx + 1, true);
  }
  function rpPlay() {
    if (rp.t >= rp.total - 1) rpSeek(0, false);
    rp.playing = true;
    $('#rr-play').textContent = 'Pause';
    clearInterval(rp.timer);
    rp.timer = setInterval(() => {
      if (rp.t >= rp.total) { rpStop(); return; }
      rpSeek(rp.t + 50 * rp.speed, true);
    }, 50);
  }

  function exitReplayUI() {
    if (rp) { clearInterval(rp.timer); }
    document.querySelector('#rush .controls').classList.remove('hidden');
    $('#rush-replay').classList.add('hidden');
  }

  function closeReplay() {
    const r2 = rp;
    exitReplayUI();
    rp = null;
    if (r2.from === 'over' && r2.keep.g) {
      g = r2.keep.g; cfg = r2.keep.cfg;
      flipped = cfg.players === 1 && cfg.human === B;
      buildBoard();
      for (const side of [W, B]) {
        const bar = barOf(side);
        $('#rush-' + bar + '-name').textContent = nameOf(side);
        $('#rush-' + bar).querySelector('.dot').className = 'dot ' + side;
      }
      render(); updateHud(); setStatus('Time is up');
      showOver();
    } else if (r2.from === 'history' && LP.history) {
      token++; clearInterval(timerId); clearTimeout(aiTimer);
      if (g) g.ended = true;
      LP.closeSheet();
      LP.history.show();
    } else toMenu();
  }

  /* ------------------------------------------------------------------ setup flow */
  function askYN(question, sub, cb) {
    LP.openSheet(`<h2>${esc(question)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h2>
      <div class="row"><button class="btn" id="yn-n">No</button><button class="btn primary" id="yn-y">Yes</button></div>`);
    const done = (v) => { document.removeEventListener('keydown', kd); cb(v); };
    const kd = (e) => { const k = e.key.toLowerCase(); if (k === 'y') done(true); else if (k === 'n') done(false); };
    document.addEventListener('keydown', kd);
    $('#yn-y').onclick = () => done(true);
    $('#yn-n').onclick = () => done(false);
  }

  function askName(label, placeholder, next) {
    LP.openSheet(`<h2>${esc(label)}</h2>
      <input id="name-in" type="text" maxlength="16" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="words" enterkeyhint="next">
      <div class="row"><button class="btn" id="n-cancel">Cancel</button><button class="btn primary" id="n-ok">Next</button></div>`);
    const inp = $('#name-in');
    const ok = () => next(inp.value.trim() || placeholder);
    $('#n-ok').onclick = ok;
    $('#n-cancel').onclick = toMenu;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  /** One-player name: the profile name when there is one, otherwise ask once and keep it. */
  function askSolo(cb) {
    const mine = LP.profile && LP.profile.name();
    if (mine) { cb(mine); return; }
    askName('What is your name?', 'Player', (nm) => { if (LP.profile) LP.profile.setName(nm); cb(nm); });
  }

  function askPiece(who, cb) {
    LP.openSheet(`<h2>${esc(who)}, choose your piece<span class="sub">Pick the piece you will play with.</span></h2>
      <div class="rush-pieces">
        ${['q', 'r', 'b', 'n'].map((t) => `<button class="btn big" data-pc="${t}"><span class="rp-g"><i class="ic-sp" style="--i:${IC[t]}"></i></span>${PNAME[t]}<span class="rp-c">loses ${COST[t]} if taken</span></button>`).join('')}
      </div>`);
    document.querySelectorAll('[data-pc]').forEach((b) => { b.onclick = () => cb(b.dataset.pc); });
  }

  function askLevel(cb, title) { LP.levelMenu(title || 'Choose difficulty', '', cb); }

  function finishSetup() {
    askYN('Show legal move hints?', 'Show where each piece can move.', (h) => { cfg.hints = h; newRound(); });
  }

  function start() {
    LP.openSheet(`<h2>How many players?</h2>
      <div class="stack">
        <button class="btn big" id="pl-0">0 players</button>
        <button class="btn big" id="pl-1">1 player</button>
        <button class="btn big" id="pl-2">2 players</button>
        <button class="btn" id="pl-x">Cancel</button>
      </div>`, true);
    $('#pl-x').onclick = LP.closeSheet;
    $('#pl-0').onclick = () => {   // two computers: pick a level for each, then the White piece
      cfg = { players: 0, levels: {}, names: {}, hints: false };
      const ask = (side, next) => askLevel((lv) => { cfg.levels[side] = lv; cfg.names[side] = 'Computer (' + LP.LEVEL_LABEL[lv] + ')'; next(); }, side === W ? 'White computer' : 'Black computer');
      ask(W, () => ask(B, () => askPiece('White', (pc) => { cfg.piece = pc; newRound(); })));
    };
    $('#pl-2').onclick = () => {
      cfg = { players: 2, names: { w: 'White', b: 'Black' }, hints: true };
      askName('White, what is your name?', 'White', (nw) => {
        cfg.names.w = nw;
        askName('Black, what is your name?', 'Black', (nb) => {
          cfg.names.b = nb;
          askPiece(cfg.names.w, (pc) => { cfg.piece = pc; finishSetup(); });
        });
      });
    };
    $('#pl-1').onclick = () => {
      askLevel((lv) => {
        cfg = { players: 1, level: lv, names: {}, hints: true };
        askSolo((nm) => {
          LP.openSheet(`<h2>Play as<span class="sub">Choose your side.</span></h2>
            <div class="stack">
              <button class="btn big" data-side="w">White</button>
              <button class="btn big" data-side="b">Black</button>
              <button class="btn big" data-side="r">Random</button>
            </div>`);
          document.querySelectorAll('[data-side]').forEach((b) => {
            b.onclick = () => {
              let s = b.dataset.side;
              if (s === 'r') s = Math.random() < 0.5 ? 'w' : 'b';
              setupSolo(nm, s);
            };
          });
        });
      });
    };
  }

  function setupSolo(name, side) {
    cfg.human = side;
    cfg.names = { [side]: name, [side === W ? B : W]: 'Computer (' + LP.LEVEL_LABEL[cfg.level] + ')' };
    if (side === W) askPiece(name, (pc) => { cfg.piece = pc; finishSetup(); });
    else { cfg.piece = pick(['q', 'r', 'b', 'n']); finishSetup(); }
  }

  function swapSides() {
    if (cfg.players === 2) {
      cfg.names = { w: cfg.names.b, b: cfg.names.w };
      askPiece(cfg.names.w, (pc) => { cfg.piece = pc; newRound(); });
    } else {
      setupSolo(cfg.names[cfg.human], cfg.human === W ? B : W);
    }
  }

  /* ------------------------------------------------------------------ wiring */
  $('#rush-board').addEventListener('click', (e) => {
    const el = e.target.closest('.square');
    if (el) onSquare(+el.dataset.sq);
  });
  $('#rush-reset').addEventListener('click', () => {
    if (g && !g.ended && g.t0) {
      LP.openSheet(`<h2>Start a new round?</h2><div class="row"><button class="btn" id="c-no">Cancel</button><button class="btn primary" id="c-yes">New round</button></div>`);
      $('#c-no').onclick = LP.closeSheet;
      $('#c-yes').onclick = () => { LP.session.clear(); newRound(); };
    } else newRound();
  });
  $('#rush-back').addEventListener('click', () => {
    if (g && !g.ended && g.t0) {
      LP.openSheet(`<h2>Leave this round? You can continue it from the menu.</h2><div class="row"><button class="btn" id="c-no">Stay</button><button class="btn primary" id="c-yes">Leave</button></div>`);
      $('#c-no').onclick = LP.closeSheet;
      $('#c-yes').onclick = toMenu;
    } else toMenu();
  });
  const rpGo = (fn) => () => { if (rp) fn(); };
  $('#rr-play').addEventListener('click', rpGo(() => (rp.playing ? rpStop() : rpPlay())));
  $('#rr-prev').addEventListener('click', rpGo(() => { rpStop(); showFrame(rp.idx - 1, false); }));
  $('#rr-next').addEventListener('click', rpGo(() => { rpStop(); showFrame(rp.idx + 1, true); }));
  $('#rr-start').addEventListener('click', rpGo(() => { rpStop(); showFrame(0, false); }));
  $('#rr-end').addEventListener('click', rpGo(() => { rpStop(); showFrame(rp.frames.length - 1, false); rp.t = rp.total; $('#rush-scrub').value = rp.t; g.fixedRem = 0; updateHud(); }));
  const RP_SPEEDS = [1, 2, 4, 8, 16, 0.5];
  $('#rr-speed').addEventListener('click', rpGo(() => {
    rp.speed = RP_SPEEDS[(RP_SPEEDS.indexOf(rp.speed) + 1) % RP_SPEEDS.length];
    $('#rr-speed').textContent = rp.speed + 'x';
    if (rp.playing) rpPlay();
  }));
  $('#rush-scrub').addEventListener('input', rpGo(() => { rpStop(); rpSeek(+$('#rush-scrub').value, false); }));
  $('#rr-exit').addEventListener('click', rpGo(closeReplay));
  window.Rush = { lab: { rank, gen, allMoves, attackedByBlack, whiteSquares, blackSquares, framesOf: (d) => framesOf(d), VALUE, COST, PNAME }, watch: (d, from) => watch(d, from || 'menu'), resume, describe: (d) => 'Capture Rush \u00b7 ' + fmtTime(TOTAL - d.g.used) + ' left' };
  document.querySelector('.mode[data-mode="rush"]').addEventListener('click', () => { if (LP.saves) LP.saves.guard(start); else start(); });

  /** Headless round for testing the computer players: returns { score, taken, blacks }. */
  function sim(lw, lb, piece, turns) {
    const saveG = g, saveCfg = cfg;
    cfg = { players: 0, names: { w: 'W', b: 'B' } };
    const cells = new Array(64).fill(null);
    g = { cells, piece, turn: W, score: 0, taken: 0, caps: [], t0: 0, ended: false, last: null };
    STARTS[piece].forEach((s) => { cells[s] = { c: W, t: piece }; });
    for (let i = 0; i < 4; i++) spawnBlack(cells);
    let wMoves = 0;
    while (wMoves < turns) {
      const side = g.turn;
      const m = think(cells, side, side === W ? lw : lb);
      if (!m) { g.turn = side === W ? B : W; continue; }
      if (side === W) wMoves++;
      applyMove(m.from, m.to);
    }
    const out = { score: g.score, taken: g.taken, blacks: blackSquares(cells).length };
    g = saveG; cfg = saveCfg;
    return out;
  }
  window.__rush = { sim, setTotal: (ms) => { TOTAL = ms; }, };   // used by the test scripts
})();
