/**
 * Bots with a personality, played by the real Stockfish engine (see stockfish-bridge.js):
 *
 *   Patricia      about 3200  Attacks. Hates draws. Among the engine's best two or three moves she picks the one that sacrifices
 *                             material or opens lines toward the enemy king, and quiet moves are marked down a little.
 *   Mr. Brilliant about 3000  Hunts for brilliant moves. Asks the engine for its top four lines and picks the one that gives up material
 *                             for the attack (a classic sacrifice, where the material drops for a moment) or is a sharp tactical shot.
 *
 * LP.BotStyle.pick(game, 'patricia' | 'brilliant', ms, { repeats(move) -> bool }) -> Promise<legal move | null>
 * It resolves null if Stockfish is not available, and the game then plays its own engine instead.
 */
(() => {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const VAL = [0, 1, 3, 3, 5, 9, 0];
  const WHITE = 8, BLACK = 16;
  const MATE = 100000;

  /** Material of one colour. */
  function mat(g, c) {
    let t = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = g.board[s];
      if (p && (p & 24) === c) t += VAL[p & 7];
    }
    return t;
  }
  /** How many squares around the enemy king (and the king's own square) `by` attacks. */
  function zone(g, by) {
    const foe = by === WHITE ? BLACK : WHITE, k = g.kingSquare(foe);
    if (k < 0) return 0;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
      const s = k + dr * 16 + df;
      if (!(s & 0x88) && g.attacked(s, by)) n++;
    }
    return n;
  }
  /** What a move does, judged by playing the engine's own line a few moves ahead on a scratch board. */
  function features(g, line) {
    const me = g.turn, c = new g.constructor();
    if (c.loadFen(g.toFen())) return null;
    const start = mat(c, me) - mat(c, me === WHITE ? BLACK : WHITE), z0 = zone(c, me);
    const first = LP.Stockfish.legalOf(c, line.move);
    if (!first) return null;
    const f = { capture: !!(c.board[first.to] || first.flags === 2), promo: !!first.promo, pawn: (c.board[first.from] & 7) === 1, minDiff: 0, endDiff: 0, check: false, zone: 0, stale: false, mate: line.score > MATE - 200 };
    const movedVal = VAL[c.board[first.from] & 7], gotVal = VAL[c.board[first.to] & 7];
    c.makeMove(first);
    f.check = c.inCheck(c.turn);
    f.zone = zone(c, me) - z0;
    f.stale = !c.hasLegalMove() && !f.check;
    f.sacFirst = movedVal - gotVal;   // the piece it moves minus what it takes
    let lo = 0, last = 0;
    const pv = line.pv || [];
    for (let k = 1; k < Math.min(pv.length, 5); k++) {   // the next four plies of the line: how far does the material fall, and does it come back?
      const m = LP.Stockfish.legalOf(c, pv[k]);
      if (!m) break;
      c.makeMove(m);
      const d = mat(c, me) - mat(c, me === WHITE ? BLACK : WHITE) - start;
      if (k <= 3 || k === 4) { lo = Math.min(lo, d); last = d; }
    }
    if (pv.length < 2) last = 0;
    f.minDiff = lo;     // the lowest material balance reached (0 = never behind where it started)
    f.endDiff = last;   // and where the line leaves it
    return f;
  }

  const STYLE = {
    // window: how far (centipawns) below the best line a move may be and still be chosen
    patricia(lines, g, o) {
      const best = lines[0].score;
      if (best > MATE - 200) return lines[0];                      // a forced mate is simply played
      const pool = lines.slice(0, 3).filter((l) => l.score >= best - 45 || l === lines[0]);
      let pick = pool[0], top = -1e9;
      for (const l of pool) {
        const f = features(g, l) || {};
        let adj = l.score;
        const sac = Math.max(0, -(f.minDiff || 0), f.sacFirst > 1 && f.endDiff < 0 ? f.sacFirst : 0);
        if (sac >= 2) adj += Math.min(60, 22 * sac);               // gives up material for the attack
        adj += Math.max(-10, Math.min(36, 7 * (f.zone || 0)));     // opens lines toward the enemy king
        if (f.check) adj += 10;
        if (f.capture) adj += 8;
        if (f.promo) adj += 20;
        if (!f.capture && !f.check && !f.pawn && (f.zone || 0) <= 0) adj -= 14;   // a quiet move
        if (f.stale) adj -= 5000;                                  // she would rather lose than stalemate
        if (Math.abs(l.score) < 25) adj -= 35;                     // a drawish line
        if (o.repeats && o.repeats(LP.Stockfish.legalOf(g, l.move))) adj -= 120;   // never repeats the position if there is another way
        adj += Math.random() * 4;
        if (adj > top) { top = adj; pick = l; }
      }
      return pick;
    },
    brilliant(lines, g, o) {
      const best = lines[0].score;
      if (best > MATE - 200) return lines[0];
      const floor = Math.max(best - 130, best > 0 ? -50 : best - 130);   // takes risks, but never throws away a won game
      const pool = lines.slice(0, 4).filter((l) => l.score >= floor || l === lines[0]);
      let pick = pool[0], top = -1e9;
      for (const l of pool) {
        const f = features(g, l) || {};
        let adj = l.score;
        const drop = Math.max(0, -(f.minDiff || 0));              // the evaluation (material) falls for a moment: a classic sacrifice
        const sac = Math.max(drop, f.sacFirst > 1 && f.endDiff < 0 ? f.sacFirst : 0);
        if (sac >= 1) adj += Math.min(95, 28 * sac);
        if (sac >= 2 && f.endDiff >= 0) adj += 25;                 // and it comes back with interest: the best kind
        if (f.check) adj += 14;
        if (f.capture && f.sacFirst > 0) adj += 12;                // takes something with a more valuable piece
        if (f.promo) adj += 25;
        if (f.zone > 1) adj += 6 * f.zone;
        if (f.stale) adj -= 5000;
        if (!sac && !f.check && !f.capture) adj -= 8;              // a plain move
        adj += Math.random() * 6;
        if (adj > top) { top = adj; pick = l; }
      }
      return pick;
    },
  };

  function pick(g, level, ms, o) {
    const SF = LP.Stockfish, style = STYLE[level];
    if (!SF || !style) return Promise.resolve(null);
    return SF.analyse(g.toFen(), { movetime: Math.max(60, ms || 1000), multipv: level === 'brilliant' ? 4 : 3 }).then((r) => {
      if (!r || !r.lines || !r.lines.length) return null;
      const lines = r.lines.slice().sort((a, b) => b.score - a.score);
      let l = null;
      try { l = style(lines, g, o || {}); } catch (e) { l = lines[0]; }
      return SF.legalOf(g, (l || lines[0]).move);
    });
  }

  LP.BotStyle = { pick, features };
})();
