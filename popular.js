/**
 * Popular puzzles: a scrolling list of famous positions. Each one is played against the Insane computer, and you are
 * always the side to move. To add one, append a line to LIST: id, name, fen, n (moves to mate, 0 = just win), goal (shown on the button).
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const KEY = 'localPieces.popularDone';
  const G = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

  const LIST = [
    { id: 'rook-net', name: 'The Rook Net', fen: '2r2rk1/R3q2p/2bp2pQ/p3p1N1/1p2n1P1/PP3R1P/1P2N3/5R1K w - - 0 1', n: 3, goal: 'Mate in 3' },
    { id: 'pawn-wall', name: 'The Pawn Wall', fen: 'k7/Pp6/1Pp5/2Pp4/3Pp3/4P3/5P2/4K3 w - - 0 1', n: 0, goal: 'Win' },
    { id: 'locked-gate', name: 'The Locked Gate', fen: '3k4/2pPp3/1pP1Pp2/1P3P2/8/8/3R4/2QKR3 w k - 0 1', n: 0, goal: 'Win' },
    { id: 'pawn-parade', name: 'The Pawn Parade', fen: '8/7P/6P1/5P2/4P3/k7/8/b1K5 w - - 0 1', n: 0, goal: 'Win' },
    { id: 'last-fork', name: 'The Last Fork', fen: '1k6/2R5/1N5K/8/7P/8/1p6/8 w - - 0 1', n: 0, goal: 'Win' },
    { id: 'november-first', name: 'November First', fen: '8/p5pk/1R2p3/2p3p1/8/2p4P/PN4P1/6K1 b - - 0 1', n: 0, goal: 'Win' },
    { id: 'amazing-race', name: 'The Amazing Race', fen: '3Q2R1/r7/5b2/1BP1k3/1P3pr1/4n2p/8/1K2R3 w - - 0 1', n: 0, goal: 'Win' },
    { id: 'endgame-mate', name: 'Endgame Mate', fen: '8/8/3K4/8/1N3N2/8/1ppppp2/b2k2n1 w - - 0 1', n: 0, goal: 'Win' },
    { id: 'opera', name: 'The Opera Game', fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16', n: 2, goal: 'Mate in 2' },
    { id: 'legal', name: "Légal's Mate", fen: 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6', n: 2, goal: 'Mate in 2' },
    { id: 'lucena', name: 'The Lucena Position', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', n: 0, goal: 'Win' },
    { id: 'saavedra', name: 'The Saavedra Position', fen: '8/8/1KP5/3r4/8/8/8/k7 w - - 0 1', n: 0, goal: 'Win' },
  ];

  const done = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const markDone = (id) => { const d = done(); d[id] = 1; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } };

  /** A small picture of the starting position. */
  function mini(fen) {
    let out = '';
    fen.split(' ')[0].split('/').forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') { for (let k = 0; k < +ch; k++) { out += `<i class="${(r + f) % 2 ? 'd' : 'l'}"></i>`; f++; } }
        else { out += `<i class="${(r + f) % 2 ? 'd' : 'l'}"><b class="${ch === ch.toUpperCase() ? 'w' : 'b'}">${G[ch.toLowerCase()]}︎</b></i>`; f++; }
      }
    });
    return out;
  }

  function render() {
    const d = done();
    $('#pp-list').innerHTML = LIST.map((p) => {
      const white = p.fen.split(' ')[1] !== 'b';
      return `<button class="pp-b" data-id="${p.id}">
        <span class="pp-mb mb">${mini(p.fen)}</span>
        <span class="pp-t"><b class="pp-n">${LP.esc(p.name)}</b>
          <span class="pp-tags"><em class="pp-goal">${LP.esc(p.goal)}</em><em class="pp-side ${white ? 'w' : 'b'}">${white ? 'White' : 'Black'} to start</em></span>
          ${d[p.id] ? '<span class="pp-done">Solved ✓</span>' : ''}</span>
      </button>`;
    }).join('');
    $('#pp-list').querySelectorAll('.pp-b').forEach((b) => {
      b.onclick = () => LP.playPopular(LIST.find((p) => p.id === b.dataset.id));
    });
  }

  function open() { render(); LP.showPage('popular'); }
  $('#pp-back').addEventListener('click', () => LP.showPage('menu'));
  document.querySelector('.mode[data-mode="popular"]').addEventListener('click', () => LP.saves.guard(open));
  LP.popular = { list: LIST, open, done: markDone };
})();
