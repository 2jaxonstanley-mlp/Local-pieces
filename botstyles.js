/**
 * Bots with a personality, played by the real Stockfish engine (see stockfish-bridge.js):
 *
 *   Patricia      about 3200  Attacks. Hates draws. Among the engine's best two or three moves she picks the one that sacrifices
 *                             material or opens lines toward the enemy king, and quiet moves are marked down a little.
 *   Mr. Brilliant about 3000  Hunts for brilliant moves. Asks the engine for its top four lines and picks the one that gives up material
 *                             for the attack (a classic sacrifice, where the material drops for a moment) or is a sharp tactical shot.
 *
 * Both now also: use the Full engine when it is already loaded (the Lite one otherwise), play their own sharp opening lines, play the plain best
 * move when they are winning big (no gimmicks), go wilder when they are losing, and avoid quiet trades when the game is level.
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


  /* Their own opening lines (uci). While the game so far matches the start of a line, the next move of the line is played (if it is legal). */
  const BOOK = {
    patricia: [
      'e2e4 e7e5 f2f4 e5f4 g1f3 g7g5 h2h4 g5g4 f3e5',        // King's Gambit, Kieseritzky
      'e2e4 e7e5 d2d4 e5d4 c2c3 d4c3 f1c4 c3b2 c1b2',        // Danish Gambit
      'e2e4 c7c5 b1c3 b8c6 f2f4 g7g6 g1f3 f8g7 f1b5',        // Grand Prix Attack
      'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8',             // keeps it solid when she cannot attack
      'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6',   // Sicilian Dragon as Black
      'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5',   // Evans Gambit
      'd2d4 d7d5 c2c4 e7e5 d4e5 d5d4 g1f3 b8c6 g2g3 c8g4',   // Albin Counter-Gambit
      'd2d4 g8f6 c2c4 c7c5 d4d5 b7b5 c4b5 a7a6',             // Benko Gambit
    ],
    brilliant: [
      'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 c6a5 c4b5 c7c6 d5c6 b7c6 b5e2 h7h6 g5f3 e5e4 f3e5 f8d6',   // Two Knights, the Fried Liver structure
      'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4 e5d4 e1g1 d7d6',                              // Evans Gambit
      'e2e4 c7c5 d2d4 c5d4 c2c3 d4c3 b1c3 b8c6 g1f3 d7d6 f1c4 e7e6 e1g1 a7a6',                              // Smith-Morra Gambit
      'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c7c6 f1c4 c8f5',                                         // Scandinavian
      'e2e4 e7e5 f2f4 e5f4 f1c4 d8h4 e1f1 g8f6',                                                             // Bishop's Gambit
      'd2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 f8e7 g1f3 e8g8',
      'd2d4 d7d5 c2c4 e7e5 d4e5 d5d4 g1f3 b8c6 g2g3 c8g4 f1g2 d8d7',                                         // Albin Counter-Gambit
      'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8b4 e4e5 h7h6 g5d2 b4c3 b2c3 f6e4',                              // French, Winawer
    ],
  };
  const uciOf = (m) => 'abcdefgh'[m.from & 15] + ((m.from >> 4) + 1) + 'abcdefgh'[m.to & 15] + ((m.to >> 4) + 1) + (m.promo ? 'xxnbrq'[m.promo] || '' : '');
  function bookMove(g, level) {
    const hist = g.history.filter((h) => h && h.move && !h.ask).map((h) => uciOf(h.move));
    if (hist.length > 14 || hist.length !== g.history.length) return null;
    const next = [];
    for (const line of BOOK[level] || []) {
      const mv = line.split(' ');
      if (hist.length >= mv.length) continue;
      if (hist.every((u, i) => u === mv[i])) next.push(mv[hist.length]);
    }
    const legal = next.map((u) => LP.Stockfish.legalOf(g, u)).filter(Boolean);
    return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
  }
  /** Which engine to use: the Full one if it is already loaded, otherwise Lite. */
  const engine = () => (LP.StockfishFull && LP.StockfishFull.available() ? LP.StockfishFull : LP.Stockfish);
  const total = (g) => mat(g, WHITE) + mat(g, BLACK);
  /** Is this a real brilliant move? (checked with the game's own move rating; only done for one or two candidates, it takes a moment) */
  function isBrilliant(g, m) {
    try { const r = window.MoveRating && window.MoveRating.rate(g, m); return !!r && r.id === 'brilliant'; } catch (e) { return false; }
  }

  const STYLE = {
    // window: how far (centipawns) below the best line a move may be and still be chosen
    patricia(lines, g, o) {
      const best = lines[0].score;
      if (best > MATE - 200) return lines[0];                      // a forced mate is simply played
      if (best > 450) return lines[0];                             // clearly winning: no gimmicks, she finishes it
      const losing = best < -120, winning = best > 250, tot = total(g);
      const win = winning ? 22 : losing ? 95 : 50;                 // behind, she gambles more; ahead, she stays close to the best move
      const pool = lines.slice(0, 4).filter((l) => l.score >= best - win || l === lines[0]);
      let pick = pool[0], top = -1e9;
      for (const l of pool) {
        const f = features(g, l) || {};
        let adj = l.score;
        const sac = Math.max(0, -(f.minDiff || 0), f.sacFirst > 1 && f.endDiff < 0 ? f.sacFirst : 0);
        if (sac >= 2) adj += Math.min(70, 24 * sac) * (losing ? 1.4 : 1);   // gives up material for the attack
        adj += Math.max(-10, Math.min(40, 8 * (f.zone || 0))) * (winning ? 0.5 : 1);   // opens lines toward the enemy king
        if (f.check) adj += 10;
        if (f.capture) adj += 8;
        if (f.promo) adj += 20;
        if (f.capture && f.sacFirst === 0 && !winning && tot > 14) adj -= 12;     // she does not like even trades while there is still an attack to make
        if (!f.capture && !f.check && !f.pawn && (f.zone || 0) <= 0) adj -= 14;   // a quiet move
        if (f.stale) adj -= 5000;                                  // she would rather lose than stalemate
        if (Math.abs(l.score) < 25) adj -= 35;                     // a drawish line
        if (o.repeats && o.repeats(LP.Stockfish.legalOf(g, l.move))) adj -= 150;  // never repeats the position if there is another way
        adj += Math.random() * 4;
        if (adj > top) { top = adj; pick = l; }
      }
      return pick;
    },
    brilliant(lines, g, o) {
      const best = lines[0].score;
      if (best > MATE - 200) return lines[0];
      if (best > 400) return lines[0];                             // a won game is not the time to show off
      const losing = best < -200;
      const floor = losing ? best - 160 : Math.max(best - 130, best > 0 ? -50 : best - 130);   // takes risks, but never throws away a won game
      const pool = lines.slice(0, 5).filter((l) => l.score >= floor || l === lines[0]);
      const rows = pool.map((l) => {
        const f = features(g, l) || {};
        const drop = Math.max(0, -(f.minDiff || 0));              // the evaluation (material) falls for a moment: a classic sacrifice
        const sac = Math.max(drop, f.sacFirst > 1 && f.endDiff < 0 ? f.sacFirst : 0);
        return { l, f, sac, adj: l.score };
      });
      let checked = 0;
      let pick = pool[0], top = -1e9;
      for (const r of rows) {
        const f = r.f, sac = r.sac;
        if (sac >= 1) r.adj += Math.min(100, 28 * sac) * (losing ? 1.3 : 1);
        if (sac >= 2 && f.endDiff >= 0) r.adj += 25;               // and it comes back with interest: the best kind
        if (f.check) r.adj += 14;
        if (f.capture && f.sacFirst > 0) r.adj += 12;              // takes something with a more valuable piece
        if (f.promo) r.adj += 25;
        if (f.zone > 1) r.adj += 6 * f.zone;
        if (f.stale) r.adj -= 5000;
        if (!sac && !f.check && !f.capture) r.adj -= 8;            // a plain move
        if (o.repeats && o.repeats(LP.Stockfish.legalOf(g, r.l.move))) r.adj -= 80;
        r.adj += Math.random() * 6;
      }
      rows.sort((a, b) => b.adj - a.adj);
      for (const r of rows.slice(0, 2)) {                          // the two most promising: is one a genuinely brilliant move by the game's own rating?
        if (r.sac >= 1 && checked < 2) { checked++; const m = LP.Stockfish.legalOf(g, r.l.move); if (m && isBrilliant(g, m)) r.adj += 45; }
      }
      for (const r of rows) if (r.adj > top) { top = r.adj; pick = r.l; }
      return pick;
    },
  };

  function pick(g, level, ms, o) {
    const SF = engine(), style = STYLE[level];
    if (!SF || !style) return Promise.resolve(null);
    const bm = LP.Stockfish && bookMove(g, level);                 // her own opening lines first
    if (bm) return Promise.resolve(bm);
    return SF.analyse(g.toFen(), { movetime: Math.max(80, Math.round((ms || 1000) * 1.2)), multipv: level === 'brilliant' ? 5 : 4 }).then((r) => {
      if (!r || !r.lines || !r.lines.length) return null;
      const lines = r.lines.slice().sort((a, b) => b.score - a.score);
      let l = null;
      try { l = style(lines, g, o || {}); } catch (e) { l = lines[0]; }
      return SF.legalOf(g, (l || lines[0]).move);
    });
  }

  LP.BotStyle = { pick, features, mat };
})();
