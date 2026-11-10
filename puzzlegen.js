/**
 * Puzzle generator: builds random positions and proves they are solvable with the rules engine in chess.js.
 *   mate  : White to move, checkmate in 1 or a forced checkmate in 2 (every Black reply is covered).
 *   check : White must give a safe check (checking piece not capturable) within N moves; Black replies after each non-checking move.
 *   best  : White to move, one move is clearly the best (found by a small material search).
 *   fork  : White has one move that attacks two Black pieces at once (knight, pawn, bishop, rook, queen or royal fork).
 *   sac   : Hard only. White's best move is a sacrifice that gains material (or mate) in the end.
 * No DOM in here, so it can be tested from node.
 */
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const { Chess, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, sq, fileOf, rankOf } = root;

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const SQUARES = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) SQUARES.push(sq(f, r));
  const dist = (a, b) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
  const key = (m) => m.from + '-' + m.to;
  const uniq = (moves) => { const seen = new Set(); return moves.filter((m) => { const k = key(m); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const plain = (m) => ({ f: m.from, t: m.to, p: m.promo || 0 });

  /* ------------------------------------------------------------- positions */
  function blank() {
    const g = new Chess();
    g.board.fill(0);
    g.mode = 'basic';
    g.castling = 0;
    g.ep = -1;
    g.turn = WHITE;
    g.history = [];
    return g;
  }
  function fromPos(pos) { const g = blank(); for (const [s, p] of pos) g.board[s] = p; return g; }
  function posOf(g) { const o = []; for (const s of SQUARES) if (g.board[s]) o.push([s, g.board[s]]); return o; }

  /** r = { white: [types], black: [types], edge: bool }  (kings are added automatically). Returns null when the layout is not usable. */
  function randomPosition(r) {
    const g = blank();
    const edges = SQUARES.filter((s) => fileOf(s) % 7 === 0 || rankOf(s) % 7 === 0);
    const bk = r.edge ? pick(edges) : pick(SQUARES);
    g.board[bk] = BLACK | KING;
    let wk;
    do { wk = pick(SQUARES); } while (wk === bk || dist(wk, bk) < 2);
    g.board[wk] = WHITE | KING;
    const put = (col, t) => {
      for (let i = 0; i < 40; i++) {
        const s = pick(SQUARES);
        if (g.board[s]) continue;
        const rk = rankOf(s);
        if (t === PAWN && (rk === 0 || rk === 7)) continue;
        g.board[s] = col | t;
        return true;
      }
      return false;
    };
    const putNear = (col, t) => {                       // a Black piece close to its king (the way a defence really looks)
      for (let i = 0; i < 30; i++) {
        const s = pick(SQUARES);
        if (g.board[s] || dist(s, bk) > 2) continue;
        const rk = rankOf(s);
        if (t === PAWN && (rk === 0 || rk === 7)) continue;
        g.board[s] = col | t;
        return true;
      }
      return put(col, t);
    };
    for (const t of r.white) if (!put(WHITE, t)) return null;
    for (const t of r.black) if (!(r.near && Math.random() < r.near ? putNear(BLACK, t) : put(BLACK, t))) return null;
    if (g.inCheck(BLACK) || g.inCheck(WHITE)) return null;
    return g;
  }

  /* ----------------------------------------------------------------- mate */
  const isMate = (g) => g.inCheck(g.turn) && !g.hasLegalMove();
  const isCapture = (g, m) => !!g.board[m.to] || m.flags === 2;

  /** Every White move that checkmates right now. */
  function mateMoves(g, first) {
    const out = [];
    for (const m of g.legalMoves()) {
      g.makeMove(m);
      const mate = isMate(g);
      g.unmakeMove();
      if (mate) { out.push(m); if (first) break; }
    }
    return out;
  }

  /* A small forced-mate solver. `budget` caps the work; when it runs out `blown` is set and the answer is "no". */
  let budget = 0, blown = false;
  const setBudget = (n) => { budget = n; blown = false; };

  /** White to move: can White force checkmate within k moves? checksOnly: before the last move White may only give check. */
  function wMates(g, k, checksOnly) {
    if (mateMoves(g, true).length) return true;
    if (k <= 1 || blown) return false;
    const quiet = [];
    for (const m of g.legalMoves()) {
      if (--budget < 0) { blown = true; return false; }
      g.makeMove(m);
      const chk = g.inCheck(g.turn);
      if (chk || !checksOnly) {
        if (chk) { const ok = blackLoses(g, k - 1, checksOnly); g.unmakeMove(); if (ok) return true; if (blown) return false; continue; }
        g.unmakeMove(); quiet.push(m); continue;
      }
      g.unmakeMove();
    }
    for (const m of quiet) {
      if (--budget < 0) { blown = true; return false; }
      g.makeMove(m);
      const ok = blackLoses(g, k - 1, checksOnly);
      g.unmakeMove();
      if (ok) return true;
      if (blown) return false;
    }
    return false;
  }
  /** Black to move (not checkmated): does every reply let White mate within k moves? */
  function blackLoses(g, k, checksOnly) {
    const rep = g.legalMoves();
    if (!rep.length) return false;                 // stalemate (a mate is handled by the caller)
    for (const r of rep) {
      if (--budget < 0) { blown = true; return false; }
      g.makeMove(r);
      const w = wMates(g, k, checksOnly);
      g.unmakeMove();
      if (!w) return false;
    }
    return true;
  }

  /** White's first moves that force checkmate in `n` moves (n = 2 or 3). For n = 3 the second move has to be a check. */
  function mateFirsts(g, n, firstOnly) {
    const out = [];
    for (const m1 of uniq(g.legalMoves())) {
      g.makeMove(m1);
      const ok = !isMate(g) && blackLoses(g, n - 1, n >= 3);
      g.unmakeMove();
      if (blown) return null;
      if (ok) { out.push(m1); if (firstOnly) break; }
    }
    return out;
  }

  /** The forced mate in 2 first moves (kept for older code). */
  function forcedMate2(g, firstOnly) { return mateFirsts(g, 2, firstOnly) || []; }

  /** Can White (to move) mate within k moves? Used to check the player's moves; generous budget, never throws. */
  function canMate(g, k) { setBudget(250000); const r = wMates(g, k, false); return r; }
  /** Black to move after the player's move: is every reply answered by a mate within k moves? */
  function forcedWithin(g, k) {
    setBudget(250000);
    const r = blackLoses(g, k, false);
    return { ok: r, unsure: blown };
  }

  /** A White move that mates in at most k moves (a mate itself, else the first forced line found). */
  function findMateMove(g, k) {
    const mm = mateMoves(g, true);
    if (mm.length) return mm[0];
    for (const checks of [true, false]) {
      setBudget(250000);
      const ms = g.legalMoves();
      for (const m of ms) {
        g.makeMove(m);
        const ok = !isMate(g) && (checks ? g.inCheck(g.turn) : true) && blackLoses(g, k - 1, checks && k >= 3);
        g.unmakeMove();
        if (ok) return m;
        if (blown) break;
      }
    }
    return null;
  }

  /** After White's move: the Black reply that gives White the fewest ways to carry on (the stubbornest defence). k = moves White still has. */
  function bestDefence(g, k) {
    const rep = g.legalMoves();
    if (!rep.length) return null;
    let best = null, bestN = 1e9;
    setBudget(120000);
    for (const r of rep) {
      g.makeMove(r);
      let n = 0;
      if (!k || k <= 1) n = uniq(mateMoves(g)).length;
      else {
        for (const m of g.legalMoves()) {
          g.makeMove(m);
          if (g.inCheck(g.turn) && (isMate(g) || blackLoses(g, k - 1, k >= 3))) n++;
          g.unmakeMove();
          if (blown) break;
        }
        if (blown) { blown = false; budget = 120000; }
      }
      g.unmakeMove();
      if (n < bestN || (n === bestN && Math.random() < 0.5)) { best = r; bestN = n; }
    }
    return best;
  }

  const BLACK_POOL = [PAWN, PAWN, PAWN, KNIGHT, BISHOP, ROOK, QUEEN];
  function pickN(pool, n) { const a = []; for (let i = 0; i < n; i++) a.push(pick(pool)); return a; }

  /**
   * One attempt at a mate puzzle (a forced mate in n = 2 or 3 moves); returns a puzzle or null.
   * level: 0 strict, 1 relaxed, 2 anything that is valid.
   * Mate in 3 puzzles have to start with a capture (take something first), and mate in 1 is not used at all.
   */
  function tryMate(diff, n, level, forSac) {
    let white, black;
    if (n === 1) {
      if (diff === 'easy') { white = [pick([QUEEN, ROOK]), pick([QUEEN, ROOK, BISHOP, KNIGHT, PAWN])]; if (Math.random() < 0.5) white.push(pick([PAWN, KNIGHT, BISHOP])); black = pickN([PAWN, PAWN, PAWN, KNIGHT, BISHOP, ROOK], 3 + rnd(3)); }
      else { white = pickN([QUEEN, ROOK, ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, PAWN], 4 + rnd(2)); black = pickN(BLACK_POOL, 4 + rnd(3)); }
    } else if (n === 2) {
      white = pickN([QUEEN, ROOK, ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, PAWN], (diff === 'hard' ? 5 : 4) + rnd(2));
      black = pickN(BLACK_POOL, (diff === 'hard' ? 5 : 4) + rnd(3));
    } else { white = pickN([QUEEN, ROOK, ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, PAWN, PAWN], 5 + rnd(3)); black = pickN(BLACK_POOL, 5 + rnd(3)); }
    const g = randomPosition({ white, black, edge: Math.random() < 0.75, near: 0.55 });
    if (!g) return null;
    if (n === 1) {
      const mates = uniq(mateMoves(g));
      if (!mates.length) return null;
      const types = mates.map((m) => g.board[m.from] & 7);
      if (level === 0) {
        if (diff === 'easy' && (mates.length > 3 || types.some((t) => t !== QUEEN && t !== ROOK))) return null;
        if (diff === 'normal' && (mates.length > 2 || (types.every((t) => t === QUEEN) && Math.random() > 0.15))) return null;
      }
      return { type: 'mate', n: 1, diff, pos: posOf(g), sol: mates.map(plain) };
    }
    setBudget(n === 2 ? 60000 : 200000);
    if (mateMoves(g, true).length) return null;                       // an immediate mate would make it a mate in 1
    if (n === 3) {
      // quick reject: a mate in 2 would make this a mate in 2 puzzle
      setBudget(60000);
      if (wMates(g, 2, false)) return null;
      if (blown) return null;
      setBudget(200000);
    }
    const firsts = mateFirsts(g, n, false);
    if (!firsts || !firsts.length) return null;
    if (n === 3) {
      if (!forSac && !firsts.some((m) => isCapture(g, m))) return null;   // the idea is to take a piece first
      if (level === 0 && diff === 'hard' && firsts.length > 3) return null;
      if (level === 0 && diff === 'normal' && firsts.length > 5) return null;
    } else {
      if (level === 0 && diff === 'normal' && firsts.length > 3) return null;
      if (level === 0 && diff === 'hard' && firsts.length > 2) return null;
    }
    // put the capturing moves first so the hint and the shown solution take a piece
    const ordered = firsts.slice().sort((a, b) => (isCapture(g, b) ? 1 : 0) - (isCapture(g, a) ? 1 : 0));
    return { type: 'mate', n, diff, pos: posOf(g), sol: ordered.map(plain) };
  }

  /* ---------------------------------------------------------------- check */
  /** After White's move that checks: is the checking piece safe from capture? */
  function isSafeCheck(g, checkerSq) {
    if (!g.inCheck(BLACK)) return false;
    for (const m of g.legalMoves()) {
      if (m.to === checkerSq) return false;   // Black can capture the checker
    }
    return true;
  }

  /**
   * Alternating search: White moves, and if not a safe check Black replies (any legal), then White again.
   * Returns { path: [white moves as plain], replies: [black replies as plain or null] } or null.
   * path.length is the number of White moves (the limit).
   */
  function checkPath(board, maxD, cap) {
    const g = blank();
    const keyOf = (b, turn) => {
      let k = '';
      for (const s of SQUARES) k += String.fromCharCode(48 + b[s]);
      return k + turn;
    };
    // node: board after Black's last reply (White to move), whitePath, blackReplies
    let frontier = [{ b: Uint8Array.from(board), path: [], replies: [] }];
    const seen = new Set([keyOf(board, WHITE)]);
    for (let d = 1; d <= maxD; d++) {
      const next = [];
      for (const node of frontier) {
        g.board.set(node.b); g.turn = WHITE; g.ep = -1; g.castling = 0; g.history = [];
        for (const m of g.legalMoves()) {
          g.makeMove(m);
          if (isSafeCheck(g, m.to)) {
            const path = node.path.concat([plain(m)]);
            const replies = node.replies.concat([null]); // no reply after final check
            g.unmakeMove();
            return { path, replies };
          }
          // Unsafe checks are not solutions; only quiet moves continue with a Black reply
          if (d < maxD && !g.inCheck(BLACK)) {
            const replies = g.legalMoves();
            if (replies.length) {
              const sample = replies.length <= 4 ? replies : [pick(replies), pick(replies), pick(replies)];
              for (const r of sample) {
                g.makeMove(r);
                const k = keyOf(g.board, WHITE);
                if (!seen.has(k)) {
                  seen.add(k);
                  next.push({
                    b: g.board.slice(),
                    path: node.path.concat([plain(m)]),
                    replies: node.replies.concat([plain(r)]),
                  });
                }
                g.unmakeMove();
              }
            }
          }
          g.unmakeMove();
        }
        if (seen.size > (cap || 60000)) return null;
      }
      frontier = next;
      if (!frontier.length) return null;
    }
    return null;
  }

  function tryCheck(diff, level) {
    let white, black, want;
    if (diff === 'easy') { white = [pick([QUEEN, ROOK]), pick([PAWN, KNIGHT, BISHOP, ROOK])]; if (Math.random() < 0.5) white.push(pick([PAWN, KNIGHT])); black = pickN([PAWN, PAWN, PAWN, KNIGHT, BISHOP, ROOK], 3 + rnd(2)); want = [1, 2]; }
    else if (diff === 'normal') { white = pickN([ROOK, ROOK, BISHOP, KNIGHT, KNIGHT, PAWN], 3 + rnd(2)); black = pickN(BLACK_POOL, 5 + rnd(3)); want = [2, 3]; }
    else { white = pickN([ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, PAWN, PAWN], 4 + rnd(3)); black = pickN(BLACK_POOL, 6 + rnd(4)); want = [3, 4]; }
    const g = randomPosition({ white, black, edge: Math.random() < 0.4, near: 0.5 });
    if (!g) return null;
    if (!g.hasLegalMove()) return null;
    const lo = level === 0 ? want[0] : level === 1 ? Math.max(1, want[0] - 1) : 1;
    const found = checkPath(g.board, level === 0 ? want[1] : 5, 90000);
    if (!found || !found.path || found.path.length < lo) return null;
    if (level === 0 && found.path.length > want[1]) return null;
    return { type: 'check', diff, limit: found.path.length, pos: posOf(g), path: found.path, replies: found.replies };
  }

  /* ----------------------------------------------------------------- best */
  const PV = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 0 };
  const MATE = 30000, INF = 1e6;

  function evalSide(g) {
    let s = 0;
    for (const x of SQUARES) { const p = g.board[x]; if (p) s += ((p & 24) === WHITE ? 1 : -1) * PV[p & 7]; }
    return g.turn === WHITE ? s : -s;
  }
  function pseudo(g, capsOnly) {
    const out = [];
    for (const s of SQUARES) {
      const p = g.board[s];
      if (!p || (p & 24) !== g.turn) continue;
      for (const m of g.genPieceMoves(s)) {
        const v = g.board[m.to];
        if (capsOnly && !v && !m.promo && m.flags !== 2) continue;
        m.o = (v ? PV[v & 7] * 10 - PV[p & 7] / 10 : 0) + (m.promo ? 800 : 0);
        out.push(m);
      }
    }
    return out.sort((a, b) => b.o - a.o);
  }
  let horizon = false;                                   // on for move ratings (so mates are seen), off for puzzle generation (speed)
  function qs(g, alpha, beta, ply) {
    if (horizon && ply === 0 && g.inCheck(g.turn)) {   // in check at the horizon: look at every reply so a mate is not missed
      const side = g.turn;
      let best = -INF, legal = 0;
      for (const m of pseudo(g, false)) {
        g.makeMove(m);
        if (g.inCheck(side)) { g.unmakeMove(); continue; }
        legal++;
        const sc = -qs(g, -beta, -alpha, 1);
        g.unmakeMove();
        if (sc > best) { best = sc; if (sc > alpha) alpha = sc; if (alpha >= beta) break; }
      }
      return legal ? best : -MATE + 8;
    }
    const stand = evalSide(g);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 6) return stand;
    const side = g.turn;
    for (const m of pseudo(g, true)) {
      g.makeMove(m);
      if (g.inCheck(side)) { g.unmakeMove(); continue; }
      const sc = -qs(g, -beta, -alpha, ply + 1);
      g.unmakeMove();
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function nega(g, depth, alpha, beta, ply) {
    if (depth <= 0) return qs(g, alpha, beta, 0);
    const side = g.turn;
    let best = -INF, legal = 0;
    for (const m of pseudo(g, false)) {
      g.makeMove(m);
      if (g.inCheck(side)) { g.unmakeMove(); continue; }
      legal++;
      const sc = -nega(g, depth - 1, -beta, -alpha, ply + 1);
      g.unmakeMove();
      if (sc > best) { best = sc; if (sc > alpha) alpha = sc; if (alpha >= beta) break; }
    }
    if (!legal) return g.inCheck(side) ? -MATE + ply : 0;
    return best;
  }
  /** Best root move at a depth (and its score). */
  function bestAt(g, depth) {
    let best = null, bs = -INF;
    for (const m of g.legalMoves().sort((a, b) => (g.board[b.to] ? 1 : 0) - (g.board[a.to] ? 1 : 0))) {
      g.makeMove(m);
      const sc = -nega(g, depth - 1, -INF, -Math.max(bs, -INF + 1), 1);
      g.unmakeMove();
      if (sc > bs) { bs = sc; best = m; }
    }
    return { move: best, score: bs };
  }
  /** Is any move other than `best` (by from-to) within `margin` of the best score? */
  function rivalWithin(g, best, bs, depth, margin) {
    const T = bs - margin;
    for (const m of g.legalMoves()) {
      if (m.from === best.from && m.to === best.to) continue;
      g.makeMove(m);
      const v = nega(g, depth - 1, -T - 2, -T - 1, 1);
      g.unmakeMove();
      if (v <= -T - 1) return true;
    }
    return false;
  }

  const BEST_POOL = [QUEEN, ROOK, ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, PAWN, PAWN, PAWN, PAWN];

  function tryBest(diff, level) {
    const n = diff === 'hard' ? 5 + rnd(3) : diff === 'normal' ? 4 + rnd(3) : 3 + rnd(3);
    const white = pickN(BEST_POOL, n), black = pickN(BEST_POOL, n - rnd(2));
    const g = randomPosition({ white, black, edge: false });
    if (!g || !g.hasLegalMove()) return null;
    const D = diff === 'hard' ? (level >= 2 ? 3 : 5) : 3;           // how deep the answer has to be proven
    const margin = diff === 'easy' ? 250 : level >= 2 ? 120 : diff === 'hard' ? 200 : 150;
    // cheap first: a harder puzzle must not be found by a short look
    let shallow = null;
    if (diff === 'hard' && level < 1) shallow = bestAt(g, 2).move;
    if (diff === 'hard' && level < 2) { const q3 = bestAt(g, 3); if (!q3.move || (q3.score - evalSide(g) < 100 && q3.score < MATE - 100)) return null; }   // a quiet position has nothing to find
    const top = bestAt(g, D);
    if (!top.move) return null;
    const mated = top.score > MATE - 100;
    if (!mated && top.score < -MATE / 2) return null;
    if (shallow && level === 0 && shallow.from === top.move.from && shallow.to === top.move.to) return null;
    if (rivalWithin(g, top.move, top.score, D, margin)) return null;
    // the best move has to matter: it must win material (or mate) compared with where we started
    const now = evalSide(g);
    if (diff !== 'easy' && level < 2 && !mated && top.score - now < (diff === 'hard' ? 150 : 100)) return null;
    if (level === 0) {
      const greedy = bestAt(g, 1).move;
      const same = greedy.from === top.move.from && greedy.to === top.move.to;
      if (diff === 'easy' && (!same || !g.board[top.move.to])) return null;
      if (diff !== 'easy' && same) return null;
    }
    const good = uniq(g.legalMoves().filter((m) => m.from === top.move.from && m.to === top.move.to)).map(plain);
    let explain;
    if (mated) explain = 'It forces checkmate in ' + Math.max(1, Math.ceil((MATE - top.score) / 2)) + '.';
    else if (top.score - now >= 150) explain = 'It wins about ' + Math.round((top.score - now) / 100) + ' points of material.';
    else explain = 'Every other move loses at least ' + Math.round(margin / 100) + ' points of material.';
    return { type: 'best', diff, pos: posOf(g), good, explain, san: sanOf(g, top.move) };
  }

  /* ----------------------------------------------------------------- fork */
  const FORK_NAME = { [KING]: 'king', [KNIGHT]: 'knight', [PAWN]: 'pawn', [BISHOP]: 'bishop', [ROOK]: 'rook', [QUEEN]: 'queen' };
  const PNAME = { [PAWN]: 'pawn', [KNIGHT]: 'knight', [BISHOP]: 'bishop', [ROOK]: 'rook', [QUEEN]: 'queen', [KING]: 'king' };
  /** After White move m: which Black pieces does the moved piece attack that are worth winning (the king, a more valuable piece, or an undefended one)? Null unless there are two. */
  function forkInfo(g, m) {
    g.makeMove(m);
    const after = g.turn;
    g.turn = WHITE;
    let out = null;
    try {
      const me = g.board[m.to];
      if (me && (me & 24) === WHITE) {
        const seen = new Set(), t = [];
        for (const x of g.genPieceMoves(m.to)) {
          const v = g.board[x.to];
          if (!v || (v & 24) !== BLACK || seen.has(x.to)) continue;
          seen.add(x.to);
          const ty = v & 7;
          if (ty === KING || PV[ty] > PV[me & 7] || !g.attacked(x.to, BLACK)) t.push({ s: x.to, ty });
        }
        if (t.length >= 2 && t.some((o) => o.ty !== PAWN)) out = { piece: me & 7, targets: t.sort((a, b) => (b.ty === KING ? 9999 : PV[b.ty]) - (a.ty === KING ? 9999 : PV[a.ty])) };
      }
    } catch (e) { out = null; }
    g.turn = after;
    g.unmakeMove();
    return out;
  }

  /** Does `col` have a capture that wins material outright (takes an undefended piece or a more valuable one)? */
  function loose(g, col) {
    const keep = g.turn;
    g.turn = col;
    let hit = false;
    try {
      for (const m of g.legalMoves()) {
        const v = g.board[m.to];
        if (v && (PV[v & 7] >= PV[g.board[m.from] & 7] || !g.attacked(m.to, col === WHITE ? BLACK : WHITE))) { hit = true; break; }
      }
    } catch (e) { hit = true; }
    g.turn = keep;
    return hit;
  }
  /**
   * A fork puzzle: White has one move that attacks two Black pieces at once (the king counts), and Black cannot save both.
   * The position is built around the fork (forker, its two victims and a route to the fork square) and then proven with a
   * material search: the fork has to be the best move and no other move may come close.
   */
  function tryFork(diff, level, want) {
    // want: 'knight' | 'royal' | 'pawn' | 'bishop' | 'rook' | 'queen' (optional)
    const F = want ? (want === 'royal' ? KNIGHT : { knight: KNIGHT, pawn: PAWN, bishop: BISHOP, rook: ROOK, queen: QUEEN }[want]) : pick(diff === 'easy' ? [KNIGHT, KNIGHT, KNIGHT, PAWN, PAWN, QUEEN] : [KNIGHT, KNIGHT, KNIGHT, PAWN, PAWN, BISHOP, ROOK, QUEEN]);
    const royal = want ? want === 'royal' : F === KNIGHT && Math.random() < (diff === 'easy' ? 0.25 : 0.35);
    const g = blank();
    const lo = F === PAWN ? 2 : 1, hi = F === PAWN ? 5 : 6;
    let D;
    do { D = pick(SQUARES); } while (rankOf(D) < lo || rankOf(D) > hi);
    let reach;
    if (F === PAWN) reach = [D + 15, D + 17].filter((x) => !(x & 0x88));
    else { const t = blank(); t.board[D] = WHITE | F; reach = t.genPieceMoves(D).map((m) => m.to); }
    if (reach.length < 2) return null;
    const t1 = pick(reach);
    const rest = reach.filter((x) => x !== t1 && (F !== QUEEN && F !== ROOK && F !== BISHOP || dist(x, t1) > 1));
    if (!rest.length) return null;
    const t2 = pick(rest);
    let S;
    if (F === PAWN) S = D - 16;
    else { const t = blank(); t.board[D] = WHITE | F; const opts = t.genPieceMoves(D).map((m) => m.to).filter((x) => x !== t1 && x !== t2); if (!opts.length) return null; S = pick(opts); }
    if (S & 0x88 || S < 0) return null;
    const used = new Set([D, S, t1, t2]);
    const hot = (diff === 'easy') ? [QUEEN, ROOK, ROOK, BISHOP, KNIGHT] : [QUEEN, ROOK, ROOK, BISHOP, KNIGHT, KNIGHT, PAWN];
    if (royal) { g.board[t1] = BLACK | KING; g.board[t2] = BLACK | pick([QUEEN, QUEEN, ROOK, ROOK, BISHOP]); }
    else { g.board[t1] = BLACK | pick(hot); g.board[t2] = BLACK | pick(hot); if ((g.board[t1] & 7) === PAWN && (g.board[t2] & 7) === PAWN) return null; }
    for (const x of [t1, t2]) if ((g.board[x] & 7) === PAWN && (rankOf(x) === 0 || rankOf(x) === 7)) return null;
    g.board[S] = WHITE | F;
    const spot = (nearBk) => {
      for (let i = 0; i < 40; i++) {
        const x = pick(SQUARES);
        if (used.has(x) || g.board[x]) continue;
        if (nearBk && dist(x, nearBk) < 2) continue;
        return x;
      }
      return -1;
    };
    // kings
    let bk = royal ? t1 : -1;
    if (!royal) { bk = spot(); if (bk < 0) return null; g.board[bk] = BLACK | KING; used.add(bk); }
    const wk = spot(bk); if (wk < 0) return null; g.board[wk] = WHITE | KING; used.add(wk);
    const extra = (col, pool, n) => {
      for (let i = 0; i < n; i++) {
        const x = spot(); if (x < 0) return false;
        const ty = pick(pool);
        if (ty === PAWN && (rankOf(x) === 0 || rankOf(x) === 7)) continue;
        g.board[x] = col | ty; used.add(x);
      }
      return true;
    };
    const clutter = diff === 'easy' ? 1 + rnd(2) : diff === 'normal' ? 2 + rnd(3) : 3 + rnd(3);
    if (!extra(WHITE, [ROOK, BISHOP, KNIGHT, PAWN, PAWN], clutter - (rnd(2)))) return null;
    if (!extra(BLACK, [PAWN, PAWN, KNIGHT, BISHOP, ROOK, QUEEN], clutter)) return null;
    if (g.inCheck(BLACK) || g.inCheck(WHITE)) return null;
    if (loose(g, WHITE) || loose(g, BLACK)) return null;       // no other easy win lying around for either side
    // the intended fork must exist and be a real fork
    const mine = g.legalMoves().find((m) => m.from === S && m.to === D && !g.board[D]);
    if (!mine) return null;
    if (!forkInfo(g, mine)) return null;
    const Dp = 3;                                          // fork, reply, capture (a deeper look would also "find" a quiet waiting move that forks later)
    const top = bestAt(g, Dp);
    if (!top.move) return null;
    const info = forkInfo(g, top.move);
    if (!info || g.board[top.move.to]) return null;       // the best move has to be a fork, not a capture
    const mated = top.score > MATE - 100;
    const now = evalSide(g);
    const need = level >= 1 ? 150 : diff === 'hard' ? 300 : diff === 'easy' ? 250 : 200;
    if (!mated && top.score - now < need) return null;
    if (rivalWithin(g, top.move, top.score, Dp, level >= 1 ? 90 : 130)) return null;
    const good = uniq(g.legalMoves().filter((m) => m.from === top.move.from && m.to === top.move.to)).map(plain);
    const names = info.targets.slice(0, 3).map((o) => 'the ' + PNAME[o.ty]);
    const fname = FORK_NAME[info.piece];
    const isRoyal = info.targets.some((o) => o.ty === KING) && info.targets.some((o) => o.ty === QUEEN) && info.piece === KNIGHT;
    const gain = mated ? 'It even leads to checkmate.' : 'White comes out about ' + Math.max(1, Math.round((top.score - now) / 100)) + ' points of material ahead.';
    const explain = 'A ' + fname + ' fork: the ' + fname + ' on ' + alg(top.move.to) + ' attacks ' + names.join(' and ') + ' at once, and Black cannot save both. ' + gain;
    const kind = isRoyal ? 'royal' : fname;
    if (want && kind !== want) return null;
    return { type: 'fork', kind, diff, pos: posOf(g), good, explain, san: sanOf(g, top.move) };
  }

  /* ---------------------------------------------------------------- sacrifice */
  const SAC_POOL = [QUEEN, ROOK, ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, KNIGHT, PAWN, PAWN, PAWN];

  /** Does move m (White) score at least T for White when searched `depth` plies deep (material search)? */
  function atLeast(g, m, depth, T) {
    g.makeMove(m);
    const v = -nega(g, depth - 1, -INF, -T + 1, 1);
    g.unmakeMove();
    return v >= T;
  }
  function scoreOf(g, m, depth) {
    g.makeMove(m);
    const v = -nega(g, depth - 1, -INF, INF, 1);
    g.unmakeMove();
    return v;
  }

  /**
   * A sacrifice puzzle: White's best move gives up material (more than the best quiet or capturing alternative would cost)
   * but wins more back, or forces checkmate.
   *   easy   : a sacrifice that forces mate in 2, or one whose win shows within 3 plies.
   *   normal : a sacrifice that forces mate in 3, or one whose win needs 5 plies to see (a 3-ply look sees nothing).
   *   hard   : a big sacrifice (a rook or more) that forces mate in 3, or a material sacrifice that needs 5 plies and is the only way.
   * "Sacrifice" means: after the opponent has taken what it can, White is at least two pawns worse off than after the best safe move.
   */
  function trySac(diff, level) {
    const nW = (diff === 'easy' ? 4 : 5) + rnd(3), nB = (diff === 'easy' ? 4 : 5) + rnd(3);
    const g = randomPosition({ white: pickN(SAC_POOL, nW), black: pickN(SAC_POOL, nB), edge: false, near: 0.3 });
    if (!g || !g.hasLegalMove()) return null;
    const ms = uniq(g.legalMoves());
    const after = new Map();
    let V0 = -INF;
    for (const m of ms) {
      g.makeMove(m);
      const a = -qs(g, -INF, INF, 0);
      g.unmakeMove();
      after.set(key(m), a);
      if (a > V0) V0 = a;
    }
    const need = diff === 'hard' && level === 0 ? 450 : 200;
    const sacs = ms.filter((m) => after.get(key(m)) <= V0 - 200).sort((x, y) => after.get(key(x)) - after.get(key(y)));
    if (!sacs.length) return null;
    const tier = level >= 2 ? 'easy' : diff;
    const T = 150;
    let found = null, mate3Tries = 0, matTries = 0;
    const wantMat = level < 2 && Math.random() < 0.5;                    // half of the puzzles win material, half force mate
    for (const m of sacs) {
      const cost = V0 - after.get(key(m));
      g.makeMove(m);
      let kind = null, mateN = 0;
      const gaveCheck = g.inCheck(g.turn);
      if (!wantMat && !isMate(g) && g.legalMoves().length) {
        setBudget(30000);
        if (blackLoses(g, 1, false)) { kind = 'mate'; mateN = 2; }
        else if (tier !== 'easy' && (gaveCheck ? mate3Tries < 5 : mate3Tries < 2)) { mate3Tries++; setBudget(60000); if (blackLoses(g, 2, true)) { kind = 'mate'; mateN = 3; } }
      }
      g.unmakeMove();
      if (kind === 'mate') {
        if (tier === 'easy' && mateN === 2) { found = { m, kind, mateN, cost }; break; }
        if (tier === 'normal' && mateN === 3) { found = { m, kind, mateN, cost }; break; }
        if (tier === 'hard' && mateN === 3 && cost >= need) { found = { m, kind, mateN, cost }; break; }
        if (level > 0 && tier !== 'easy' && (mateN === 2 || cost >= 200)) { found = { m, kind, mateN, cost }; break; }
        continue;
      }
      if (matTries >= 24) continue;
      matTries++;
      if (tier === 'easy') { if (atLeast(g, m, 3, V0 + T)) { found = { m, kind: 'mat', D: 3, cost }; break; } continue; }
      if (level === 0 && atLeast(g, m, 3, V0 + 100)) continue;            // too easy to see for this level
      if (cost < need && tier === 'hard') continue;
      if (atLeast(g, m, 5, V0 + T)) { found = { m, kind: 'mat', D: 5, cost }; break; }
    }
    if (!found) return null;
    const { m } = found;
    let good, explain;
    if (found.kind === 'mate') {
      // the sacrifice has to be the way (normal and hard): no other first move forces the same mate
      const firsts = found.mateN === 2 ? mateFirsts(g, 2, false) : (setBudget(200000), mateFirsts(g, 3, false));
      if (!firsts || !firsts.length) return null;
      if (tier !== 'easy' && level === 0 && firsts.length > 1) return null;
      if (firsts.length > 3) return null;
      if (!firsts.some((x) => key(x) === key(m))) return null;
      if (mateMoves(g, true).length) return null;                         // an immediate mate would spoil the puzzle
      good = firsts.map(plain);
      explain = 'It gives up material but forces checkmate in ' + found.mateN + '.';
    } else {
      const sc = scoreOf(g, m, found.D);
      const rival = rivalWithin(g, m, sc, found.D, tier === 'easy' ? 150 : level === 0 ? 150 : 100);
      if (rival) return null;
      good = [plain(m)];
      const lost = Math.max(1, Math.round(found.cost / 100));
      const won = Math.max(1, Math.round((sc - V0) / 100));
      explain = 'It costs about ' + lost + ' point' + (lost === 1 ? '' : 's') + ' of material at first, but wins about ' + won + ' more than any safe move.';
    }
    return { type: 'sac', diff, pos: posOf(g), good, explain, san: sanOf(g, m), loss: found.cost };
  }

  /**
   * Normal / Hard sacrifice puzzles that end in checkmate: a forced mate in 2 or 3 where every winning first move gives up
   * material (it costs at least two pawns, for Hard a rook or more) compared with the best ordinary move.
   */
  function trySacMate(diff, level) {
    const n = diff === 'normal' ? 2 : (Math.random() < 0.55 ? 3 : 2);
    const p = tryMate(diff === 'normal' ? 'normal' : 'hard', n, level >= 1 ? 1 : 0, true);
    if (!p) return null;
    const g = fromPos(p.pos);
    const ms = uniq(g.legalMoves());
    let V0 = -INF;
    const after = new Map();
    for (const m of ms) {
      g.makeMove(m);
      const a = -qs(g, -INF, INF, 0);
      g.unmakeMove();
      after.set(key(m), a);
      if (a > V0) V0 = a;
    }
    const cost = Math.min(...p.sol.map((x) => V0 - after.get(x.f + '-' + x.t)));
    const need = level >= 2 ? 200 : diff === 'hard' && n === 2 ? 450 : 200;
    if (!(cost >= need)) return null;
    const m0 = g.legalMovesFrom(p.sol[0].f).find((x) => x.to === p.sol[0].t && (x.promo || 0) === (p.sol[0].p || 0));
    return { type: 'sac', diff, pos: p.pos, good: p.sol, explain: 'It gives up material but forces checkmate in ' + n + '.', san: sanOf(g, m0), loss: cost };
  }

  /* -------------------------------------------------------------- helpers */
  function sanOf(g, m) {
    let san = g.moveToSan(m);
    g.makeMove(m);
    if (g.inCheck(g.turn)) san += g.hasLegalMove() ? '+' : '#';
    g.unmakeMove();
    return san;
  }
  /** Notation for a list of White moves played from `pos` (Black passes, as in check puzzles). */
  function sanPath(pos, moves) {
    const g = fromPos(pos);
    const out = [];
    for (const mv of moves) {
      const m = g.legalMovesFrom(mv.f).find((x) => x.to === mv.t && (x.promo || 0) === (mv.p || 0));
      if (!m) break;
      let san = g.moveToSan(m);
      g.makeMove(m);
      if (g.inCheck(BLACK)) san += '+';
      out.push(san);
      g.turn = WHITE; g.ep = -1; g.castling = 0;
    }
    return out;
  }

  /* ------------------------------------------------------------ puzzle bank */
  // Bank entries (puzzlebank.js) hold a verified proof tree: White node = [mv] (mating move) or [mv, [[reply, WhiteNode], ...]]
  // listing every Black reply. A move is packed as from*128 + to + (promo << 14).
  const enc = (m) => m.from * 128 + m.to + ((m.promo || 0) << 14);
  const dec = (v) => ({ f: (v >> 7) & 127, t: v & 127, p: v >> 14 });
  const mirSq = (sq) => (sq & 0x70) | (7 - (sq & 7));
  const encM = (v) => { const d = dec(v); return mirSq(d.f) * 128 + mirSq(d.t) + (d.p << 14); };
  const mirTree = (nd) => (nd.length === 1 ? [encM(nd[0])] : [encM(nd[0]), nd[1].map((r) => [encM(r[0]), mirTree(r[1])])]);
  const treeSize = (nd) => (nd.length === 1 ? 1 : 1 + nd[1].reduce((a, r) => a + treeSize(r[1]), 0));
  const treeDepth = (nd) => (nd.length === 1 ? 1 : 1 + Math.max.apply(null, nd[1].map((r) => treeDepth(r[1]))));
  /** Black's toughest reply in a proof tree: the one that makes White work longest. */
  function toughest(replies) {
    let best = null, bs = -1;
    for (const r of replies) { const sc = treeDepth(r[1]) * 1000 + treeSize(r[1]); if (sc > bs) { bs = sc; best = r; } }
    return best;
  }
  const trees = new WeakMap();
  /** The (mirrored) proof tree that belongs to a bank puzzle, or null when the puzzle did not come from the bank. */
  function treeOf(p) {
    if (!p || p.bk == null) return null;
    if (trees.has(p)) return trees.get(p);
    let t = null;
    const b = root.PuzzleBank && root.PuzzleBank[p.bk];
    if (b && b.tree) {
      const want = JSON.stringify(p.pos.slice().sort((x, y) => x[0] - y[0]));
      const mine = b.pos.map(([sq, pc]) => [p.mir ? mirSq(sq) : sq, pc]).sort((x, y) => x[0] - y[0]);
      if (JSON.stringify(mine) === want) t = p.mir ? mirTree(b.tree) : b.tree;
    }
    trees.set(p, t);
    return t;
  }

  // piece-count windows (both kings included): how crowded each difficulty looks
  const TIER = { easy: [0, 10], normal: [9, 15], hard: [13, 21], insane: [17, 40] };
  /** A real, engine-verified mate in n from the bank: fewer pieces on Easy, crowded boards on Insane. */
  function fromBank(diff, n) {
    const bank = root.PuzzleBank;
    if (!bank || !bank.length) return null;
    const [lo, hi] = TIER[diff] || TIER.normal;
    let want = n, ids = [];
    for (let d = 0; d <= 8 && !ids.length; d++) {
      for (const w of d ? [n - d, n + d] : [n]) {
        if (w < 1 || ids.length) continue;
        const l = []; bank.forEach((b, i) => { if (b.n === w) l.push(i); });
        if (l.length) { ids = l; want = w; }
      }
    }
    if (!ids.length) return null;
    const dist = (i) => { const c = bank[i].pieces; return c < lo ? lo - c : c > hi ? c - hi : 0; };
    const md = Math.min.apply(null, ids.map(dist));
    ids = ids.filter((i) => dist(i) <= md);
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('localPieces.bankSeen2')) || []; } catch (e) { seen = []; }
    let fresh = ids.filter((i) => !seen.includes(i));
    if (!fresh.length) { seen = seen.filter((i) => !ids.includes(i)); fresh = ids; }
    // hard and insane lean towards the forcing ideas: discovered checks, sacrifices, and taking a piece with tempo
    const wt = (i) => { const t = bank[i].tags; return diff === 'hard' || diff === 'insane' ? 1 + (t.includes('disc') ? 6 : 0) + (t.includes('sac') ? 4 : 0) + (t.includes('cap') ? 1 : 0) : 1; };
    let tot = 0; fresh.forEach((x) => { tot += wt(x); });
    let r = Math.random() * tot, i = fresh[0];
    for (const x of fresh) { r -= wt(x); if (r <= 0) { i = x; break; } }
    try { seen.push(i); localStorage.setItem('localPieces.bankSeen2', JSON.stringify(seen.slice(-400))); } catch (e) { /* ignore */ }
    const b = bank[i], mir = Math.random() < 0.5;
    const f = (sq) => (mir ? mirSq(sq) : sq);
    const first = [dec(b.tree[0])].concat((b.alts || []).map(dec));
    return { type: 'mate', n: b.n, diff, want: n, bk: i, mir, tags: b.tags, pos: b.pos.map(([sq, pc]) => [f(sq), pc]), sol: first.map((m) => ({ f: f(m.f), t: f(m.t), p: m.p })) };
  }

  /** Time-sliced generation. onDone(puzzle). Loosens the rules the longer it takes so it always ends. n = wanted mate length. */
  function make(type, diff, onDone, nWant) {
    const t0 = Date.now();
    if (type === 'mate') { const b = fromBank(diff, nWant || (diff === 'easy' ? 1 : diff === 'normal' ? 2 : 3)); if (b) { setTimeout(() => onDone(b), 0); return; } }
    const gd = diff === 'insane' ? 'hard' : diff;
    let n = 1;
    if (type === 'mate') n = Math.min(3, nWant || (gd === 'easy' ? 1 : gd === 'normal' ? (Math.random() < 0.5 ? 1 : 2) : (Math.random() < 0.45 ? 2 : 3)));
    const forkWant = type === 'fork' ? pick(['knight', 'knight', 'royal', 'royal', 'pawn', 'pawn', 'bishop', 'rook', 'queen', 'queen']) : undefined;
    const step = () => {
      const slice = Date.now() + 40;
      const age = Date.now() - t0;
      const level = age < 4500 ? 0 : age < 9000 ? 1 : 2;
      while (Date.now() < slice) {
        let p = null;
        try {
          p = type === 'mate' ? tryMate(gd, n, level)
            : type === 'check' ? tryCheck(gd, level)
            : type === 'fork' ? tryFork(gd, level, age < 2500 ? forkWant : undefined)
            : type === 'sac' ? (gd !== 'easy' && Math.random() < 0.85 ? trySacMate(gd, level) : trySac(gd, level))
            : tryBest(gd, level);
        } catch (e) { p = null; }
        if (p) { p.diff = diff; onDone(p); return; }
      }
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  root.PuzzleGen = { enc, dec, toughest, treeOf, treeDepth, setBudget, isBlown: () => blown, setHorizon: (v) => { horizon = v; }, nega, qs, bestAt, rivalWithin, evalSide, MATE, make, fromPos, posOf, blank, isMate, mateMoves, forcedMate2, mateFirsts, canMate, forcedWithin, findMateMove, bestDefence, isCapture, checkPath, isSafeCheck, sanPath, sanOf, tryMate, tryCheck, tryBest, tryFork, trySac, trySacMate, uniq };
})();
