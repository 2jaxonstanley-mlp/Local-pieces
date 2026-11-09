/**
 * Two small extras:
 *   - the update log ("What's new" button on the menu): newest first, each entry has a date and short bullet points
 *   - a bar at the bottom of the screen when the internet disconnects: "Internet disconnected. Retrying in 5s"
 * To add an update, put a new entry at the TOP of LOG below.
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;

  /* ------------------------------------------------------------------ update log */
  const LOG = [
    { id: 'u12', date: '2026-11-09', title: 'Puzzle Rush, Puzzle Battle and the global leaderboard', items: [
      'New Puzzle Rush in Train: random puzzles that get harder the more you solve. 1 point for each one, three lives, and a wrong move costs a life (it shows you the answer, then moves on)',
      'You are asked at the start if you want to see the puzzle type (mate, check, best move, sacrifice) or not',
      'The lives show as three boxes above the board, and a cross fills a box each time you get one wrong',
      'When a run ends you get a results screen: your score, Today / This week / All time rank, longest streak, highest solved puzzle rating, average time per puzzle and global rank',
      'New Global section at the top of the menu. Online Chess moved there, and Online Puzzle Battle is new: make a code, share it, and both of you race the same puzzles in the same order for 3 minutes',
      'In a battle you see your opponent\'s score and lives the whole time. It ends when time runs out, or when one player has no lives left and the other has a higher score',
      'New Global Leaderboard in the Global section (not in Stats): Puzzle Rush score (Today, This week, All time), hardest puzzle solved, Capture Rush score, brilliant moves, best moves and time played, with profile pictures. Each board has a clear title and says what the number is',
      'The tour now covers the Global section and Puzzle Rush',
    ] },
    { id: 'u11', date: '2026-11-06', title: 'Checkmate puzzles, Pause and mod menu upgrades', items: [
      'New Online mode in Classic: play a friend on another device. Make a private game and share the code, or post a public one for anyone. Timed (1 min, 3 min + 1, 5 min, 10 min) or unlimited, with resign, draw offers and rematch',
      'Bullet and Rapid now have a Pause button: the clock stops, the computer stops thinking and nobody can move until you tap Resume',
      'Checkmate puzzles now ask a second question: mate in how many moves. Easy is 1 or 2, Normal 1 to 3, Hard 2 to 5, and the new Insane is 2 to 8',
      'Difficulty now also sets how busy the board looks: Easy has only a few pieces, Insane has a crowded board',
      'Hard and Insane lean towards forcing ideas: discovered checks, sacrifices, and checks that leave the king one or two replies',
      'Every bank puzzle is a real position with a proven solution, so Hint, Solution and the explanation follow the true mating line',
      'Insane is for Checkmate only. Check, Best move and Sacrifice keep Easy, Normal and Hard',
    ] },
    { id: 'u10', date: '2026-11-02', title: 'Sandbox, Solo Chess and a smarter hint', items: [
      'TAS is now called Sandbox and lives in the Classic section',
      'Sandbox hint: brilliant moves glow blue, and a forced mate (any length) shows orange numbers in the order to play. Otherwise you still get the best 3 moves, now searched deeper',
      'Undo and Redo are now called Back and Forward everywhere except Sandbox, where they really undo the move',
      'Foresight Chess has been removed. Old saves of it carry on as normal games',
      'New Solo Chess: Perfect Run. 30 capture puzzles against the clock, in Train',
      'Computer ratings now read Dumb 50, Easy 150, Medium 600, Hard 1100, Godly 1800, Insane 2200',
      'Insane and the Sandbox hint now play a sound sacrifice that breaks up the enemy defence when it is as good as the best move',
      'Computers answer a little quicker (their thinking time is unchanged)',
    ] },
    { id: 'u9', date: '2026-10-24', title: 'Saves, history, editor and big Rush and Hockey updates', items: [
      'Continue now has 5 save slots and shows who is playing whom. Saved games lets you resume, view, rename or delete each one',
      'New Match history: your last 50 finished games (not puzzles) with the finish date and time. Chess replays move by move; timed games, Capture Rush and Air Hockey replay on a timeline with speeds from 0.5x to 16x',
      'New Position editor: set up any position, play it against the computer or a friend, save it, or copy and paste FEN code. Analyze works on these games too',
      'Capture Rush analysis now rates every move by points lost against the best move, shows each move\'s point gain, the top 3 alternatives and a score graph. White earns 2x points per piece, and the computers now understand it (stronger levels understand it better)',
      'New Doodle board in the shop: a pencil sketch look with wobbly borders',
      'Puzzles: tap the star to keep a favourite, and solved puzzles now explain why the solution works',
      'Air Hockey: pieces start at half speed and speed up the longer the puck is in play. If the puck stays on one side for 5 seconds a 3 second countdown starts, then it is moved to the other side. Replays of every match are in History',
      'Air Hockey computers now look every 0.5 to 1.5 seconds and only move when it helps. Insane and Godly hit the puck back to themselves to build speed, use wall pinches and bounce shots off your piece while it is moving',
      'Settings: sound effects and volume, animations on/off, your own board colours, warning before replacing a save, quick rematch, keyboard shortcuts (press ? in a game), and the options you picked last time are remembered',
    ] },
    { id: 'u8', date: '2026-10-23', title: 'Puzzle goal and the King in Air Hockey', items: [
      'New Endless goal for puzzles: solve 5, then 10, then 15 puzzles on Normal or Hard. It scales exactly like the pieces captured goal',
      'Air Hockey has a new piece to pick: the King, which glides to any square in its own half',
      'Capture and win goals (daily, weekly and Endless) already count in Bullet and Rapid games',
    ] },
    { id: 'u7', date: '2026-10-22', title: 'Stickman pieces and the Bunny Hat', items: [
      'New Stickman piece set (Rare), hand drawn: black stickmen for Black and white stickmen with an outline for White',
      'New Bunny Hat accessory (Epic)',
      'Removed the Cap, Blossom and Clover accessories (owners were refunded 5 tokens each)',
    ] },
    { id: 'u6', date: '2026-10-22', title: 'Analyze fixes and slower bots', items: [
      'Fixed Analyze: the screen no longer resizes or jumps while you scroll, and nothing goes off the side of the screen',
      'Analyze moves now sit in one bar you scroll sideways, and the bar follows the move you are on, instead of a long list down the page',
      'Analyze has a new look: a pinned timeline and move bar, a clearer coach bubble, and buttons that stay in reach. On a computer the board is on the left and the coach on the right',
      'Air Hockey: computers now react slower the weaker they are (Dumb and Easy the slowest). Insane and Godly keep their speed',
      'Bullet and Rapid: computers now take longer to answer. Easy takes 5 to 8 seconds, Medium and Hard 4 to 7 seconds, Insane at least half a second and Godly about 2 seconds',
    ] },
    { id: 'u5', date: '2026-10-22', title: 'Timed games, Air Hockey and Analyze', items: [
      'The menu now has sections you can open and close: Classic, Custom, Train, Rewards, Progress and More',
      'New timed games: Bullet (1 or 3 minutes, no extra time) and Rapid (5 or 10 minutes plus 2 seconds every move)',
      'New Chess x Air Hockey: queens (or knights) against each other with a puck. Move any time, glide faster the further you go, hit harder the faster you move. First to 7',
      'Added a Forfeit button',
      'New Analyze: after a game, tap Analyze game for a lesson with a progress bar. It shows what you did well, what went wrong (free pieces, forks, missed wins), and lets you try again from those positions. Find saved games under Train',
      'Removed the live move labels while you play, except Book moves. Everything else is in Analyze',
      'TAS is now a sandbox: it is not saved or analysed',
      'Equip pieces and accessories for Player 1, Player 2 or both. Accessories pick the player first, then the pieces',
      'Accessory changes: Crown and Halo are now Rare, new Mini Me (Legendary) stands in the corner of its square, new Pawn Hat (Epic)',
      'New game logo and browser tab icon, plus a Suggestions page under More',
    ] },
    { id: 'u4', date: '2026-10-21', title: 'New boards, pieces and accessories', items: [
      'Added the Marble, Realism and Cosmic boards',
      'Added the Sandy and Silver & Gold piece sets',
      'Accessories are now drawn pictures instead of emoji, with 8 new ones: Party Hat, Cowboy Hat, Antlers, Wizard Hat, Pirate Hat, Horns, Crown and Halo',
      'When you equip an accessory you pick which pieces wear it',
      'When you equip a piece set you pick whether both teams, White only or Black only use it',
      'New hand-drawn coin and crate pictures',
      'Legal move dots now invert the colour of the tile underneath, so they are readable on every board',
    ] },
    { id: 'u3', date: '2026-10-20', title: 'Faster bots, wood and lifetime goals', items: [
      'Added Endless goals in Tasks: capture 5, then 10, then 15 pieces and so on, and win 2, then 4, then 6 games (Classic or Secret Queen vs Medium or tougher). They never end, progress restarts each level, and rewards rise every 4 levels',
      'Added the Wooden board and Wooden pieces to the shop',
      'Removed the Sage and Dusk boards (owners were refunded 5 tokens each)',
      'Accessories now show on the piece set you have equipped',
      'Legal move dots now use the opposite of the tile they sit on (black on white, red on blue, and so on)',
      'Bots answer much faster: shorter waits, quicker search loop and lower time caps for Insane and Godly',
      'Sharper piece pictures on big screens',
      'Added an "Internet disconnected" bar and this update log',
    ] },
    { id: 'u2', date: '2026-10-20', title: 'Puzzles overhaul and first-time tutorial', items: [
      'Checkmate puzzles: Easy is mate in 1, Normal is mate in 1 or 2, Hard is mate in 2 or 3, all with more pieces on the board',
      'Mate in 3 puzzles start by taking a piece',
      'Rebuilt the Sacrifice puzzle and added Easy, Normal and Hard versions',
      'Check and Best move puzzles are much harder on Hard',
      'Added a spotlight tutorial for new players (replay it from your profile)',
    ] },
    { id: 'u1', date: '2026-10-20', title: 'Smarter move labels', items: [
      'Move labels now come from a real engine analysis, so Brilliant, Great, Best, Good, Interesting, Inaccuracy, Mistake, Blunder and Missed win are more accurate',
      'Added Book, Novelty, Forced and Checkmate labels with your own icons',
      'Secret Queen games now get move labels too',
      'Insane now checks its move against the same analysis and goes for sound sacrifices',
    ] },
  ];
  const SEEN = 'localPieces.logSeen';
  const seen = () => { try { return localStorage.getItem(SEEN) || ''; } catch (e) { return ''; } };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (d) => { const p = d.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; };

  function paintDot() {
    const b = $('#news-btn');
    if (b) b.classList.toggle('unread', !!LOG.length && seen() !== LOG[0].id);
  }
  /** How many entries at the top of the log have not been opened yet. */
  function unreadCount() {
    const i = LOG.findIndex((u) => u.id === seen());
    return i < 0 ? Math.min(1, LOG.length) : i;
  }
  function openLog() {
    const n = unreadCount();
    try { localStorage.setItem(SEEN, LOG[0].id); } catch (e) { /* ignore */ }
    paintDot();
    // the very first update's title hides a secret: its first and last letters are buttons (see mods.js)
    const keyed = (t) => { const a = Array.from(t); return a.length < 2 ? esc(t) : `<span class="log-k" data-k="0">${esc(a[0])}</span>${esc(a.slice(1, -1).join(''))}<span class="log-k" data-k="1">${esc(a[a.length - 1])}</span>`; };
    const entry = (u, i) => `<section class="log-entry${i < n ? ' new' : ''}"><div class="log-head"><b>${i === LOG.length - 1 ? keyed(u.title) : esc(u.title)}</b><time datetime="${u.date}">${fmtDate(u.date)}</time></div>
        <ul>${u.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
    LP.openSheet(`<h2>Update log<span class="sub">What changed, newest first.</span></h2>
      <div class="log-list">${n ? '<div class="log-new-h">WHATS NEW!</div>' : ''}${LOG.map((u, i) => (i === n && n ? '<div class="log-old-h">Earlier updates</div>' : '') + entry(u, i)).join('')}</div>
      <button class="btn wide" id="log-x">Close</button>`, true);
    $('#log-x').onclick = LP.closeSheet;
    const got = [0, 0];
    document.querySelectorAll('.log-k').forEach((el) => {
      el.addEventListener('click', () => {
        const k = +el.dataset.k, now = Date.now();
        got[k] = now;
        if (now - got[1 - k] < 6000 && LP.mods) { got[0] = got[1] = 0; LP.mods.open(); }
      });
    });
  }
  const nb = $('#news-btn');
  if (nb) nb.addEventListener('click', openLog);
  paintDot();
  LP.updateLog = { open: openLog, entries: LOG };

  /* ------------------------------------------------------------------ connection bar */
  const bar = document.createElement('div');
  bar.id = 'netbar';
  bar.className = 'netbar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span class="nb-dot" aria-hidden="true"></span><span class="nb-text"></span><button class="nb-btn" type="button">Retry now</button>';
  document.body.appendChild(bar);
  const txt = bar.querySelector('.nb-text');
  const web = /^https?:/.test(location.protocol);
  let offline = false, timer = 0, secs = 0, tries = 0, hideT = 0, beat = 0;

  const show = (cls, text) => { clearTimeout(hideT); bar.className = 'netbar show ' + cls; txt.textContent = text; };
  const hide = () => { bar.className = 'netbar'; };
  function paint() { show('off', 'Internet disconnected. Retrying in ' + secs + 's'); }
  function schedule(n) {
    clearInterval(timer);
    secs = n;
    paint();
    timer = setInterval(() => { secs--; if (secs <= 0) { clearInterval(timer); probe(); } else paint(); }, 1000);
  }
  function goOffline() {
    if (offline) return;
    offline = true; tries = 0;
    schedule(5);
  }
  function goOnline() {
    if (!offline) return;
    offline = false; clearInterval(timer);
    show('on', 'Back online');
    hideT = setTimeout(hide, 2000);
  }
  /** Ask our own server for a tiny answer. Any answer at all (even an error page) means the network works. */
  function ping() {
    if (!web) return Promise.resolve(navigator.onLine !== false);
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(() => ctl && ctl.abort(), 6000);
    return fetch(location.pathname + '?ping=' + Date.now(), { method: 'HEAD', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(() => { clearTimeout(to); return true; }, () => { clearTimeout(to); return false; });
  }
  function probe() {
    clearInterval(timer);
    show('off', 'Internet disconnected. Reconnecting...');
    ping().then((ok) => {
      if (ok) goOnline();
      else { tries++; schedule(Math.min(30, 5 + tries * 5)); }
    });
  }
  bar.querySelector('.nb-btn').addEventListener('click', () => { if (offline) probe(); });
  window.addEventListener('offline', goOffline);
  window.addEventListener('online', () => { if (offline) probe(); });
  // some disconnects never raise an event (wifi with no internet), so check now and then
  clearInterval(beat);
  beat = setInterval(() => { if (!offline && !document.hidden) ping().then((ok) => { if (!ok) goOffline(); }); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !offline) ping().then((ok) => { if (!ok) goOffline(); }); });
  if (navigator.onLine === false) goOffline();
  LP.net = { simulateOffline: goOffline, isOffline: () => offline };
})();
