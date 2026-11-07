/**
 * Guess Who Chess: the yes / no questions you can ask about the opponent's selected piece, and how they are answered.
 *
 * answer(g, id, color, sq, opts) tells whether the answer is "yes" for a piece of `color` standing on `sq` of position g.
 *   opts.type      the piece type to assume (default: whatever stands there), so the computer can test "what if it were a rook?"
 *   opts.moved     has the piece moved yet? (default: worked out from g's history)
 *   opts.askerSel  the asker's own selected square (for the questions about it)
 * Everything is judged on the actual board: the piece alone moves, everything else stays where it is.
 */
(() => {
  'use strict';
  const other = (c) => (c === WHITE ? BLACK : WHITE);

  /** id, the question as shown, a short form for the move list, and the function that answers it. */
  const LIST = [
    { id: 1,  grp: 'Movement', text: 'Can your piece move right now?', short: 'can move now' },
    { id: 2,  grp: 'Movement', text: 'Can your piece capture one of my pieces right now?', short: 'can capture now' },
    { id: 3,  grp: 'Movement', text: 'Could your piece capture one of my pieces within 3 moves?', short: 'can capture in 3' },
    { id: 4,  grp: 'Movement', text: 'Could your piece capture my selected piece within 2 moves?', short: 'can reach mine in 2' },
    { id: 5,  grp: 'Movement', text: 'Can your piece move diagonally? (pawn captures count)', short: 'moves diagonally' },
    { id: 6,  grp: 'Movement', text: 'Can your piece move along a rank or file?', short: 'moves straight' },
    { id: 7,  grp: 'Movement', text: 'Can your piece move backwards?', short: 'moves backwards' },
    { id: 8,  grp: 'Movement', text: 'Could your piece reach the edge of the board in one move?', short: 'reaches edge' },
    { id: 9,  grp: 'Movement', text: 'Can your piece jump over other pieces?', short: 'jumps' },
    { id: 10, grp: 'Position', text: 'Has your piece moved yet?', short: 'has moved' },
    { id: 11, grp: 'Position', text: 'Is your piece currently blocking another piece?', short: 'blocks a piece' },
    { id: 12, grp: 'Position', text: 'Is your piece still on your two starting ranks?', short: 'on home ranks' },
    { id: 13, grp: 'Position', text: 'Is your piece attacked by one of my pieces right now?', short: 'is attacked' },
    { id: 14, grp: 'Position', text: 'Is your piece defended by one of your other pieces?', short: 'is defended' },
    { id: 15, grp: 'Identity', text: 'Is your piece a pawn?', short: 'is a pawn' },
    { id: 16, grp: 'Identity', text: 'Is your piece a knight or a bishop?', short: 'is a minor piece' },
    { id: 17, grp: 'Identity', text: 'Is your piece a rook or the queen?', short: 'is a major piece' },
    { id: 18, grp: 'Identity', text: 'Is your piece the king?', short: 'is the king' },
  ];
  const BY_ID = {};
  LIST.forEach((q) => { BY_ID[q.id] = q; });

  /** Has the piece of `color` that is selected moved yet? (read from the game so far) */
  function hasMoved(g, color) {
    for (const h of g.history) {
      const m = h.move;
      if (h.mover === color && m && !m.ask && !m.spawn && h.secretFrom >= 0 && h.secretFrom === m.from) return true;
    }
    return false;
  }

  /** Squares-with-a-piece moves for the piece on sq, as if it were the owner's turn. */
  function movesOf(g, sq, type) {
    const ep = g.ep;
    g.ep = -1;
    try { return g._gen(sq, type); } finally { g.ep = ep; }
  }

  /** Can the piece reach a square for which hit(to) is true, in at most `depth` of its own moves (nothing else moves)? */
  function reaches(g, sq, color, type, depth, hit) {
    const piece = color | type;
    const orig = g.board[sq];
    let frontier = [sq];
    const seen = new Set([sq]);
    try {
      g.board[sq] = 0;
      for (let d = 0; d < depth; d++) {
        const next = [];
        for (const at of frontier) {
          g.board[at] = piece;
          let ms;
          try { ms = movesOf(g, at, type); } finally { g.board[at] = 0; }
          for (const m of ms) {
            if (hit(m.to)) return true;
            if (!g.board[m.to] && !seen.has(m.to)) { seen.add(m.to); next.push(m.to); }
          }
        }
        frontier = next;
        if (!frontier.length) break;
      }
      return false;
    } finally { g.board[sq] = orig; }
  }

  function answer(g, id, color, sq, opts) {
    opts = opts || {};
    const type = opts.type || (g.board[sq] & 7);
    const foe = other(color);
    const orig = g.board[sq];
    g.board[sq] = color | type;
    try {
      const mv = () => movesOf(g, sq, type);
      const enemyAt = (to) => !!g.board[to] && (g.board[to] & 24) === foe;
      switch (id) {
        case 1: return mv().length > 0;
        case 2: return mv().some((m) => enemyAt(m.to) || m.flags === 2);
        case 3: return reaches(g, sq, color, type, 3, enemyAt);
        case 4: { const t = opts.askerSel; return t != null && t >= 0 && reaches(g, sq, color, type, 2, (to) => to === t); }
        case 5: return type === 3 || type === 5 || type === 6 || type === 1;
        case 6: return type === 4 || type === 5 || type === 6 || type === 1;
        case 7: return type !== 1;
        case 8: return mv().some((m) => (m.to & 15) === 0 || (m.to & 15) === 7 || (m.to >> 4) === 0 || (m.to >> 4) === 7);
        case 9: return type === 2;
        case 10: return opts.moved != null ? !!opts.moved : hasMoved(g, color);
        case 11: {
          const count = () => {
            const out = new Map();
            for (let s = 0; s < 128; s++) {
              if (s & 0x88) { s += 7; continue; }
              const p = g.board[s];
              if (!p || s === sq) continue;
              out.set(s, movesOf(g, s, p & 7).length);
            }
            return out;
          };
          const before = count();
          g.board[sq] = 0;
          const after = count();
          g.board[sq] = color | type;
          for (const [s, n] of after) if (n > before.get(s)) return true;
          return false;
        }
        case 12: { const r = sq >> 4; return color === WHITE ? r <= 1 : r >= 6; }
        case 13: return g.attacked(sq, foe);
        case 14: return g.attacked(sq, color);
        case 15: return type === 1;
        case 16: return type === 2 || type === 3;
        case 17: return type === 4 || type === 5;
        case 18: return type === 6;
        default: return false;
      }
    } finally { g.board[sq] = orig; }
  }

  window.GuessQ = { LIST, BY_ID, answer, hasMoved };
})();
