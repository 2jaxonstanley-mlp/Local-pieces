/**
 * Guess Who Chess computer opponent (the "selected piece" version).
 *
 * The computer never looks at your piece types. It works out what it can from what it has seen:
 *   - which enemy piece moved where (a piece that slid 4 squares cannot be a knight or a king),
 *   - the pieces it captured (their type is shown to the captor),
 *   - the answers to the questions it asked about your selected piece.
 * From that it draws believable "worlds" (a type for every enemy piece that fits the 16 pieces each side starts with),
 * keeps, for each enemy piece, how many worlds could have it as the selected piece, and turns that into a chance.
 * It then picks between asking the most useful question, or moving (taking likely targets, keeping its own piece safe),
 * and guesses after a move only when it is sure enough. Lower levels forget things, ask at random and guess wildly.
 */
(() => {
  'use strict';
  const COUNTS = [0, 8, 2, 2, 2, 1, 1];            // pawns, knights, bishops, rooks, queen, king
  const STD = [4, 2, 3, 5, 6, 3, 2, 4, 1, 1, 1, 1, 1, 1, 1, 1];   // back rank a-h, then the front rank
  const colorOf = (p) => p & 24;
  const other = (c) => (c === WHITE ? BLACK : WHITE);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /**
   * What each level does:
   *   worlds    how many believable worlds it considers
   *   forget    ignores how enemy pieces moved, and only remembers the last answer it got
   *   guess     chance it needs before it dares to guess (>1 = never)
   *   ask       how keen it is to ask a question instead of moving (0..1)
   *   safe      how much it cares about keeping its own piece out of reach (0..1)
   *   noise     randomness in its move choice
   *   qrank     it picks its question at random from this many of the best ones
   */
  const LV = {
    dumb:   { random: true, guess: 9 },
    easy:   { worlds: 6,  forget: true,  guess: 0.8,  ask: 0.35, safe: 0.4, noise: 80, qrank: 9 },
    medium: { worlds: 12, forget: false, guess: 0.85, ask: 0.45, safe: 0.7, noise: 40, qrank: 7, memory: 3 },
    hard:   { worlds: 20, forget: false, guess: 0.82, ask: 0.5,   safe: 0.9, noise: 15, qrank: 3 },
    godly:  { worlds: 28, forget: false, guess: 0.75, ask: 0.5, safe: 1,   noise: 6, qrank: 2 },
    insane: { worlds: 36, forget: false, guess: 0.7, ask: 0.5,   safe: 1,   noise: 0, qrank: 1 },
  };

  /** A starting arrangement for the computer: all 16 pieces shuffled over the two ranks (back rank a-h, then the front rank). */
  function arrange() { return shuffle(STD.slice()); }

  /** The computer's own selected piece: a random one of its pieces. */
  function select(g, color) {
    const mine = [];
    for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const p = g.board[s]; if (p && colorOf(p) === color) mine.push(s); }
    return mine[Math.floor(Math.random() * mine.length)];
  }

  /** Does a piece of type t standing on m.from have move m? (pseudo-legal, using only who stands where) */
  function canMake(g, m, t) {
    const old = g.board[m.from];
    g.board[m.from] = (old & 24) | t;
    let ok = false;
    try {
      for (const x of g._gen(m.from, t)) {
        if (x.to !== m.to) continue;
        if (m.flags === 1 || m.flags === 2) { if (x.flags !== m.flags) continue; }
        if ((x.promo || 0) !== (m.promo || 0)) continue;
        ok = true; break;
      }
    } finally { g.board[m.from] = old; }
    return ok;
  }

  /**
   * Replay the game from `me`'s point of view. Returns every enemy piece (alive or captured) with the types it could be,
   * and a snapshot for every question `me` asked.
   */
  function infer(startFen, moves, me, mySel, forget) {
    const g = new Chess();
    g.mode = 'guess'; g.reset();
    if (startFen) g.loadFen(startFen);
    g.secretQueen[me] = mySel;
    const foe = other(me);
    const id = new Int16Array(128);
    const info = [null];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = g.board[s];
      if (p && colorOf(p) === foe) { id[s] = info.length; info.push({ pid: info.length, sq: s, poss: [0, 1, 1, 1, 1, 1, 1], alive: true, promoted: false, type: 0, moved: false }); }
    }
    const left = COUNTS.slice();
    let promotedCount = 0;
    const asks = [];
    for (const m of moves) {
      if (m.ask) {
        if (m.by === me) {
          asks.push({
            id: m.ask, ans: !!m.ans, askerSel: g.secretQueen[me], board: new Uint8Array(g.board),
            pieces: info.filter((x) => x && x.alive).map((x) => ({ pid: x.pid, sq: x.sq, moved: x.moved })),
          });
        }
        g.makeMove(m);
        continue;
      }
      const p = g.board[m.from];
      if (!p) break;
      if (colorOf(p) === foe) {
        const pid = id[m.from], inf = info[pid];
        if (inf) {
          if (!forget && !inf.promoted) {
            for (let t = 1; t <= 6; t++) if (inf.poss[t] && !canMake(g, m, t)) inf.poss[t] = 0;
          }
          if (m.promo) { inf.promoted = true; promotedCount++; inf.poss = [0, 0, 1, 1, 1, 1, 0]; }
          inf.moved = true;
          id[m.from] = 0; id[m.to] = pid; inf.sq = m.to;
        }
      } else {
        // my own move: whatever I capture is shown to me
        let capSq = -1;
        if (g.board[m.to] && colorOf(g.board[m.to]) === foe) capSq = m.to;
        else if (m.flags === 2) capSq = m.to + (me === WHITE ? -16 : 16);
        if (capSq >= 0 && id[capSq]) {
          const inf = info[id[capSq]];
          inf.alive = false;
          inf.type = g.board[capSq] & 7;
          if (!inf.promoted) left[inf.type]--;
          id[capSq] = 0;
        }
      }
      g.makeMove(m);
    }
    left[1] -= promotedCount;     // a promoted piece used up one of the pawns
    return { all: info.filter((x) => x), pieces: info.filter((x) => x && x.alive), left, game: g, asks };
  }

  /** Draw one believable assignment of types to the enemy pieces still alive: a Map pid -> type. */
  function sample(b) {
    const free = b.pieces.filter((x) => !x.promoted);
    const pool = b.left.slice();
    const order = shuffle(free.slice()).sort((x, y) => x.poss.reduce((a, v) => a + v, 0) - y.poss.reduce((a, v) => a + v, 0));
    const out = new Map();
    let steps = 0;
    const pick = (p) => {
      const opts = [];
      for (let t = 1; t <= 6; t++) if (p.poss[t] && pool[t] > 0) opts.push(t);
      const res = [];
      while (opts.length) {
        let tot = 0; for (const t of opts) tot += pool[t];
        let r = Math.random() * tot, k = 0;
        for (; k < opts.length; k++) { r -= pool[opts[k]]; if (r < 0) break; }
        res.push(opts.splice(Math.min(k, opts.length - 1), 1)[0]);
      }
      return res;
    };
    const bt = (i) => {
      if (i === order.length) return true;
      if (++steps > 3000) return false;
      const p = order[i];
      for (const t of pick(p)) {
        pool[t]--; out.set(p.pid, t);
        if (bt(i + 1)) return true;
        pool[t]++; out.delete(p.pid);
      }
      return false;
    };
    if (!bt(0)) {
      // the constraints could not be met (should not happen): fall back to anything the piece could be
      out.clear();
      for (const p of free) { const o = []; for (let t = 1; t <= 6; t++) if (p.poss[t]) o.push(t); out.set(p.pid, o.length ? o[Math.floor(Math.random() * o.length)] : 1); }
    }
    for (const p of b.pieces) if (p.promoted) { const o = []; for (let t = 2; t <= 5; t++) if (p.poss[t]) o.push(t); out.set(p.pid, o.length ? o[Math.floor(Math.random() * o.length)] : 5); }
    for (const p of b.all) if (!p.alive) out.set(p.pid, p.type || 1);
    return out;
  }

  /** The position at the time of a question, with the enemy pieces typed according to one world. */
  function worldBoard(tmp, ask, world) {
    tmp.board.set(ask.board);
    for (const x of ask.pieces) tmp.board[x.sq] = (colorOf(tmp.board[x.sq])) | world.get(x.pid);
    return tmp;
  }

  /**
   * How likely each living enemy piece is to be the selected one: Map pid -> chance, plus the worlds used.
   * A piece counts in a world when every answer it was given would have been the same for that piece in that world.
   */
  function beliefs(b, me, cfg) {
    const foe = other(me);
    const tmp = new Chess();
    tmp.mode = 'guess'; tmp.reset();
    tmp.castling = 0;
    const asks = cfg.forget ? b.asks.slice(-1) : cfg.memory ? b.asks.slice(-cfg.memory) : b.asks;   // weaker levels remember fewer answers
    const score = new Map(b.pieces.map((p) => [p.pid, 0]));
    const worlds = [];
    for (let w = 0; w < cfg.worlds; w++) {
      const world = sample(b);
      worlds.push(world);
      const boards = asks.map((a) => worldBoard(tmp, a, world).board.slice());
      for (const p of b.pieces) {
        let ok = true;
        for (let k = 0; k < asks.length && ok; k++) {
          const a = asks[k], at = a.pieces.find((x) => x.pid === p.pid);
          if (!at) continue;
          tmp.board.set(boards[k]);
          if (GuessQ.answer(tmp, a.id, foe, at.sq, { type: world.get(p.pid), moved: at.moved, askerSel: a.askerSel }) !== a.ans) ok = false;
        }
        if (ok) score.set(p.pid, score.get(p.pid) + 1);
      }
    }
    let tot = 0;
    for (const v of score.values()) tot += v;
    const prob = new Map();
    for (const p of b.pieces) prob.set(p.pid, tot ? score.get(p.pid) / tot : 1 / b.pieces.length);
    return { prob, worlds, tot };
  }

  /** The question that splits the likely candidates best: { id, score } (score 0..0.5), judged in the first world. */
  function bestQuestion(b, bel, g, me, cfg) {
    const foe = other(me);
    const world = bel.worlds[0];
    if (!world) return null;
    const tmp = new Chess();
    tmp.mode = 'guess'; tmp.reset(); tmp.castling = 0;
    tmp.board.set(g.board);
    for (const p of b.pieces) tmp.board[p.sq] = foe | world.get(p.pid);
    const mySel = g.secretQueen[me];
    const list = [];
    for (const q of GuessQ.LIST) {
      let yes = 0, tot = 0;
      for (const p of b.pieces) {
        const w = bel.prob.get(p.pid);
        if (!w) continue;
        tot += w;
        if (GuessQ.answer(tmp, q.id, foe, p.sq, { type: world.get(p.pid), moved: p.moved, askerSel: mySel })) yes += w;
      }
      if (!tot) continue;
      const sc = Math.min(yes, tot - yes) / tot + Math.random() * 0.01;
      list.push({ id: q.id, score: sc });
    }
    list.sort((a, c) => c.score - a.score);
    return list.length ? list[Math.floor(Math.random() * Math.min(cfg.qrank || 1, list.length))] : null;   // weaker levels often settle for a less useful question
  }

  /** The best move: takes likely targets, pressures them, keeps the selected piece out of reach. */
  function bestMove(g, b, bel, me, cfg) {
    const foe = other(me);
    const moves = g.legalMoves();
    if (!moves.length) return null;
    if (cfg.random) return moves[Math.floor(Math.random() * moves.length)];
    const bySq = new Map(b.pieces.map((p) => [p.sq, p]));
    const sel = g.secretQueen[me];
    let best = null, bestSc = -Infinity;
    for (const m of moves) {
      let sc = 0;
      let cap = bySq.get(m.to);
      if (!cap && m.flags === 2) cap = bySq.get(m.to + (me === WHITE ? -16 : 16));
      if (cap) sc += 1000 * bel.prob.get(cap.pid) + 40;
      g.makeMove(m);
      // pressure: chance mass of the enemy pieces my pieces could take next move
      const hit = new Set();
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = g.board[s];
        if (!p || colorOf(p) !== me) continue;
        for (const x of g._gen(s, p & 7)) if (g.board[x.to] && colorOf(g.board[x.to]) === foe) hit.add(x.to);
      }
      for (const sq of hit) { const e = bySq.get(sq); if (e && sq !== m.to) sc += 90 * bel.prob.get(e.pid); else if (e) sc += 90 * bel.prob.get(e.pid) * 0.5; }
      // danger: can an enemy piece take my selected piece next move?
      const mySq = g.secretQueen[me];
      if (mySq >= 0 && g.attacked(mySq, foe)) sc -= 450 * cfg.safe;
      if (m.from === sel && cfg.safe >= 0.9) sc -= 12;          // moving it shows how it moves
      // a loose ordinary piece is a small loss
      if (g.attacked(m.to, foe) && !g.attacked(m.to, me) && m.to !== mySq) sc -= 8;
      g.unmakeMove();
      sc += (Math.random() - 0.5) * 2 * (cfg.noise || 0);
      if (sc > bestSc) { bestSc = sc; best = m; }
    }
    return best;
  }

  /**
   * Decide what the computer does on its turn. cb({ ask: id }) to ask a question, or cb({ move, guess }) with the move to make
   * and the square of the enemy piece to guess afterwards (-1 for no guess).
   */
  function choose(game, fullMoves, startFen, level, color, cb, mySel0) {
    const cfg = LV[level] || LV.medium;
    const g = game;
    const play = (move, guess) => cb({ move, guess: guess == null ? -1 : guess });
    const mv = g.legalMoves();
    if (!mv.length) { cb({ move: null, guess: -1 }); return; }
    if (cfg.random) {
      const foes = [];
      for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } if (g.board[s] && colorOf(g.board[s]) === other(color)) foes.push(s); }
      play(mv[Math.floor(Math.random() * mv.length)], Math.random() < 0.06 && foes.length ? foes[Math.floor(Math.random() * foes.length)] : -1);
      return;
    }
    const b = infer(startFen, fullMoves, color, mySel0 != null ? mySel0 : g.secretQueen[color], cfg.forget);
    const bel = beliefs(b, color, cfg);
    let top = null, topP = 0;
    for (const p of b.pieces) { const pr = bel.prob.get(p.pid); if (pr > topP) { topP = pr; top = p; } }
    const m = bestMove(g, b, bel, color, cfg);
    // after the move: where would the most likely piece stand? (a piece that is taken by the move ends the game anyway)
    let guess = -1;
    if (top && topP >= cfg.guess) guess = (m.from === top.sq) ? m.to : top.sq;
    play(m, guess);
  }

  /** After its move (game g is the position after it), the question the computer asks: the most useful one for its level. Returns a question id. */
  function question(game, fullMoves, startFen, level, color, mySel0) {
    const cfg = LV[level] || LV.medium;
    if (cfg.random) return GuessQ.LIST[Math.floor(Math.random() * GuessQ.LIST.length)].id;
    const b = infer(startFen, fullMoves, color, mySel0 != null ? mySel0 : game.secretQueen[color], cfg.forget);
    const bel = beliefs(b, color, cfg);
    const q = bestQuestion(b, bel, game, color, cfg);
    return q ? q.id : GuessQ.LIST[0].id;
  }

  window.GuessBot = { arrange, select, choose, question, infer, sample, beliefs, STD, LV };
})();
