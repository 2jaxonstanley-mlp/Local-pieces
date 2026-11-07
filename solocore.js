/**
 * Solo Chess rules and puzzle maker (no screen code, so it can be tested on its own).
 *
 * Board: 64 squares, sq = rank * 8 + file (0 = a1). Every piece is the same colour and may capture any other piece.
 * Types: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king. A pawn captures one square diagonally in any direction.
 * Rules: every move is a capture; a piece can capture at most 2 times; a king can never be captured, so if there is one it is the last piece left.
 *
 * Puzzles are made backwards: start from the last piece standing and "un-capture" again and again, so every puzzle has
 * at least one solution. The solver then measures how many of the positions you can reach are dead ends.
 */
(() => {
  'use strict';
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const MAX_CAPS = 2;
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const JUMP = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const ALL8 = ORTH.concat(DIAG);

  const at = (f, r) => (f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f);

  /** Squares a piece of type t on sq attacks right now: the first piece met along each line, or the fixed squares for a knight, king and pawn. */
  function reach(board, sq, t) {
    const f = sq & 7, r = sq >> 3, out = [];
    if (t === N || t === K || t === P) {
      const list = t === N ? JUMP : t === K ? ALL8 : DIAG;
      for (const d of list) { const s = at(f + d[0], r + d[1]); if (s >= 0 && board[s]) out.push(s); }
      return out;
    }
    const dirs = t === R ? ORTH : t === B ? DIAG : ALL8;
    for (const d of dirs) {
      let nf = f + d[0], nr = r + d[1];
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const s = nr * 8 + nf;
        if (board[s]) { out.push(s); break; }
        nf += d[0]; nr += d[1];
      }
    }
    return out;
  }

  /** Every legal capture: [{ from, to }]. A piece with 2 captures is done, and a king can't be taken. */
  function captures(board) {
    const out = [];
    for (let s = 0; s < 64; s++) {
      const p = board[s];
      if (!p || p.c >= MAX_CAPS) continue;
      for (const to of reach(board, s, p.t)) if (board[to].t !== K) out.push({ from: s, to });
    }
    return out;
  }

  const count = (board) => { let n = 0; for (let s = 0; s < 64; s++) if (board[s]) n++; return n; };

  /** Make a capture in place. Returns what is needed to take it back. */
  function apply(board, m) {
    const mover = board[m.from], taken = board[m.to];
    board[m.to] = mover; board[m.from] = null; mover.c++;
    return { m, mover, taken };
  }
  function undo(board, u) {
    u.mover.c--;
    board[u.m.from] = u.mover; board[u.m.to] = u.taken;
  }

  const keyOf = (board) => { let k = ''; for (let s = 0; s < 64; s++) { const p = board[s]; if (p) k += s + ':' + p.t + p.c + ','; } return k; };

  /**
   * Explore every position you can reach from here (up to a node limit).
   * Returns { solvable, states, dead }: dead = positions that can no longer be finished.
   */
  function analyse(board, limit) {
    const memo = new Map();
    let nodes = 0, cut = false;
    function go() {
      if (count(board) === 1) return true;
      const key = keyOf(board);
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      if (++nodes > limit) { cut = true; return false; }
      let ok = false;
      const ms = captures(board);
      for (const m of ms) {
        const u = apply(board, m);
        const r = go();
        undo(board, u);
        if (r) ok = true;
        if (cut) break;
      }
      if (!cut) memo.set(key, ok);
      return ok;
    }
    const solvable = go();
    let dead = 0;
    memo.forEach((v) => { if (!v) dead++; });
    return { solvable, states: memo.size, dead, cut };
  }

  /** One winning line, or null. */
  function solution(board, limit) {
    const seen = new Set();
    let nodes = 0;
    const line = [];
    function go() {
      if (count(board) === 1) return true;
      const key = keyOf(board);
      if (seen.has(key) || ++nodes > limit) return false;
      for (const m of captures(board)) {
        const u = apply(board, m);
        line.push(m);
        if (go()) { undo(board, u); return true; }
        line.pop();
        undo(board, u);
      }
      seen.add(key);
      return false;
    }
    return go() ? line : null;
  }

  /* ---------------------------------------------------------------- making puzzles */
  const WEIGHTS = [[P, 24], [N, 22], [B, 20], [R, 20], [Q, 14]];
  function pickType(rnd) {
    let x = rnd() * 100;
    for (const w of WEIGHTS) { if ((x -= w[1]) < 0) return w[0]; }
    return N;
  }
  const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  /** Squares from which a piece of type t could have captured on sq, given what else is on the board. */
  function origins(board, sq, t) {
    const f = sq & 7, r = sq >> 3, out = [];
    if (t === N || t === K || t === P) {
      const list = t === N ? JUMP : t === K ? ALL8 : DIAG;
      for (const d of list) { const s = at(f + d[0], r + d[1]); if (s >= 0 && !board[s]) out.push(s); }
      return out;
    }
    const dirs = t === R ? ORTH : t === B ? DIAG : ALL8;
    for (const d of dirs) {
      let nf = f + d[0], nr = r + d[1];
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const s = nr * 8 + nf;
        if (board[s]) break;
        out.push(s);
        nf += d[0]; nr += d[1];
      }
    }
    return out;
  }

  /** Build a puzzle with n pieces backwards from the last piece standing. Returns [{ sq, t }] or null. */
  function build(n, king, rnd) {
    const board = new Array(64).fill(null);
    const list = [];
    const last = { t: king ? K : pickType(rnd), c: 0, used: 0, sq: Math.floor(rnd() * 64) };
    board[last.sq] = last; list.push(last);
    while (list.length < n) {
      let done = false;
      for (const p of shuffle(list.slice(), rnd)) {
        if (p.used >= MAX_CAPS) continue;
        const from = origins(board, p.sq, p.t);
        if (!from.length) continue;
        const f = from[Math.floor(rnd() * from.length)];
        const victim = { t: pickType(rnd), c: 0, used: 0, sq: p.sq };
        board[f] = p; board[p.sq] = victim;
        p.sq = f; p.used++;
        list.push(victim);
        done = true;
        break;
      }
      if (!done) return null;
    }
    return list.map((p) => ({ sq: p.sq, t: p.t }));
  }

  const toBoard = (pieces) => { const b = new Array(64).fill(null); pieces.forEach((p) => { b[p.sq] = { t: p.t, c: 0 }; }); return b; };

  /**
   * A puzzle for round r (1-30). Round 1 has 2 pieces; rounds 2 and 3 have 3; after that it goes in pairs: the first round of a
   * pair adds a piece, the second keeps the count but is trickier (more dead ends to fall into).
   * Returns { pieces: [{ sq, t }], n, hard }.
   */
  function sizeFor(round) { return Math.min(16, round === 1 ? 2 : Math.floor(round / 2) + 2); }
  const isHard = (round) => round >= 3 && round % 2 === 1;

  function puzzleFor(round, rnd, budgetMs) {
    rnd = rnd || Math.random;
    const n = sizeFor(round), hard = isHard(round);
    const tries = n <= 2 ? 1 : hard ? 14 : 6;
    const end = Date.now() + (budgetMs || 150);
    let best = null, bestScore = 0;
    let i = 0;
    while (i < tries * 3 && (i < 2 || Date.now() < end)) {
      i++;
      const king = n >= 2 && rnd() < 0.3;
      const pieces = build(n, king, rnd);
      if (!pieces) continue;
      const a = analyse(toBoard(pieces), 12000);
      if (!a.solvable) continue;               // (only if the search was cut off)
      const trouble = a.states ? a.dead / a.states : 0;   // share of reachable positions that are dead ends
      // plain rounds like fewer traps; the tricky round of each pair wants the most
      const score = hard ? trouble : 1 - trouble;
      if (!best || score > bestScore) { best = pieces; bestScore = score; }
    }
    if (!best) best = build(n, false, rnd) || build(n, false, rnd);
    return { pieces: best, n, hard };
  }

  window.SoloCore = { P, N, B, R, Q, K, MAX_CAPS, reach, captures, count, apply, undo, analyse, solution, build, puzzleFor, sizeFor, isHard, toBoard };
})();
