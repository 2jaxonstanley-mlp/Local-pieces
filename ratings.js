/**
 * Move strength ratings: Brilliant, Great, Best, Good, Book, Interesting, Inaccuracy, Mistake, Blunder,
 * Missed win, Novelty, Forced, and Checkmate (white/black).
 * Each move is compared with the best move found by a short material search (puzzlegen.js), so it spots hung pieces,
 * missed captures, wins and losses of material and mates; it does not judge purely positional ideas.
 */
(() => {
  'use strict';
  const PG = window.PuzzleGen;

  const RATINGS = {
    brilliant:   { id: 'brilliant',   phrase: 'brilliant',            label: 'Brilliant',    sym: '!!', color: '#26c9c3' },
    great:       { id: 'great',       phrase: 'a great move',         label: 'Great move',   sym: '!',  color: '#26c2a3' },
    best:        { id: 'best',        phrase: 'the best move',        label: 'Best',         sym: '★', color: '#96bc4b' },
    good:        { id: 'good',        phrase: 'a good move',          label: 'Good',         sym: '!',  color: '#2888aa' },
    book:        { id: 'book',        phrase: 'a book move',          label: 'Book',         sym: 'B',  color: '#c9a56b' },
    interesting: { id: 'interesting', phrase: 'interesting',          label: 'Interesting',  sym: '!?', color: '#a050aa' },
    inaccuracy:  { id: 'inaccuracy',  phrase: 'an inaccuracy',        label: 'Inaccuracy',   sym: '?!', color: '#f7c631' },
    mistake:     { id: 'mistake',     phrase: 'a mistake',            label: 'Mistake',      sym: '?',  color: '#e58f2a' },
    blunder:     { id: 'blunder',     phrase: 'a blunder',            label: 'Blunder',      sym: '??', color: '#ca3431' },
    missedwin:   { id: 'missedwin',   phrase: 'a missed win',         label: 'Missed win',   sym: 'X',  color: '#b41e28' },
    novelty:     { id: 'novelty',     phrase: 'a novelty',            label: 'Novelty',      sym: 'N',  color: '#96969a' },
    forced:      { id: 'forced',      phrase: 'forced',               label: 'Forced',       sym: '□',  color: '#78787d' },
    matewhite:   { id: 'matewhite',   phrase: 'checkmate',            label: 'Checkmate',    sym: '#',  color: '#ebebee' },
    mateblack:   { id: 'mateblack',   phrase: 'checkmate',            label: 'Checkmate',    sym: '#',  color: '#19191c' },
    resignwhite: { id: 'resignwhite', phrase: 'a forfeit',            label: 'Forfeit',      sym: '⚑',  color: '#c7c7c7' },
    resignblack: { id: 'resignblack', phrase: 'a forfeit',            label: 'Forfeit',      sym: '⚑',  color: '#2d2d2d' },
  };

  const BOOK_LINES = [
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8',
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d4 e5d4 e1g1 f6e4 f1e1 d7d5',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5 d8e7',
    'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6 f1b5 f8b4 e1g1 e8g8 d2d3 d7d6',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f1c4 g8f6 e1g1 f6e4 f1e1 d7d5 c4d5 d8d5',
    'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5 f1d3 f8e7',
    'e2e4 e7e5 g1f3 d7d6 d2d4 e5d4 f3d4 g8f6 b1c3 f8e7',
    'e2e4 e7e5 b1c3 g8f6 f1c4 f6e4 c3e4 d7d5 c4d5 d8d5',
    'e2e4 e7e5 f2f4 e5f4 g1f3 g7g5 h2h4 g5g4 f3e5',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 c1e3 e7e5',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 d7d6 c1g5 e7e6',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6 f1d3 g8f6 e1g1 d8c7',
    'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6',
    'e2e4 c7c5 c2c3 d7d5 e4d5 d8d5 d2d4 g8f6 g1f3 c8g4',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7 g5e7 d8e7',
    'e2e4 e7e6 d2d4 d7d5 b1c3 f8b4 e4e5 c7c5 a2a3 b4c3 b2c3 g8e7',
    'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6 h2h4 h7h6 g1f3 b8d7',
    'e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1e2 c6c5',
    'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c7c6',
    'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8',
    'e2e4 g7g6 d2d4 f8g7 b1c3 d7d6 g1f3 g8f6',
    'e2e4 g8f6 e4e5 f6d5 d2d4 d7d6 g1f3 c8g4',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 h7h6 g5h4 b7b6',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 e7e6 e2e3 b8d7 f1d3 d5c4',
    'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5 e1g1 a7a6',
    'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5 c2c3 b8c6 b1d2 f8d6',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5 g1f3 c7c5 e1g1',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7 f1g2 f8e7 e1g1 e8g8',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5',
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7',
    'd2d4 g8f6 g1f3 g7g6 c1f4 f8g7 e2e3 d7d6 h2h3 e8g8',
    'd2d4 f7f5 g2g3 g8f6 f1g2 e7e6 g1f3 f8e7 e1g1 e8g8',
    'd2d4 e7e6 e2e4 d7d5 b1c3 g8f6',
    'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5 f1g2 d5b6',
    'c2c4 g8f6 b1c3 e7e6 e2e4 d7d5 e4e5 d5d4 e5f6 d4c3 b2c3 d8f6',
    'c2c4 c7c5 g1f3 g8f6 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7',
    'c2c4 e7e6 g1f3 d7d5 g2g3 g8f6 f1g2 f8e7 e1g1 e8g8 d2d4 d5c4',
    'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7 d2d3 e8g8 b1d2 c7c5',
    'g1f3 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 d2d4 e8g8',
    'g1f3 d7d5 d2d4 g8f6 c2c4 e7e6 b1c3 f8e7',
    'g1f3 c7c5 c2c4 b8c6 b1c3 g8f6 d2d4 c5d4 f3d4 e7e6',
    'b2b3 e7e5 c1b2 b8c6 e2e3 d7d5 f1b5 f8d6',
  ];


  /* Opening names. A move is named after the longest listed line it continues. */
  const OPENINGS = [
    ['e2e4', "King's Pawn Opening"],
    ['e2e4 e7e5', "King's Pawn Game"],
    ['e2e4 e7e5 g1f3', "King's Knight Opening"],
    ['e2e4 e7e5 g1f3 b8c6 f1b5', 'Ruy Lopez'],
    ['e2e4 e7e5 g1f3 b8c6 f1b5 a7a6', 'Ruy Lopez: Morphy Defense'],
    ['e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1', 'Ruy Lopez: Closed'],
    ['e2e4 e7e5 g1f3 b8c6 f1b5 g8f6', 'Ruy Lopez: Berlin Defense'],
    ['e2e4 e7e5 g1f3 b8c6 f1c4', 'Italian Game'],
    ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5', 'Italian Game: Giuoco Piano'],
    ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3', 'Italian Game: Giuoco Pianissimo'],
    ['e2e4 e7e5 g1f3 b8c6 f1c4 g8f6', 'Italian Game: Two Knights Defense'],
    ['e2e4 e7e5 g1f3 b8c6 d2d4', 'Scotch Game'],
    ['e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6', 'Scotch Game: Classical'],
    ['e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f1c4', 'Scotch Gambit'],
    ['e2e4 e7e5 g1f3 b8c6 b1c3 g8f6', 'Four Knights Game'],
    ['e2e4 e7e5 g1f3 g8f6', "Petrov's Defense"],
    ['e2e4 e7e5 g1f3 d7d6', 'Philidor Defense'],
    ['e2e4 e7e5 b1c3', 'Vienna Game'],
    ['e2e4 e7e5 f2f4', "King's Gambit"],
    ['e2e4 e7e5 f2f4 e5f4', "King's Gambit Accepted"],
    ['e2e4 e7e5 f2f4 e5f4 g1f3 g7g5 h2h4 g5g4 f3e5', "King's Gambit: Kieseritzky"],
    ['e2e4 c7c5', 'Sicilian Defense'],
    ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6', 'Sicilian Defense: Najdorf'],
    ['e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 d7d6', 'Sicilian Defense: Classical'],
    ['e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 d7d6 c1g5', 'Sicilian Defense: Richter-Rauzer'],
    ['e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6', 'Sicilian Defense: Kan'],
    ['e2e4 c7c5 b1c3', 'Sicilian Defense: Closed'],
    ['e2e4 c7c5 c2c3', 'Sicilian Defense: Alapin'],
    ['e2e4 e7e6', 'French Defense'],
    ['e2e4 e7e6 d2d4 d7d5 b1c3 g8f6', 'French Defense: Classical'],
    ['e2e4 e7e6 d2d4 d7d5 b1c3 f8b4', 'French Defense: Winawer'],
    ['e2e4 e7e6 d2d4 d7d5 e4e5', 'French Defense: Advance'],
    ['e2e4 c7c6', 'Caro-Kann Defense'],
    ['e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4', 'Caro-Kann Defense: Classical'],
    ['e2e4 c7c6 d2d4 d7d5 e4e5', 'Caro-Kann Defense: Advance'],
    ['e2e4 d7d5', 'Scandinavian Defense'],
    ['e2e4 d7d6', 'Pirc Defense'],
    ['e2e4 g7g6', 'Modern Defense'],
    ['e2e4 g8f6', "Alekhine's Defense"],
    ['d2d4', "Queen's Pawn Opening"],
    ['d2d4 d7d5', "Queen's Pawn Game"],
    ['d2d4 d7d5 c2c4', "Queen's Gambit"],
    ['d2d4 d7d5 c2c4 e7e6', "Queen's Gambit Declined"],
    ['d2d4 d7d5 c2c4 c7c6', 'Slav Defense'],
    ['d2d4 d7d5 c2c4 d5c4', "Queen's Gambit Accepted"],
    ['d2d4 d7d5 g1f3 g8f6 c1f4', 'London System'],
    ['d2d4 g8f6', 'Indian Defense'],
    ['d2d4 g8f6 c2c4 e7e6 b1c3 f8b4', 'Nimzo-Indian Defense'],
    ['d2d4 g8f6 c2c4 e7e6 g1f3 b7b6', "Queen's Indian Defense"],
    ['d2d4 g8f6 c2c4 g7g6', "King's Indian Defense"],
    ['d2d4 g8f6 c2c4 g7g6 b1c3 d7d5', 'Gr\u00fcnfeld Defense'],
    ['d2d4 g8f6 g1f3 g7g6 c1f4', 'London System'],
    ['d2d4 f7f5', 'Dutch Defense'],
    ['c2c4', 'English Opening'],
    ['c2c4 e7e5', 'English Opening: Reversed Sicilian'],
    ['c2c4 c7c5', 'English Opening: Symmetrical'],
    ['g1f3', 'R\u00e9ti Opening'],
    ['g1f3 d7d5 g2g3', "R\u00e9ti Opening: King's Indian Attack"],
    ['b2b3', 'Nimzo-Larsen Attack'],
  ];
  const OPEN = new Map(OPENINGS);
  const SQN = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
  /** The opening name for the first n moves of a game (moves: [{from,to}]), or null. */
  function openingName(moves, n) {
    const u = moves.slice(0, n).map((m) => SQN(m.from) + SQN(m.to));
    for (let k = u.length; k >= 1; k--) { const nm = OPEN.get(u.slice(0, k).join(' ')); if (nm) return nm; }
    return null;
  }

  const boardKey = (g) => { let k = ''; for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } k += String.fromCharCode(48 + g.board[s]); } return k + g.turn; };
  let book = null;
  function buildBook() {
    book = new Map();
    const toSq = (a) => sq(a.charCodeAt(0) - 97, +a[1] - 1);
    for (const line of BOOK_LINES.concat(window.BookLines || [])) {
      const c = new Chess();
      for (const tok of line.split(' ')) {
        const from = toSq(tok.slice(0, 2)), to = toSq(tok.slice(2, 4));
        const m = c.legalMovesFrom(from).find((x) => x.to === to && !x.promo);
        if (!m) break;                                    // never trust a line that is not legal
        const key = boardKey(c);
        if (!book.has(key)) book.set(key, new Set());
        book.get(key).add(from + '-' + to);
        c.makeMove(m);
      }
    }
  }

  /** A private copy of a position so analysing never touches the real game. Keeps Secret Queen state (nothing hidden). */
  function clone(g) {
    const c = new Chess();
    c.mode = g.mode === 'secret' ? 'secret' : 'basic';
    c.board.set(g.board);
    c.turn = g.turn; c.castling = g.castling; c.ep = g.ep; c.halfmove = g.halfmove; c.fullmove = g.fullmove;
    if (g.secretQueen) c.secretQueen = { [WHITE]: g.secretQueen[WHITE], [BLACK]: g.secretQueen[BLACK] };
    if (g.revealed) c.revealed = { [WHITE]: g.revealed[WHITE], [BLACK]: g.revealed[BLACK] };
    c.history = [];
    return c;
  }
  /** Material-only classic copy of a position (for spotting sacrifices). */
  function plain(g) {
    const c = new Chess();
    c.mode = 'basic';
    c.board.set(g.board);
    c.turn = g.turn; c.castling = g.castling; c.ep = g.ep; c.halfmove = g.halfmove; c.fullmove = g.fullmove;
    c.history = [];
    return c;
  }

  const MATE = 100000;
  const isMateScore = (v) => Math.abs(v) > MATE - 200;
  /** Expected score (0 to 1) for the side to move: a centipawn lead matters less the bigger it already is. */
  const wp = (cp) => (cp > MATE - 200 ? 1 : cp < -MATE + 200 ? 0 : 1 / (1 + Math.pow(10, -cp / 400)));
  const same = (a, b) => a.from === b.from && a.to === b.to && (a.promo || 0) === (b.promo || 0) && (a.q || 0) === (b.q || 0);

  /** Facts about move mv in position g (true rules): material before, material once the opponent has taken what it can, mate. */
  function facts(g, mv) {
    const f = { before: 0, afterQs: 0, isMate: false, captured: !!(g.board[mv.to] || mv.flags === 2) };
    PG.setHorizon(true);
    try {
      f.before = PG.evalSide(plain(g));
      g.makeMove(mv);
      f.isMate = !g.hasLegalMove() && g.inCheck(g.turn);
      if (!f.isMate) f.afterQs = -PG.qs(plain(g), -1e6, 1e6, 0);          // material once the opponent has taken what it can
      g.unmakeMove();
    } catch (e) { /* ignore */ } finally { PG.setHorizon(false); }
    return f;
  }

  /** Turn an analysis into a label. A = { top: [{ move, score }], legal }, P = the score of this move. */
  function classify(g, mv, f, A, P, bookInfo) {
    const B = A.top[0].score;
    const wB = wp(B), wP = wp(P);
    const loss = Math.max(0, wB - Math.min(wP, wB));
    const second = A.top.length > 1 ? wp(A.top[1].score) : 0;
    const gap = A.top.length > 1 ? wB - second : 1;              // how far the best move stands out from the next one
    const sac = f.afterQs <= f.before - 150;                      // gives up material that the opponent can really take
    const bigSac = f.afterQs <= f.before - 250;
    const top = same(A.top[0].move, mv) || loss <= 0.004;

    // missed a forced mate or a decisive win
    if ((B > MATE - 100 && !(P > MATE - 100) && wP >= 0.3) || (wB >= 0.9 && wP >= 0.5 && wP < 0.72 && loss >= 0.2)) return RATINGS.missedwin;

    let r = null;
    if (loss <= 0.008) {
      if (bigSac && wP >= 0.42 && f.before < 500) r = RATINGS.brilliant;
      else if (top && gap >= 0.13 && wB >= 0.3 && wB < 0.97 && A.legal > 2 && !f.captured) r = RATINGS.great;
      else if (top && gap >= 0.035) r = RATINGS.best;
    } else if (loss <= 0.07 && sac && wP >= 0.38 && !f.captured) r = RATINGS.interesting;
    else if (loss <= 0.03 && gap >= 0.035) r = RATINGS.good;
    else if (loss <= 0.07) r = null;
    else if (loss <= 0.14) r = RATINGS.inaccuracy;
    else if (loss <= 0.25) r = RATINGS.mistake;
    else r = RATINGS.blunder;

    // first departure from known theory is a novelty when the move is still sound
    if (bookInfo && bookInfo.inBook && bookInfo.set && bookInfo.set.size && !bookInfo.set.has(mv.from + '-' + mv.to) && loss <= 0.03) return RATINGS.novelty;
    return r;
  }

  function bookOf(g) {
    if (!book) buildBook();
    const inBook = g.mode !== 'secret' && g.fullmove <= 13;
    return { inBook, set: inBook ? book.get(boardKey(g)) : null };
  }

  /** True when move m is the next move of a known opening line (cheap: no search). Used for the Book label while a game is played. */
  function isBook(g0, m) {
    try {
      if (g0.mode === 'secret') return false;
      const g = clone(g0);
      const bk = bookOf(g);
      return !!(bk.set && bk.set.has(m.from + '-' + m.to));
    } catch (e) { return false; }
  }

  /**
   * Full analysis of one move for the Analyze feature. Returns { rating, best, bestScore, playedScore, top, depth, book, forced, isMate }.
   * ms / depth control how thorough the search is.
   */
  function analyse(g0, m, ms, depth, q) {
    const g = clone(g0);
    const legal = g.legalMoves();
    const mv = legal.find((x) => same(x, m));
    const out = { rating: null, best: null, bestScore: 0, playedScore: 0, top: [], depth: 0, book: false, forced: legal.length <= 1, isMate: false, legal: legal.length, facts: null };
    if (!mv) return out;
    if (legal.length <= 1) { out.rating = RATINGS.forced; out.best = mv; return out; }
    const bk = bookOf(g);
    const f = facts(g, mv);
    out.facts = f;
    if (bk.set && bk.set.has(mv.from + '-' + mv.to)) { out.rating = RATINGS.book; out.book = true; }
    if (f.isMate) { out.rating = g.turn === WHITE ? RATINGS.matewhite : RATINGS.mateblack; out.isMate = true; out.best = mv; return out; }
    const A = window.AIAnalyse.run(g0, mv, ms || 900, depth || 11, q);
    if (!A.top.length) return out;
    out.top = A.top.map((t) => ({ move: legal.find((x) => same(x, t.move)) || t.move, score: t.score }));
    out.best = out.top[0].move; out.bestScore = out.top[0].score; out.depth = A.depth;
    out.playedScore = A.played ? A.played.score : out.bestScore - 400;
    if (!out.book) out.rating = A.played ? classify(g, mv, f, A, A.played.score, bk) : null;
    out.wBest = wp(out.bestScore); out.wPlayed = wp(out.playedScore);
    return out;
  }

  /** The strength of move m (a legal move of position g0 before it was played). Returns one of RATINGS, or null for an ordinary move. */
  function rate(g0, m) {
    const g = clone(g0);
    const legal = g.legalMoves();
    if (legal.length <= 1) return RATINGS.forced;
    const mv = legal.find((x) => same(x, m));
    if (!mv) return null;
    const bk = bookOf(g);
    if (bk.set && bk.set.has(mv.from + '-' + mv.to)) return RATINGS.book;
    const f = facts(g, mv);
    if (f.isMate) return g.turn === WHITE ? RATINGS.matewhite : RATINGS.mateblack;
    const A = window.AIAnalyse.run(g0, mv, 450, 9);
    if (!A.top.length || !A.played) return null;
    return classify(g, mv, f, A, A.played.score, bk);
  }

  /**
   * A sacrifice that breaks up the enemy's defence: it gives up real material, but it takes (or lands next to) the pieces and pawns
   * round the enemy king, or a central pawn. Only counts when the search says the position is still as good as the best move
   * (within `slack` centipawns), so it is never a plain loss of material.
   */
  function breaksDefence(g, mv, f, score, bestScore) {
    if (!f || f.isMate || f.afterQs > f.before - 100) return false;          // not a real sacrifice
    if (score < bestScore - 30 || score < -150 || bestScore > 900) return false;   // it would cost something, or the position is already lost / won
    const me = g.turn, foe = me === WHITE ? BLACK : WHITE;
    let ks = -1;
    for (let s = 0; s < 128; s++) { if (s & 0x88) continue; const p = g.board[s]; if (p && (p & 24) === foe && (p & 7) === 6) { ks = s; break; } }
    if (ks < 0) return false;
    const dist = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 4) - (b >> 4)));
    const tgt = g.board[mv.to];
    const takes = tgt && (tgt & 24) === foe && (tgt & 7) !== 6;
    if (takes && dist(mv.to, ks) <= 2) return true;                          // takes a defender of the king
    if (dist(mv.to, ks) <= 1) return true;                                    // lands right next to the king
    if (takes && (tgt & 7) === 1 && ((mv.to & 7) === 3 || (mv.to & 7) === 4)) return true;   // takes a central pawn
    return false;
  }

  /** The analysis' top moves [{ move, score }], with a defence-breaking sacrifice moved to the front when it is just as good. */
  function sacOrder(g0, list) {
    try {
      if (!list || list.length < 2) return list;
      const g = clone(g0);
      const best = list[0].score;
      for (let i = 1; i < list.length; i++) {
        const mv = g.legalMoves().find((x) => same(x, list[i].move));
        if (!mv) continue;
        if (breaksDefence(g, mv, facts(g, mv), list[i].score, best)) return [list[i]].concat(list.filter((_, j) => j !== i));
      }
    } catch (e) { /* keep the order */ }
    return list;
  }

  const ORDER = { brilliant: 7, great: 6, best: 5, book: 5, novelty: 4, interesting: 3, good: 3, none: 2, inaccuracy: 1, mistake: 0, blunder: -1, missedwin: -1 };
  /**
   * For the Insane computer: check the move it chose the way the labels will. If it would be labelled an inaccuracy,
   * mistake, blunder or missed win it is swapped for the best-labelled of the analysis' top three moves, and a
   * sound sacrifice (brilliant / interesting at no cost) is preferred over an ordinary move of the same strength.
   */
  function polish(g0, pick) {
    const g = clone(g0);
    const legal = g.legalMoves();
    const mv = legal.find((x) => same(x, pick));
    if (!mv || legal.length <= 1) return pick;
    const A = window.AIAnalyse.run(g0, mv, 450, 9);
    if (!A.top.length || !A.played) return pick;
    const bk = bookOf(g);
    const cands = [{ move: mv, score: A.played.score }];
    A.top.forEach((t) => { if (!cands.some((c) => same(c.move, t.move))) cands.push({ move: legal.find((x) => same(x, t.move)) || t.move, score: t.score }); });
    let bestC = null, bestK = -9;
    cands.forEach((c, i) => {
      const f = facts(g, c.move);
      let rid;
      if (f.isMate) rid = 'brilliant';
      else if (bk.set && bk.set.has(c.move.from + '-' + c.move.to)) rid = 'book';
      else { const rr = classify(g, c.move, f, A, c.score, bk); rid = rr ? rr.id : 'none'; }
      // the engine's own choice wins ties; a sound sacrifice beats a plain move of equal rank
      let k = ORDER[rid] + (i === 0 ? 0.5 : 0) + c.score / 1e7;
      // a sacrifice that wrecks the enemy's defence is preferred over an equal quiet move (never over a move the labels would mark down)
      if (ORDER[rid] >= ORDER.none && breaksDefence(g, c.move, f, c.score, A.top[0].score)) k = Math.max(k, 5.6);
      if (k > bestK) { bestK = k; bestC = c; }
    });
    return bestC ? (legal.find((x) => same(x, bestC.move)) || pick) : pick;
  }

  /* Optional artwork: drop icon-<id>.png into the game folder and they replace the text symbols automatically. */
  for (const x of Object.values(RATINGS)) {
    x.img = 'icon-' + x.id + '.png';
    if (typeof Image !== 'undefined') {          // (not in the analysis worker)
      const im = new Image();
      im.onload = () => { x.hasImg = true; };
      im.src = x.img;
    }
  }
  const iconHtml = (x) => (x.hasImg ? `<img class="ri" src="${x.img}" alt="${x.label}">` : x.sym.replace(/&/g, '&amp;').replace(/</g, '&lt;'));

  window.MoveRating = { rate, polish, sacOrder, clone, iconHtml, openingName, isBook, analyse, wp, MATE, RATINGS, get: (id) => RATINGS[id] || null };
})();
