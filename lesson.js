/**
 * First-time lesson. When the app tour ends the game asks "Is this your first time playing chess?". If yes, this guided lesson opens:
 * a board that walks through every piece (arrows and dots appear one at a time), then special moves (castling, promotion, en passant,
 * jumping ahead to later positions) and what check, checkmate and stalemate are. It ends by starting a game against the Easy bot.
 *
 *   LP.lesson.ask()    asks the question (once); LP.lesson.start() opens the lesson any time
 */
(() => {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const $ = (s) => document.querySelector(s);
  const ASKED = 'localPieces.lessonAsked';
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /* hl: squares to pulse. moves: show the legal moves of the piece on that square (dots). arrows: [from, to, 'g' | 'r'] shown one by one. */
  const STEPS = [
    { fen: START, t: 'Welcome to chess', d: 'Two players, White and Black, take turns. White moves first. You win by trapping the enemy king: that is called checkmate. Let us meet the pieces.' },
    { fen: START, t: 'The pawn', hl: ['e2'], moves: 'e2', arrows: [['e2', 'e4', 'g'], ['e2', 'e3', 'g']], d: 'Pawns only move forward. On its very first move a pawn may go one square or two squares.' },
    { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', t: 'After that, one square', hl: ['e4'], moves: 'e4', arrows: [['e4', 'e5', 'g']], d: 'Once a pawn has moved, it can only go one square at a time.' },
    { fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', t: 'Pawns capture sideways', hl: ['e4', 'd5'], moves: 'e4', arrows: [['e4', 'd5', 'r']], d: 'A pawn moves straight but captures one square diagonally forward. It cannot capture the piece right in front of it.' },
    { fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', t: 'The rook', hl: ['d4'], moves: 'd4', arrows: [['d4', 'd8', 'g'], ['d4', 'h4', 'g'], ['d4', 'a4', 'g'], ['d4', 'd1', 'g']], d: 'Rooks slide any distance in straight lines: up, down, left and right.' },
    { fen: '4k3/8/8/8/3B4/8/8/4K3 w - - 0 1', t: 'The bishop', hl: ['d4'], moves: 'd4', arrows: [['d4', 'a7', 'g'], ['d4', 'h8', 'g'], ['d4', 'a1', 'g'], ['d4', 'g1', 'g']], d: 'Bishops slide any distance diagonally. Each bishop stays on its own colour of square for the whole game.' },
    { fen: START, t: 'The knight', hl: ['g1'], moves: 'g1', arrows: [['g1', 'f3', 'g'], ['g1', 'h3', 'g']], d: 'Knights move in an L shape: two squares one way, then one to the side. They are the only piece that can jump over others.' },
    { fen: '4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1', t: 'The queen', hl: ['d4'], moves: 'd4', arrows: [['d4', 'd8', 'g'], ['d4', 'h4', 'g'], ['d4', 'a7', 'g'], ['d4', 'g7', 'g'], ['d4', 'a1', 'g']], d: 'The queen is the strongest piece. She moves like a rook and a bishop together.' },
    { fen: '4k3/8/8/8/3K4/8/8/8 w - - 0 1', t: 'The king', hl: ['d4'], moves: 'd4', arrows: [['d4', 'd5', 'g'], ['d4', 'e5', 'g'], ['d4', 'c3', 'g']], d: 'The king moves one square in any direction. It is the most important piece, and it can never step onto a square that is attacked.' },
    { fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', t: 'Castling', hl: ['e1', 'h1'], moves: 'e1', arrows: [['e1', 'g1', 'g'], ['h1', 'f1', 'g']], d: 'Once per game, the king hops two squares towards a rook and the rook jumps over it. It tucks your king away safely. The squares between must be empty, and the king cannot castle out of, through or into check.' },
    { fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', t: 'Promotion', hl: ['a7'], moves: 'a7', arrows: [['a7', 'a8', 'g']], d: 'A pawn that reaches the far end of the board turns into any piece you like (not a king). Almost everyone picks a queen.' },
    { fen: 'rnbqkbnr/ppp1pppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2', t: 'Later in a game: en passant', hl: ['e5'], arrows: [['d7', 'd5', 'r']], d: 'Here is a special rule. Your pawn is on e5. Black now moves a pawn two squares, from d7 to d5, jumping right past yours.' },
    { fen: 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', t: 'En passant', hl: ['d5'], moves: 'e5', arrows: [['e5', 'd6', 'g']], d: 'Because it passed your pawn, you may capture it as if it had only moved one square: your pawn lands on d6. You can only do this on the very next move, or the chance is gone.' },
    { fen: 'rnbqkbnr/ppp1pppp/3P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3', t: 'And it is gone', hl: ['d6'], d: 'The black pawn on d5 was removed, even though your pawn did not land on its square. That is en passant, French for "in passing".' },
    { fen: '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1', t: 'Check', hl: ['e8'], arrows: [['e2', 'e8', 'r']], d: 'When a king is attacked, it is in check. The player in check must get out of it straight away. The game will not let you make any other move.' },
    { fen: '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1', t: 'Three ways out of check', hl: ['e8'], moves: 'e8', arrows: [['e8', 'd8', 'g'], ['e8', 'f8', 'g']], d: 'You can move the king to a safe square, block the attack with another piece, or capture the piece giving check.' },
    { fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', t: 'Checkmate', hl: ['e1'], arrows: [['h4', 'e1', 'r']], d: 'If a king is in check and there is no way out, that is checkmate. The game is over and the player who gave the check wins. This is one of the fastest checkmates in chess, after only two moves each.' },
    { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', t: 'Stalemate', hl: ['h8'], d: 'If a player is not in check but has no legal move at all, it is stalemate, and the game is a draw. Black cannot move here, but is not attacked. Be careful when you are winning!' },
    { fen: START, t: 'You are ready', d: 'There is more to learn, like openings and tactics, but you know the rules. The best way to learn now is to play. Start a game against the Easy bot?', last: true },
  ];

  let root = null, i = 0, timers = [], chess = null;
  const sq = (name) => (+name[1] - 1) * 8 + (name.charCodeAt(0) - 97);
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const toIdx88 = (s) => (s >> 4) * 8 + (s & 7);

  function parse(fen) {
    const out = new Array(64).fill('');
    const rows = fen.split(' ')[0].split('/');
    rows.forEach((row, k) => {
      let f = 0;
      for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { out[(7 - k) * 8 + f] = ch; f++; } }
    });
    return out;
  }
  function facts(fen) {
    const o = { dests: {}, check: -1 };
    try {
      if (!chess) { chess = new window.Chess(); }
      chess.reset();
      if (chess.loadFen(fen)) return o;
      const lm = chess.legalMoves();
      lm.forEach((m) => { const a = toIdx88(m.from); (o.dests[a] = o.dests[a] || []).push({ to: toIdx88(m.to), cap: !!chess.board[m.to] }); });
      if (chess.inCheck(chess.turn)) o.check = toIdx88(chess.kingSquare(chess.turn));
    } catch (e) { /* the lesson still shows the board */ }
    return o;
  }

  function build() {
    root = document.createElement('div');
    root.id = 'lesson'; root.className = 'lesson';
    root.innerHTML = `<div class="ls-top"><b>Learn chess</b><span class="ls-dots" id="ls-dots"></span><button class="text-btn" id="ls-skip" aria-label="Close the lesson">Skip</button></div>
      <div class="ls-bw"><div class="ls-board"><div class="board" id="ls-board"></div><svg class="ls-arrows" id="ls-arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true"></svg></div></div>
      <div class="ls-card"><h3 id="ls-t"></h3><p id="ls-d"></p>
        <div class="row"><button class="btn" id="ls-back">Back</button><button class="btn primary" id="ls-next">Next</button></div>
        <button class="btn wide hidden" id="ls-later">Not now</button></div>`;
    (document.getElementById('app') || document.body).appendChild(root);   // inside #app so the piece skins (which watch #app) are applied
    $('#ls-skip').onclick = close;
    $('#ls-later').onclick = close;
    $('#ls-back').onclick = () => go(i - 1);
    $('#ls-next').onclick = () => { if (STEPS[i].last) { close(); if (LP.startVs) LP.startVs('easy'); } else go(i + 1); };
    document.addEventListener('keydown', (e) => { if (!root || !root.classList.contains('on')) return; if (e.key === 'ArrowRight') $('#ls-next').click(); else if (e.key === 'ArrowLeft') $('#ls-back').click(); else if (e.key === 'Escape') close(); });
  }

  function drawArrows(list) {
    const svg = $('#ls-arrows');
    const P = (name) => { const n = sq(name); return [(n & 7) + 0.5, 7 - (n >> 3) + 0.5]; };
    svg.innerHTML = list.map((a) => {
      const [x1, y1] = P(a[0]), [x2, y2] = P(a[1]);
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const ex = x2 - ux * 0.14, ey = y2 - uy * 0.14, bx = ex - ux * 0.42, by = ey - uy * 0.42, hw = 0.2;
      const sx = x1 + ux * 0.22, sy = y1 + uy * 0.22;
      const col = a[2] === 'r' ? '#e5484d' : '#3fbf6a';
      return `<g class="ls-arr"><line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width=".17" stroke-linecap="round" opacity=".92"/><polygon points="${ex},${ey} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}" fill="${col}" opacity=".92"/></g>`;
    }).join('');
  }

  function go(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    clearTimers();
    const st = STEPS[i], pcs = parse(st.fen), F = facts(st.fen);
    const b = $('#ls-board');
    b.innerHTML = '';
    const hl = new Set((st.hl || []).map(sq));
    for (let k = 0; k < 64; k++) {
      const r = 7 - (k >> 3), f = k & 7, idx = r * 8 + f;
      const el = document.createElement('div');
      el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark') + (hl.has(idx) ? ' ls-hl' : '') + (idx === F.check ? ' check' : '');
      el.dataset.i = idx;
      if (r === 0) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = 'abcdefgh'[f]; el.appendChild(c); }
      if (f === 0) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = r + 1; el.appendChild(c); }
      const p = pcs[idx];
      if (p) { const s = document.createElement('span'); s.className = 'piece ' + (p === p.toUpperCase() ? 'w' : 'b'); s.textContent = GLYPH[p.toLowerCase()]; el.appendChild(s); }
      b.appendChild(el);
    }
    $('#ls-t').textContent = st.t;
    $('#ls-d').textContent = st.d;
    $('#ls-dots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('');
    $('#ls-back').classList.toggle('hidden', i === 0);
    $('#ls-skip').classList.toggle('hidden', !!st.last);
    $('#ls-later').classList.toggle('hidden', !st.last);
    $('#ls-next').textContent = st.last ? 'Play the Easy bot' : 'Next';
    // slowly: the arrows come in one by one, then the squares the piece can reach
    drawArrows([]);
    const arrows = st.arrows || [];
    arrows.forEach((a, k) => timers.push(setTimeout(() => drawArrows(arrows.slice(0, k + 1)), 500 + k * 650)));
    if (st.moves) {
      const from = sq(st.moves), list = F.dests[from] || [];
      timers.push(setTimeout(() => list.forEach((m) => { const el = b.querySelector('[data-i="' + m.to + '"]'); if (el) el.classList.add('legal', m.cap ? 'capture' : 'x'); }), 500 + arrows.length * 650));
    }
  }

  function start() {
    if (!root) build();
    LP.closeSheet && LP.closeSheet();
    root.classList.add('on');
    document.body.classList.add('ls-open');
    go(0);
  }
  function close() {
    clearTimers();
    if (root) root.classList.remove('on');
    document.body.classList.remove('ls-open');
  }

  /** "Is this your first time playing chess?" — asked once, after the app tour. */
  function ask() {
    try { if (localStorage.getItem(ASKED)) return; localStorage.setItem(ASKED, '1'); } catch (e) { /* ask anyway */ }
    LP.openSheet(`<h2>Is this your first time playing chess?<span class="sub">If it is, a short lesson will show you how every piece moves, then you can play the Easy bot.</span></h2>
      <div class="stack"><button class="btn big primary" id="ls-yes">Yes, teach me</button><button class="btn big" id="ls-no">No, I know how to play</button></div>`, true);
    $('#ls-yes').onclick = start;
    $('#ls-no').onclick = () => LP.closeSheet();
  }

  LP.lesson = { ask, start, close };
})();
