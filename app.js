(() => {
  'use strict';

  /* ------------------------------------------------------------------ state */
  const game = new Chess();    // the live game
  const rgame = new Chess();   // used only by the replay viewer
  let G = game;                // whichever game the board is currently showing

  let mode = 'basic';
  let names = { [WHITE]: 'White', [BLACK]: 'Black' };
  let viewNames = names;
  let sans = [];               // every move played (standard notation)
  let fullMoves = [];          // every move played (plain objects, for redo + replay)
  let viewPly = 0;             // how many of those moves the board is showing
  let opts = { autoFlip: true, hints: true, ratings: true };
  function loadOptsFromSettings() {
    const s = window.LP && window.LP.profile && window.LP.profile.settings && window.LP.profile.settings();
    if (s) {
      if (typeof s.hints === 'boolean') opts.hints = s.hints;
      if (typeof s.ratings === 'boolean') opts.ratings = s.ratings;
      if (typeof s.autoFlip === 'boolean') opts.autoFlip = s.autoFlip;
    }
  }
  function applySettings(s) {
    if (!s) return;
    if (typeof s.hints === 'boolean') opts.hints = s.hints;
    if (typeof s.ratings === 'boolean') opts.ratings = s.ratings;
    if (typeof s.autoFlip === 'boolean') opts.autoFlip = s.autoFlip;
  }
  let ratings = [];            // move strength of every move played (an id from MoveRating.RATINGS, or null), parallel to fullMoves
  let flipTimer = null;
  let toastTimer = null;
  let ai = null;               // { level, color (computer), human } when playing the computer
  let aiToken = 0;             // bumps to cancel a pending computer move
  let aiBusy = false;          // the computer is "thinking"
  let bots = null;             // 0-player games: { [WHITE]: level, [BLACK]: level }, the computer plays both sides
  let paused = false;          // 0-player games: waiting for Resume
  let posKeys = [];            // position key after each ply (index 0 = start), for repetition
  let hintMoves = [];          // TAS hint currently shown (up to 3 moves, best first)
  let hintAvail = false;       // a forced mate exists right now (makes the Hint button glow)
  let online = null;           // an Online game: { me: WHITE|BLACK, id } (the other player's moves arrive from online.js)
  let remoteApplying = false, remoteEnding = false;
  let pend = null;             // mod-menu edits made since the last move: { map: Map(square -> { old, nw }), castling } (they are written into the next move)
  let classicMods = new Set(); // mod-menu Classic mods used in this game (it shows as Modded in History and does not count for ratings)
  let hintCache = null;        // { key, result } from the last mate check
  let hintToken = 0;
  let playBoth = false;        // TAS: you play the computer's turns too, so it stays still
  let initialSecrets = { [WHITE]: -1, [BLACK]: -1 };
  let pendingTc = null;        // time control chosen for Bullet / Rapid: { base: seconds, inc: seconds }
  let clock = null;            // the running clock of a timed game: { [WHITE]: ms, [BLACK]: ms, inc: ms, base: ms }
  let lastTick = 0;
  let resigned = null;         // the colour that forfeited, if any
  let sidesCtx = { w: 'p1', b: 'p2' };   // which player (p1 / p2) each colour is, so the shop can give each player their own pieces

  let phase = 'menu';          // menu | names | pick-w | pick-b | play | over | replay
  let selected = -1;
  let legalTargets = [];
  let pre = [], preSel = -1, preDest = new Set();   // premoves: the queue, the piece picked for the next one, and where it may go
  let pickSel = -1;
  let flipped = false;
  let pendingPromo = false;
  let showQueen = false;       // Secret Queen: the player to move asked to see which piece is their queen (until the move is made)
  let over = null;             // { title, sub, result }
  let replay = null;           // { data, idx, playing, speed, timer, from }

  /* ---------------------------------------------------------------- helpers */
  const $ = (s) => document.querySelector(s);
  const boardEl = $('#board');
  const coverEl = $('#cover');
  const statusEl = $('#status');
  const sheetBg = $('#sheet-bg');
  const sheet = $('#sheet');
  const movesScroll = $('#moves-scroll');
  const moveListEl = $('#move-list');

  /* sounds, animations and rules that come from Settings (prefs.js loads later, so every call checks it is there) */
  const fx = (name) => { try { if (window.LP && window.LP.fx) window.LP.fx.play(name); } catch (e) { /* ignore */ } };
  const animOn = () => !(window.LP && window.LP.prefs && !window.LP.prefs.get('anim'));
  const guardSlots = (next) => (window.LP && window.LP.saves ? window.LP.saves.guard(next) : next());
  let viewSide = 0;            // Guess Who: whose eyes the board is shown through (0 = sees everything, -1 = nobody, the hand-off cover is up)
  let revealSet = new Set();   // Guess Who: enemy squares already uncovered by the end-of-game reveal
  let revealAll = false;       // Guess Who: the reveal is finished, everything is shown
  let revealTimer = null;
  let arrs = {};               // Guess Who: each side's chosen arrangement (16 piece types: back rank a-h, then the front rank a-h)
  let arrTypes = [];           // ... the one being edited right now
  let arrColor = 0;
  let gFirst = 0;              // Gamblite: the side the opening roll gave the first move to
  let marks = { [WHITE]: {}, [BLACK]: {} };   // Guess Who: each side's private colour marks on enemy squares (square -> 'r' | 'b' | 'g' | 'y')
  let markTool = '';           // Guess Who: the colour picked in the palette ('' = none, 'x' = rub out)
  let gwStage = '';            // Guess Who: '' normal | 'guesspick' choosing the enemy piece to guess
  let gwLast = '';             // Guess Who: what happened last (a question and its answer), shown to the next player
  let pendingBotGuess = -1;    // Guess Who: the square the computer will guess after the move it is making
  let spawnSel = 0;            // Chess Royale: the piece type picked in the spawn tray (0 = none)
  let pz = null;               // a Popular puzzle being played: { id, name, goal, n } (n = moves to mate, 0 = just win)
  let startFen = null;         // a custom starting position (FEN) from the position editor, or null for the normal start
  let moveAt = [];             // when each move was played, in ms since the first move (timed replays)
  let moveClk = [];            // both clocks after each move (timed games)
  let playStart = 0;

  const FILLED = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };
  const glyph = (p) => FILLED[p & 7] + '︎';
  const isWhite = (p) => (p & 24) === WHITE;
  const VALUE = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0 };
  // standard notation: pawn moves have no letter (e4, exd5), pieces have one (Nf3, Bxc6)
  const fmt = (san) => String(san || '');
  const isTas = () => mode === 'tas';
  const branch = () => mode === 'tas';   // TAS lets you undo, then play something else from there
  const humanTurn = () => !ai || playBoth || game.turn === ai.human;
  const engineMode = (m) => (m === 'secret' ? 'secret' : m === 'snail' ? 'snail' : m === 'gamble' ? 'gamble' : m === 'guess' ? 'guess' : m === 'royale' ? 'royale' : 'basic');
  const isTwist = () => mode === 'snail' || mode === 'gamble' || mode === 'guess' || mode === 'royale';   // custom rules the move-strength labels, Analyze and Export know nothing about
  const MODE_LABEL = { basic: 'Classic', secret: 'Secret Queen', tas: 'Sandbox', bullet: 'Bullet', rapid: 'Rapid', snail: 'Immortal Snail', online: 'Online', gamble: 'Gamblite Chess', guess: 'Guess Who Chess', royale: 'Chess Royale' };
  const LEVEL_LABEL = { dumb: 'Dumb', easy: 'Easy', medium: 'Medium', hard: 'Hard', insane: 'Insane', godly: 'Godly' };
  const cname = (c) => (c === WHITE ? 'White' : 'Black');
  const nameOf = (c) => viewNames[c] || cname(c);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = (() => {
    const KEY = 'localPieces.replays';
    let mem = [];
    return {
      get() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return mem; } },
      set(v) { mem = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } },
    };
  })();

  /* Games in progress, kept so the menu can offer "Continue playing". Up to MAX_SLOTS games are saved at once; each running game keeps
     writing into its own slot (cur) and the slot is removed when the game ends. A slot is { id, name?, kind, date, ...the game }. */
  const MAX_SLOTS = 5;
  const session = (() => {
    const KEY = 'localPieces.slots', OLD = 'localPieces.session';
    let mem = null, cur = null;
    const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const write = (v) => { mem = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } };
    function all() {
      let v = null;
      try { v = JSON.parse(localStorage.getItem(KEY)); } catch (e) { v = null; }
      if (!Array.isArray(v)) v = mem;
      if (!Array.isArray(v)) {   // first run of the new version: bring over the single save the old version kept
        v = [];
        try { const o = JSON.parse(localStorage.getItem(OLD)); if (o && o.kind) { o.id = o.id || newId(); v.push(o); } } catch (e) { /* none */ }
        write(v);
        try { localStorage.removeItem(OLD); } catch (e) { /* ignore */ }
      }
      return v;
    }
    const api = {
      MAX: MAX_SLOTS,
      all() { return all().slice().sort((a, b) => (b.date || 0) - (a.date || 0)); },
      count() { return all().length; },
      full() { return all().length >= MAX_SLOTS; },
      oldest() { return api.all().filter((x) => x.id !== cur).pop() || null; },
      find(id) { return all().find((x) => x.id === id) || null; },
      /** The slot the running game writes into (or the most recent one). */
      get() { return (cur && api.find(cur)) || api.all()[0] || null; },
      /** Save the running game. Starts a new slot the first time; when all slots are taken the oldest one is replaced. */
      set(v) {
        const list = all().slice();
        if (!cur) cur = newId();
        const i = list.findIndex((x) => x.id === cur);
        const keep = i >= 0 ? list[i].name : undefined;
        const slot = Object.assign({}, v, { id: cur });
        if (keep) slot.name = keep;
        if (i >= 0) list[i] = slot;
        else {
          list.push(slot);
          while (list.length > MAX_SLOTS) {
            let o = -1;
            list.forEach((x, k) => { if (x.id !== cur && (o < 0 || (x.date || 0) < (list[o].date || 0))) o = k; });
            if (o < 0) break;
            list.splice(o, 1);
          }
        }
        write(list);
      },
      /** The running game is over (or was thrown away): free its slot. */
      clear() { if (cur) write(all().filter((x) => x.id !== cur)); cur = null; },
      /** A new game is starting: it gets a slot of its own when it first saves. */
      fresh() { cur = null; },
      /** A saved game was opened: keep saving into the same slot. */
      use(id) { cur = id; },
      remove(id) { write(all().filter((x) => x.id !== id)); if (cur === id) cur = null; },
      rename(id, name) { write(all().map((x) => (x.id === id ? Object.assign({}, x, { name: String(name || '').trim().slice(0, 24) || undefined }) : x))); },
    };
    return api;
  })();

  function showPage(id) {
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === id));
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ sheet */
  function openSheet(html, dismissible) {
    sheetBg.dataset.dismiss = dismissible ? '1' : '';
    const wasHidden = sheetBg.classList.contains('hidden');
    sheet.innerHTML = html;
    sheetBg.classList.remove('hidden');
    if (wasHidden) {
      sheet.style.animation = 'none';
      void sheet.offsetWidth;
      sheet.style.animation = '';
    }
    const inp = sheet.querySelector('input');
    if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 60);
  }
  function closeSheet() { sheetBg.classList.add('hidden'); sheet.innerHTML = ''; }
  sheetBg.addEventListener('click', (e) => { if (e.target === sheetBg && sheetBg.dataset.dismiss === '1') closeSheet(); });

  function confirmSheet(title, okLabel, cb) {
    openSheet(`<h2>${esc(title)}</h2>
      <div class="row"><button class="btn" id="c-no">Cancel</button><button class="btn primary" id="c-yes">${esc(okLabel)}</button></div>`);
    $('#c-no').onclick = closeSheet;
    $('#c-yes').onclick = () => { closeSheet(); cb(); };
  }

  /* ------------------------------------------------------------------ board */
  let squareEls = {};

  function buildBoard() {
    boardEl.innerHTML = '';
    squareEls = {};
    const order = [];
    for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) order.push(sq(f, r));
    if (flipped) order.reverse();
    order.forEach((s, i) => {
      const f = fileOf(s), r = rankOf(s);
      const el = document.createElement('div');
      el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark');
      el.dataset.sq = s;
      if (Math.floor(i / 8) === 7) {
        const c = document.createElement('span');
        c.className = 'coord file';
        c.textContent = 'abcdefgh'[f];
        el.appendChild(c);
      }
      if (i % 8 === 0) {
        const c = document.createElement('span');
        c.className = 'coord rank';
        c.textContent = r + 1;
        el.appendChild(c);
      }
      boardEl.appendChild(el);
      squareEls[s] = el;
    });
  }

  /* ---------------------------------------------------------- move strength */
  const ratingsOn = () => opts.ratings && !isTwist() && !!window.MoveRating;   // (move-strength labels know nothing about snails)
  function ratingIdAt(i) {
    if (i < 0) return null;
    if (phase === 'replay') return (replay && replay.data.ratings && replay.data.ratings[i]) || null;
    return (ratingsOn() && ratings[i]) || null;
  }
  const shownPly = () => (phase === 'replay' ? (replay ? replay.idx : 0) : viewPly);

  function updateRatingLine() {
    const el = $('#rating-line');
    const id = ratingIdAt(shownPly() - 1);
    const r = id && window.MoveRating ? window.MoveRating.get(id) : null;
    if (!r) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const list = phase === 'replay' ? replay.data.sans : sans;
    const opening = r.id === 'book' ? window.MoveRating.openingName(phase === 'replay' ? replay.data.moves : fullMoves, shownPly()) : null;
    el.innerHTML = `<span class="rl-sym${r.hasImg ? ' img' : ''}" style="background:${r.hasImg ? 'none' : r.color}">${window.MoveRating.iconHtml(r)}</span><span class="rl-text"><span><b>${esc(fmt(list[shownPly() - 1] || ''))}</b> is ${esc(r.phrase)}</span>${opening ? `<span class="rl-open">${esc(opening)}</span>` : ''}</span>`;
    el.classList.remove('hidden');
  }

  function rateLastMove(before, m) {
    const idx = fullMoves.length - 1;
    const mm = { from: m.from, to: m.to, promo: m.promo || 0, q: m.q || 0 };
    setTimeout(() => {
      try { const rr = window.MoveRating.rate(before, mm); ratings[idx] = rr ? rr.id : null; } catch (e) { ratings[idx] = null; }
      if (phase === 'replay') return;
      renderBoard();
      updateRatingLine();
      renderMoves(sans, viewPly);
      saveSession();
    }, 30);
  }

  /* ---------------------------------------------------------- Immortal Snail */
  const SNAIL_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="sn-body" d="M7 83 C7 74 14 70 22 70 L66 70 C72 70 74 66 75 60 L77 46 C77.5 42 80 40 83 40 C87 40 89 43 89 47 L90 62 C91 74 84 83 72 83 Z"/><path class="sn-ant" d="M80 40 L77 24 M87 41 L94 26"/><circle class="sn-shell" cx="38" cy="46" r="29"/><path class="sn-spiral" d="M40 46 C40 44 36 43 34 45 C32 48 34 52 39 52 C45 52 49 47 48 41 C46 34 38 31 32 34 C25 38 24 48 29 54 C35 61 46 61 53 54"/></svg>';
  const PNAME = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };

  /** Plies until the snails next step (1 to 6), counted from the position G is showing. */
  const snailPlies = () => 2 * (G.snailMoveNo() - G.fullmove) + (G.turn === WHITE ? 2 : 1);

  /** What the snails did on the last move, in words ("" when they did not step). */
  function snailLine(h) {
    if (!h || !h.sn) return '';
    const ate = h.sn.eaten.map(([, p]) => (isWhite(p) ? 'White' : 'Black') + ' ' + PNAME[p & 7]);
    return 'The snails crawled one step' + (ate.length ? ' and ate ' + ate.join(' and ') : '') + '. ';
  }

  /** The strip under the status line: when the snails step next, tap it for the rules. */
  function renderSnailInfo() {
    const el = $('#snail-info');
    if (!el) return;
    const on = G.mode === 'snail' && phase !== 'pick-w' && phase !== 'pick-b' && !G.snailKilled && phase !== 'over' && !(phase === 'replay' && replay && replay.idx >= replay.data.moves.length && replay.data.result);
    el.classList.toggle('hidden', !on);
    if (!on) return;
    const pl = snailPlies();
    const when = pl === 1 ? 'right after this move' : pl === 2 ? "right after Black's reply" : 'after move ' + G.snailMoveNo();
    el.classList.toggle('soon', pl <= 2);
    el.innerHTML = '<span class="si-ic">' + SNAIL_SVG + '</span><span class="si-t">Snails step <b>' + when + '</b></span><span class="si-q" aria-hidden="true">?</span>';
  }

  function showSnailRules() {
    openSheet(`<h2>Immortal Snail<span class="sub">Two snails, one on each side.</span></h2>
      <div class="sn-rules">
        <p><b>Your snail hunts your own king.</b> White's snail starts on d4 and Black's on d5.</p>
        <p><b>Every 3 full moves</b> (after Black's 3rd, 6th, 9th move...) both snails crawl one tile straight towards their king.</p>
        <p>If a snail steps onto a king, <b>that king's side loses</b>. If both do on the same step, it is a draw.</p>
        <p>You cannot capture a snail, and nothing can move onto it or through it. Pieces on the tile a snail steps onto are <b>eaten</b>, whoever owns them.</p>
        <p>The red tile shows where a snail steps next. Keep your king moving away from it.</p>
      </div>
      <button class="btn wide primary" id="snr-ok">Got it</button>`, true);
    $('#snr-ok').onclick = closeSheet;
  }
  $('#snail-info').addEventListener('click', showSnailRules);

  /* ---------------------------------------------------------- Gamblite Chess */
  let rollTimer = null;
  /** The odds strip: how the next roll will be weighted if the side to move plays, and how the last roll went. */
  function renderOdds() {
    const el = $('#odds');
    if (!el) return;
    const on = G.mode === 'gamble' && (phase === 'play' || phase === 'over' || phase === 'replay' || phase === 'names') && !G.kingTaken;
    el.classList.toggle('hidden', !on);
    if (!on) return;
    const pw = G.oddsAfter(G.turn);                       // White's chance at the roll that follows the next move
    $('#od-w').style.width = pw + '%';
    $('#od-b').style.width = (100 - pw) + '%';
    $('#od-wp').textContent = pw + '%';
    $('#od-bp').textContent = (100 - pw) + '%';
    $('#od-hint').textContent = 'If ' + nameOf(G.turn) + ' moves, the next roll is weighted like this.';
    const last = G.history[G.history.length - 1];
    const chance = G.turn === WHITE ? G.pW : 100 - G.pW;
    const txt = last ? 'Rolled ' + nameOf(G.turn) + ' · ' + chance + '% chance' : 'Opening roll: ' + nameOf(G.turn) + ' · 50% chance';
    const roll = $('#od-roll');
    if (roll.textContent !== txt) {
      roll.textContent = txt;
      roll.classList.remove('rolling'); void roll.offsetWidth; roll.classList.add('rolling');
      clearTimeout(rollTimer); rollTimer = setTimeout(() => roll.classList.remove('rolling'), 700);
    }
    roll.classList.toggle('lucky', !!last && chance <= 40);
  }

  function showGambleRules() {
    openSheet(`<h2>Gamblite Chess<span class="sub">Nobody knows who moves next.</span></h2>
      <div class="sn-rules">
        <p><b>Every turn is rolled.</b> The very first turn is 50/50 White or Black.</p>
        <p>After each move the odds shift <b>5 points against whoever just moved</b>. If White moves twice, White's chance is down to 40% and Black's is 60%. Odds always stay between 5% and 95%.</p>
        <p>There is <b>no check</b>. A king can be left attacked, and <b>capturing the king wins</b>.</p>
        <p>If the side that is rolled has no legal move, the other side moves instead.</p>
      </div>
      <button class="btn wide primary" id="gr-ok">Got it</button>`, true);
    $('#gr-ok').onclick = closeSheet;
  }
  $('#odds').addEventListener('click', showGambleRules);

  /** Slide the snail(s) that stepped in h from their old tile to the new one (or back, when undoing). */
  function animateSnails(h, reverse) {
    if (!h || !h.sn || !animOn() || h.sn.nw == null) return;
    for (const [a, b, c] of [[h.sn.w, h.sn.nw, WHITE], [h.sn.b, h.sn.nb, BLACK]]) {
      const from = reverse ? b : a, to = reverse ? a : b;
      if (from === to) continue;
      const se = squareEls[from], de = squareEls[to], sn = de && de._snail;
      if (!sn || !se) continue;
      const r1 = se.getBoundingClientRect(), r2 = de.getBoundingClientRect();
      sn.style.transition = 'none';
      sn.style.transform = `translate(${r1.left - r2.left}px, ${r1.top - r2.top}px)`;
      de.style.zIndex = 7;
      void sn.offsetWidth;
      sn.style.transition = 'transform .7s cubic-bezier(.4,.1,.2,1)';
      sn.style.transform = '';
      setTimeout(() => { sn.style.transition = ''; de.style.zIndex = ''; }, 760);
    }
  }

  function renderBoard() {
    const isSnail = G.mode === 'snail';
    const kill = isSnail ? G.snailKilled : 0;
    const killW = kill & WHITE ? G.kingSquare(WHITE) : -1, killB = kill & BLACK ? G.kingSquare(BLACK) : -1;
    const snNext = isSnail && !kill && phase !== 'pick-w' && phase !== 'pick-b' ? G.snailNext() : null;
    const snSoon = snNext && snailPlies() <= 2;
    const checkSq = G.inCheck(G.turn) && !(G.mode === 'guess' && phase !== 'replay') ? G.kingSquare(G.turn) : -1;   // (Guess Who never announces check)
    const gam = G.mode === 'gamble' && !G.kingTaken;   // no check here, but an attacked king is in real danger
    const dangerW = gam && G.kingAttacked(WHITE) ? G.kingSquare(WHITE) : -1, dangerB = gam && G.kingAttacked(BLACK) ? G.kingSquare(BLACK) : -1;
    const lastH = G.history[G.history.length - 1];
    const last = lastH ? lastH.move : null;
    const picking = phase === 'pick-w' || phase === 'pick-b';
    const arrP = isArr();
    const guessHide = G === game && mode === 'guess' && phase !== 'replay' && viewSide !== 0 && !revealAll;   // Guess Who: enemy pieces are just coloured squares
    const pickColor = phase === 'pick-w' ? WHITE : BLACK;
    // a secret piece's queen-only moves are not hinted unless the player asked to see their queen
    const legalSet = new Map(opts.hints ? legalTargets.filter((m) => !m.q || showQueen).map((m) => [m.to, m]) : []);
    const qSq = queenMarkSq();
    boardEl.classList.toggle('picking', picking);
    const rr = last && window.MoveRating ? window.MoveRating.get(ratingIdAt(shownPly() - 1)) : null;
    const badgeSq = rr ? last.to : -1;

    for (const key in squareEls) {
      const s = +key;
      const el = squareEls[s];
      const p = G.board[s];

      el.classList.toggle('selected', picking || arrP ? s === pickSel : s === selected || (G === game && s === preSel));
      el.classList.toggle('pre-from', G === game && pre.some((m) => m.from === s));
      el.classList.toggle('pre-to', G === game && pre.some((m) => m.to === s));
      el.classList.toggle('pre-dest', G === game && preSel >= 0 && preDest.has(s));
      el.classList.toggle('pre-cap', G === game && preSel >= 0 && preDest.has(s) && !!p);
      el.classList.toggle('last', !!last && (last.from === s || last.to === s));
      el.classList.toggle('check', s === checkSq || s === killW || s === killB || s === dangerW || s === dangerB);
      el.classList.toggle('snail-next', !!snNext && (s === snNext[WHITE] || s === snNext[BLACK]));
      el.classList.toggle('soon', !!snSoon);
      const sc = isSnail ? (s === G.snW ? WHITE : s === G.snB ? BLACK : 0) : 0;
      let sne = el._snail;
      if (!sc) { if (sne) { sne.remove(); el._snail = null; el._sc = 0; } }
      else if (el._sc !== sc) {
        if (!sne) { sne = document.createElement('span'); el.appendChild(sne); el._snail = sne; }
        sne.className = 'snail ' + (sc === WHITE ? 'w' : 'b');
        sne.innerHTML = SNAIL_SVG;
        el._sc = sc;
      }
      const lm = legalSet.get(s);
      el.classList.toggle('legal', !!lm);
      el.classList.toggle('capture', !!lm && (!!p || lm.flags === 2));
      el.classList.toggle('pickable', picking && !!p && (p & 24) === pickColor && (G.mode === 'guess' || ((p & 7) !== KING && (p & 7) !== QUEEN)));
      el.classList.toggle('secret', (phase === 'replay' && G.isSecretDisguised(s)) || s === qSq);
      const hmate = hintMoves.mate || null, hbril = hintMoves.brill || null;
      const hf = !hmate && hintMoves.some((m) => m.from === s), ht = !hmate && hintMoves.some((m) => m.to === s);
      el.classList.toggle('hint-from', hf);
      el.classList.toggle('hint-to', ht);
      el.classList.toggle('hint-brill', !!hbril && !hmate && (hbril.from === s || hbril.to === s));
      el.classList.toggle('plan-from', false);
      el.classList.toggle('plan-to', false);
      const nums = [];
      let mateSq = false;
      if (hmate) {
        hmate.forEach((x) => { if (x.to === s && !nums.includes(x.n)) nums.push(x.n); });
        mateSq = nums.length > 0 || hmate[0].from === s;
      } else {
        hintMoves.forEach((m, i) => { if ((m.from === s || m.to === s) && !nums.includes(i + 1)) nums.push(i + 1); });
      }
      el.classList.toggle('hint-mate', mateSq);
      let hb = el._hb;
      if (nums.length) {
        if (!hb) { hb = document.createElement('span'); el.appendChild(hb); el._hb = hb; }
        hb.className = 'hbadge' + (hmate ? ' mate' : (el.classList.contains('hint-brill') ? ' brill' : ''));
        hb.textContent = nums.join('/');
      } else if (hb) { hb.remove(); el._hb = null; }

      let rb = el._rb;
      if (s === badgeSq) {
        if (!rb) { rb = document.createElement('span'); el.appendChild(rb); el._rb = rb; }
        rb.className = 'rbadge' + (rr.hasImg ? ' img' : '');
        rb.style.background = rr.hasImg ? '' : rr.color;
        const ih = window.MoveRating.iconHtml(rr);
        if (rb._h !== ih) { rb.innerHTML = ih; rb._h = ih; }
      } else if (rb) { rb.remove(); el._rb = null; }

      // piece
      let pe = el._piece;
      const hide = guessHide && !!p && (viewSide === -1 || (p & 24) !== viewSide) && !revealSet.has(s);
      const code = hide ? p + 1000 : p;
      if (G.mode === 'guess') {   // the selected pieces: yours always, both at the end and in replays; and your colour marks on their pieces
        const isSel = s === G.secretQueen[WHITE] || s === G.secretQueen[BLACK];
        const mine = !!p && viewSide > 0 && (p & 24) === viewSide && phase !== 'replay';
        el.classList.toggle('selpiece', isSel && !!p && (phase === 'replay' || (phase === 'over' && !hide) || (phase !== 'over' && mine) || (picking && mine)));
        el.dataset.mk = guessHide && viewSide > 0 && p && (p & 24) !== viewSide ? (marks[viewSide][s] || '') : '';
      } else if (el.classList.contains('selpiece')) { el.classList.remove('selpiece'); el.dataset.mk = ''; }
      if (!p) {
        if (pe) { pe.remove(); el._piece = null; el._code = 0; }
      } else if (el._code !== code) {
        if (!pe) {
          pe = document.createElement('span');
          el.appendChild(pe);
          el._piece = pe;
        }
        pe.className = 'piece ' + (isWhite(p) ? 'w' : 'b') + (hide ? ' blind' : '');
        if (hide) {   // nothing about the piece may show: no glyph, no skin or hat tags left over from when it was visible
          pe.textContent = '';
          for (const k of ['pk', 'k', 'px', 'hat', 'hatk']) delete pe.dataset[k];
          for (const k of ['--px', '--sheet', '--hx', '--hy', '--hw']) pe.style.removeProperty(k);
        } else pe.textContent = glyph(p);
        el._code = code;
      }
    }
    drawPre();
  }

  /** The square of the mover's secret piece while they are looking at it, otherwise -1. */
  function queenMarkSq() {
    if (!showQueen || phase !== 'play' || G !== game || game.mode !== 'secret') return -1;
    const s = game.secretQueen[game.turn];
    return s >= 0 && game.isSecretDisguised(s) ? s : -1;
  }

  /** The Show queen button: only for a human about to move in Secret Queen. */
  function canShowQueen() {
    return mode === 'secret' && phase === 'play' && !aiBusy && !pendingPromo && humanTurn() && !bots
      && viewPly === sans.length && game.secretQueen[game.turn] >= 0 && game.isSecretDisguised(game.secretQueen[game.turn]);
  }

  function updateQueenBtn() {
    const b = $('#queen-btn');
    b.classList.toggle('hidden', mode !== 'secret');
    if (!canShowQueen()) showQueen = false;
    b.disabled = !canShowQueen();
    b.classList.toggle('on', showQueen);
    b.setAttribute('aria-pressed', showQueen ? 'true' : 'false');
    b.textContent = showQueen ? 'Hide queen' : 'Show queen';
  }

  /* slide the piece that now sits on dst as if it came from src */
  function slide(src, dst) {
    if (!animOn()) return;
    const de = squareEls[dst], se = squareEls[src];
    const pe = de && de._piece;
    if (!pe || !se) return;
    const a = se.getBoundingClientRect(), b = de.getBoundingClientRect();
    pe.style.transition = 'none';
    pe.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    de.style.zIndex = 6;
    void pe.offsetWidth;
    pe.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)';
    pe.style.transform = '';
    setTimeout(() => { pe.style.transition = ''; de.style.zIndex = ''; }, 280);
  }

  function animateMove(m, reverse) {
    if (m.ask) return;
    if (m.spawn) { if (!reverse) popReveal(m.to); return; }
    const pairs = [[m.from, m.to]];
    if (m.flags === 4 || m.flags === 8) {
      const r = rankOf(m.from);
      pairs.push(m.flags === 4 ? [sq(7, r), sq(5, r)] : [sq(0, r), sq(3, r)]);
    }
    for (const [a, b] of pairs) reverse ? slide(b, a) : slide(a, b);
  }

  function popReveal(s) {
    setTimeout(() => {
      const pe = squareEls[s] && squareEls[s]._piece;
      if (!pe) return;
      pe.classList.add('reveal');
      pe.addEventListener('animationend', () => pe.classList.remove('reveal'), { once: true });
    }, 200);
  }

  /* ------------------------------------------------------------ player bars */
  function capturedBy(g) {
    const byWhite = [], byBlack = [];
    for (const h of g.history) {
      if (h.captured) (isWhite(h.captured) ? byBlack : byWhite).push(h.captured);
      if (h.epCaptured) (isWhite(h.epCaptured) ? byBlack : byWhite).push(h.epCaptured);
    }
    const sort = (a, b) => (b & 7) - (a & 7);
    return { w: byWhite.sort(sort), b: byBlack.sort(sort) };
  }

  /** Ratings next to the names in one-player Classic and Secret Queen games. */
  function eloTag(c) {
    const Pf = window.LP && window.LP.profile;
    if (!Pf || !ai || bots || playBoth || phase === 'replay' || !Pf.MODES[mode]) return '';
    return ' (' + (c === ai.human ? Pf.elo(mode) : Pf.botRating(ai.level)) + ')';
  }

  function fillBar(prefix, color, caps, adv) {
    $('#' + prefix + '-name').textContent = nameOf(color) + eloTag(color);
    $('#' + prefix + '-dot').className = 'dot ' + (color === WHITE ? 'w' : 'b');
    const box = $('#' + prefix + '-captured');
    box.innerHTML = '';
    caps.forEach((p) => {
      const sp = document.createElement('span');
      sp.className = 'cp ' + (isWhite(p) ? 'w' : 'b');
      sp.textContent = glyph(p);
      box.appendChild(sp);
    });
    if (adv > 0) {
      const a = document.createElement('span');
      a.className = 'adv';
      a.textContent = '+' + adv;
      box.appendChild(a);
    }
  }

  function renderBars() {
    const topColor = flipped ? WHITE : BLACK;
    const botColor = flipped ? BLACK : WHITE;
    const c = capturedBy(G);
    const val = (arr) => arr.reduce((t, p) => t + VALUE[p & 7], 0);
    const diff = val(c.w) - val(c.b); // >0 means white is ahead
    const capsFor = (col) => (col === WHITE ? c.w : c.b);
    const advFor = (col) => (col === WHITE ? diff : -diff);
    fillBar('top', topColor, capsFor(topColor), advFor(topColor));
    fillBar('bottom', botColor, capsFor(botColor), advFor(botColor));
    const live = phase === 'play' || phase === 'replay';
    const turnC = G.turn;
    $('#top-bar').classList.toggle('active', live && turnC === topColor);
    $('#bottom-bar').classList.toggle('active', live && turnC === botColor);
    updateClocks();
  }

  /* ---------------------------------------------------------------- clocks */
  const fmtClock = (ms) => {
    ms = Math.max(0, ms);
    if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
    const t = Math.ceil(ms / 1000), m = Math.floor(t / 60), sec = t % 60;
    return m + ':' + String(sec).padStart(2, '0');
  };
  /** The two clocks while a timed game is being replayed: what was left after the last move, minus the time since then for the side to move. */
  function replayClocks() {
    if (phase !== 'replay' || !replay || !replay.timed) return null;
    const d = replay.data, base = d.clock.base, i = replay.idx;
    const c = i && d.clk && d.clk[i - 1] ? d.clk[i - 1] : [base, base];
    const out = { [WHITE]: c[0], [BLACK]: c[1] };
    if (i >= 1 && i < d.moves.length + 1) {
      const side = G.turn;
      if (!(i === d.moves.length && d.winner !== null && !/time/i.test(d.result || ''))) out[side] = Math.max(0, out[side] - Math.max(0, replay.t - d.at[i - 1]));
    }
    return out;
  }
  function updateClocks() {
    const topColor = flipped ? WHITE : BLACK, botColor = flipped ? BLACK : WHITE;
    const rc = replayClocks(), cl = rc || clock;
    [['top', topColor], ['bottom', botColor]].forEach(([p, c]) => {
      const el = $('#' + p + '-clock');
      el.classList.toggle('hidden', !cl);
      if (!cl) return;
      el.textContent = fmtClock(cl[c]);
      el.classList.toggle('low', cl[c] < 10000);
      el.classList.toggle('run', rc ? replay.idx > 0 && G.turn === c : phase === 'play' && sans.length > 0 && G.turn === c);
    });
  }
  function clockTick() {
    if (!clock || phase !== 'play' || bots || paused || sans.length < 1 || viewPly < sans.length) { lastTick = 0; return; }
    if (online && game.turn !== online.me && clock[game.turn] <= 0) {   // the other player's clock hit zero: give their own browser a few seconds to say so before claiming it
      if (!online.flagAt) online.flagAt = Date.now();
      if (Date.now() - online.flagAt > 5000) flagFall(game.turn);
      return;
    }
    const now = Date.now();
    if (!lastTick) { lastTick = now; return; }
    clock[game.turn] -= now - lastTick;
    lastTick = now;
    updateClocks();
    if (clock[game.turn] <= 0) { clock[game.turn] = 0; updateClocks(); flagFall(game.turn); }
  }
  setInterval(clockTick, 100);
  /** A side ran out of time: the other side wins, unless it only has a bare king left. */
  function flagFall(loser) {
    const winner = loser === WHITE ? BLACK : WHITE;
    let others = 0;
    for (let s2 = 0; s2 < 128; s2++) { if (s2 & 0x88) { s2 += 7; continue; } const p = game.board[s2]; if (p && (p & 24) === winner && (p & 7) !== KING) others++; }
    aiToken++; aiBusy = false;
    if (!others) endGame('material', winner); else endGame('time', winner);
    clearSession();
  }

  /* ------------------------------------------------------------- move list */
  function renderMoves(list, cur) {
    moveListEl.innerHTML = '';
    let pair = null;
    if (phase === 'replay' ? !!(replay && replay.data.mode === 'gamble') : mode === 'gamble') {
      // turns are rolled, so moves do not alternate: show them one by one in the colour of whoever played them
      const src = phase === 'replay' ? replay.data.moves : fullMoves;
      list.forEach((san, i) => {
        const pr = document.createElement('div');
        pr.className = 'pair';
        const b = document.createElement('button');
        b.className = 'move ' + (src[i] && src[i].mc === BLACK ? 'b' : 'w') + (i === cur - 1 ? ' current' : '');
        b.dataset.ply = i;
        const mn = document.createElement('span');
        mn.className = 'mn';
        mn.textContent = (i + 1) + '. ';
        b.appendChild(mn);
        b.appendChild(document.createTextNode(fmt(san)));
        pr.appendChild(b);
        moveListEl.appendChild(pr);
      });
      const ce = moveListEl.querySelector('.current');
      movesScroll.scrollLeft = ce ? ce.parentElement.offsetLeft - movesScroll.clientWidth / 2 : list.length ? movesScroll.scrollWidth : 0;
      return;
    }
    list.forEach((san, i) => {
      if (i % 2 === 0) {
        pair = document.createElement('div');
        pair.className = 'pair';
        moveListEl.appendChild(pair);
        const pn = document.createElement('span');
        pn.className = 'pn';
        pn.textContent = Math.floor(i / 2) + 1 + '.';
        pair.appendChild(pn);
      }
      const b = document.createElement('button');
      b.className = 'move ' + (i % 2 === 0 ? 'w' : 'b') + (i === cur - 1 ? ' current' : '');
      b.dataset.ply = i;
      const mn = document.createElement('span');
      mn.className = 'mn';
      mn.textContent = Math.floor(i / 2) + 1 + '. ';
      b.appendChild(mn);
      b.appendChild(document.createTextNode(fmt(san)));
      const rid = ratingIdAt(i), rinfo = rid && window.MoveRating ? window.MoveRating.get(rid) : null;
      if (rinfo) { const sp = document.createElement('span'); sp.className = 'mv-r'; sp.style.color = rinfo.color; sp.innerHTML = ' ' + window.MoveRating.iconHtml(rinfo); b.appendChild(sp); }
      pair.appendChild(b);
    });
    const cEl = moveListEl.querySelector('.current');
    if (cEl) {
      const pr = cEl.parentElement;
      movesScroll.scrollLeft = pr.offsetLeft - movesScroll.clientWidth / 2;
      movesScroll.scrollTop = pr.offsetTop - movesScroll.clientHeight / 2;
    } else if (list.length) {
      movesScroll.scrollLeft = movesScroll.scrollWidth;
      movesScroll.scrollTop = movesScroll.scrollHeight;
    } else {
      movesScroll.scrollLeft = 0;
      movesScroll.scrollTop = 0;
    }
  }

  moveListEl.addEventListener('click', (e) => {
    const b = e.target.closest('.move');
    if (b && phase === 'replay') { pauseReplay(); goTo(+b.dataset.ply + 1, false); }
  });

  /* ---------------------------------------------------------------- status */
  function setStatus(text, cls, html) {
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    if (html) statusEl.innerHTML = html; else statusEl.textContent = text || ' ';
  }

  function updateStatus() {
    let text = nameOf(G.turn) + "'s move";
    let cls = '';
    if (G.inCheck(G.turn) && G.mode !== 'guess') { text += ' — check'; cls = 'check'; }
    const h = G.history[G.history.length - 1];
    if (G === game && !branch() && viewPly < sans.length) {
      setStatus(viewPly ? `Viewing move ${viewPly} of ${sans.length} (${fmt(sans[viewPly - 1])})` : 'Viewing the start position', 'dim');
      return;
    }
    if (G.mode === 'secret' && h && h.wasSecretMove) {
      const who = G.turn === WHITE ? BLACK : WHITE;
      text = nameOf(who) + ' revealed a Secret Queen. ' + text;
    }
    if (G.mode === 'snail') text = snailLine(h) + text;
    if (G.mode === 'royale' && h && h.move.spawn) text = nameOf(h.mover) + ' spawned a ' + PNAME[h.move.spawn] + '. ' + text;
    if (G.mode === 'gamble') {
      if (h && h.mover === G.turn) text = nameOf(G.turn) + ' moves again';
      if (G.kingAttacked(G.turn)) { text += ' — king attacked'; cls = 'check'; }
    }
    setStatus(text, cls);
  }

  function updateHintGlow() {
    $('#hint-btn').classList.toggle('glow', hintAvail && !hintMoves.length && phase === 'play' && !aiBusy);
  }

  /* look for a forced mate for the side to move, so the Hint button can glow */
  function refreshHint() {
    const tok = ++hintToken;
    hintAvail = false;
    hintCache = null;
    updateHintGlow();
    if (!isTas() || phase !== 'play' || aiBusy || !humanTurn()) return;
    setTimeout(() => {
      if (tok !== hintToken || phase !== 'play' || aiBusy) return;
      const result = window.findMateLine ? window.findMateLine(game, 6, 300) : null;
      hintCache = { key: positionKey(game), result };
      hintAvail = !!result;
      updateHintGlow();
    }, 120);
  }

  function updateControls() {
    const pickPhase = phase === 'pick-w' || phase === 'pick-b';
    const tas = isTas();
    $('#pick-bar').classList.toggle('hidden', !pickPhase);
    $('#arr-bar').classList.toggle('hidden', !isArr());
    $('#controls').classList.toggle('hidden', pickPhase || isArr() || phase === 'replay');
    $('#controls').classList.toggle('tas', tas);
    $('#replay-controls').classList.toggle('hidden', phase !== 'replay');
    $('#hint-btn').classList.toggle('hidden', !tas);
    $('#save-btn').classList.add('hidden');
    $('#forfeit-btn').classList.toggle('hidden', tas || !!bots || phase !== 'play');
    $('#draw-btn').classList.toggle('hidden', !online || phase !== 'play');
    $('#reset-btn').classList.toggle('hidden', !!online);
    const nav = (phase === 'play' || phase === 'over') && !aiBusy && mode !== 'guess' && !(online && phase === 'play');   // stepping back would stop your own clock   // no undo in Guess Who: it would show you what you were not meant to see
    $('#undo-btn').textContent = tas ? 'Undo' : 'Back';      // only Sandbox really undoes a move; everywhere else it just steps the view
    $('#redo-btn').textContent = tas ? 'Redo' : 'Forward';
    $('#undo-btn').disabled = !nav || viewPly === 0;
    $('#redo-btn').disabled = !nav || viewPly >= sans.length;
    $('#hint-btn').disabled = !(phase === 'play' && !aiBusy && ai && humanTurn() && !(paused && clock && !bots));
    $('#both-btn').classList.toggle('hidden', !tas);
    $('#pause-btn').classList.toggle('hidden', !(bots || clock) || !!online || phase !== 'play');
    $('#pause-btn').textContent = paused ? 'Resume' : 'Pause';
    $('#pause-btn').classList.toggle('on', paused);
    $('#both-btn').classList.toggle('on', playBoth);
    $('#both-btn').setAttribute('aria-pressed', playBoth ? 'true' : 'false');
    $('#both-btn').disabled = !(phase === 'play' || phase === 'over');
    updateHintGlow();
    updateQueenBtn();
    $('#flip-btn').classList.toggle('hidden', opts.autoFlip);   // auto-flip on: the button is not there at all
    const noNav = mode === 'guess';   // no undo / redo in Guess Who
    $('#undo-btn').classList.toggle('hidden', noNav);
    $('#redo-btn').classList.toggle('hidden', noNav);
    document.querySelector('.layout').classList.toggle('replaying', phase === 'replay');
  }

  function renderAll() {
    renderBoard();
    renderBars();
    updateControls();
    updateRatingLine();
    renderSnailInfo();
    renderOdds();
    renderRoyale();
    renderGuessBar();
  }

  /* ------------------------------------------------------------- menu/start */
  document.querySelectorAll('.mode[data-mode="basic"], .mode[data-mode="secret"], .mode[data-mode="snail"], .mode[data-mode="gamble"], .mode[data-mode="guess"], .mode[data-mode="royale"], .mode[data-mode="tas"], .mode[data-mode="bullet"], .mode[data-mode="rapid"]').forEach((b) => {
    b.addEventListener('click', () => chooseMode(b.dataset.mode));
  });

  function chooseMode(m) { startFen = null; pz = null; guardSlots(() => chooseMode2(m)); }
  function chooseMode2(m) {
    if (m === 'tas') { pendingTc = null; askDifficulty(m); return; }   // TAS is single player only
    if (m === 'bullet' || m === 'rapid') { askClock(m); return; }
    pendingTc = null;
    askPlayers(m, false);
  }

  /* Bullet: 1 or 3 minutes, no extra time. Rapid: 5 or 10 minutes plus 2 seconds every move. */
  function askClock(m) {
    const opts2 = m === 'bullet' ? [[60, 0, '1 minute', 'Each side gets 1 minute. No extra time.'], [180, 0, '3 minutes', 'Each side gets 3 minutes. No extra time.']]
      : [[300, 2, '5 minutes + 2', 'Each side gets 5 minutes and 2 seconds back every move.'], [600, 2, '10 minutes + 2', 'Each side gets 10 minutes and 2 seconds back every move.']];
    openSheet(`<h2>${m === 'bullet' ? 'Bullet' : 'Rapid'}<span class="sub">Pick the time for each side.</span></h2>
      <div class="stack">${opts2.map((o, i) => `<button class="btn big tc" data-i="${i}"><b>${o[2]}</b>${lastOf('tc:' + m) === i ? LAST_TAG : ''}<small>${o[3]}</small></button>`).join('')}<button class="btn" id="tc-x">Cancel</button></div>`, true);
    sheet.querySelectorAll('.tc').forEach((b) => { b.onclick = () => { remember('tc:' + m, +b.dataset.i); const o = opts2[+b.dataset.i]; pendingTc = { base: o[0], inc: o[1] }; askPlayers(m, true); }; });
    $('#tc-x').onclick = closeSheet;
  }

  function askPlayers(m, noBots) {
    openSheet(`<h2>How many players?</h2>
      <div class="stack">
        ${noBots ? '' : '<button class="btn big" id="pl-0">0 players</button>'}
        <button class="btn big" id="pl-1">1 player${lastOf('players') === 1 ? LAST_TAG : ''}</button>
        <button class="btn big" id="pl-2">2 players${lastOf('players') === 2 ? LAST_TAG : ''}</button>
        <button class="btn" id="pl-x">Cancel</button>
      </div>`, true);
    if (!noBots) $('#pl-0').onclick = () => askBot(m, WHITE, null);
    $('#pl-1').onclick = () => { remember('players', 1); askDifficulty(m); };
    $('#pl-2').onclick = () => { remember('players', 2); closeSheet(); startGame(m, false, null); };
    $('#pl-x').onclick = closeSheet;
  }

  /* 0 players: pick a computer level for White, then for Black, and watch them play */
  function askBot(m, color, whiteLevel) {
    const white = color === WHITE;
    levelMenu((white ? 'White' : 'Black') + ' computer', white ? 'Pick the first computer.' : 'Pick the second computer.', (lv) => {
      if (white) askBot(m, BLACK, lv);
      else { closeSheet(); startBots(m, whiteLevel, lv); }
    });
  }

  function startBots(m, wl, bl) {
    freshGame(m);
    phase = 'names';
    ai = null;
    bots = { [WHITE]: wl, [BLACK]: bl };
    names = { [WHITE]: 'Computer (' + LEVEL_LABEL[wl] + ')', [BLACK]: 'Computer (' + LEVEL_LABEL[bl] + ')' };
    viewNames = names;
    opts.autoFlip = false;
    opts.ratings = false;
    showPage('game');
    buildBoard();
    renderAll();
    renderMoves([], 0);
    setStatus('');
    closeSheet();
    afterNames();
  }

  /* The computer levels, weakest to strongest, shown as cards (also used by Capture Rush) */
  const LEVEL_INFO = [
    { id: 'dumb',   ic: '0', col: '#9aa0a6', n: 1, tag: 'About 10',      sub: 'Tries its best to lose.' },
    { id: 'easy',   ic: '4', col: '#8fc15b', n: 2, tag: 'About 150',     sub: 'Makes plenty of mistakes.' },
    { id: 'medium', ic: '1', col: '#5ab0ff', n: 3, tag: 'About 600',     sub: 'Plays like an average player.' },
    { id: 'hard',   ic: '5', col: '#f2c45a', n: 4, tag: 'About 1100',    sub: 'A solid, improving player.' },
    { id: 'godly',  ic: '2', col: '#b48cf2', n: 5, tag: 'About 1800',    sub: 'Looks far ahead and varies its strong moves.' },
    { id: 'insane', ic: '3', col: '#ff6b6b', n: 5, tag: 'About 2200',    sub: 'Plays book lines and hunts for brilliant moves.' },
  ];
  const lastOf = (k) => (window.LP && window.LP.prefs ? window.LP.prefs.last(k) : undefined);
  const remember = (k, v) => { try { if (window.LP && window.LP.prefs) window.LP.prefs.remember(k, v); } catch (e) { /* ignore */ } };
  const LAST_TAG = ' <em class="last-tag">Last used</em>';
  function levelMenu(title, sub, cb) {
    const lastLv = lastOf('level');
    openSheet(`<h2>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h2>
      <div class="lv-list">
        ${LEVEL_INFO.map((l) => `<button class="lv-card" data-lv="${l.id}" style="--lc:${l.col}">
          <span class="lv-ic" aria-hidden="true"><i class="ic-sp" style="--i:${l.ic}"></i></span>
          <span class="lv-text"><span class="lv-top"><b>${LEVEL_LABEL[l.id]}</b><em>${l.tag}</em>${l.id === lastLv ? LAST_TAG : ''}</span><span class="lv-sub">${l.sub}</span>
            <span class="lv-meter" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l.n ? 'on' : ''}"></i>`).join('')}</span></span>
        </button>`).join('')}
      </div>
      <button class="btn wide" id="df-x">Cancel</button>`, true);
    sheet.querySelectorAll('[data-lv]').forEach((b) => { b.onclick = () => { remember('level', b.dataset.lv); cb(b.dataset.lv); }; });
    $('#df-x').onclick = closeSheet;
  }

  function askDifficulty(m) {
    levelMenu('Choose difficulty', 'Who do you want to play?', (lv) => { closeSheet(); startGame(m, false, lv); });
  }

  let gameStart = 0;
  function freshGame(m) {
    gameStart = Date.now();
    mode = m;
    game.mode = engineMode(m);
    game.reset();
    if (startFen) { if (game.loadFen(startFen)) startFen = null; else game.problems(); }
    clearInterval(revealTimer); revealSet = new Set(); revealAll = false; viewSide = 0; arrs = {};
    gFirst = 0;
    marks = { [WHITE]: {}, [BLACK]: {} }; markTool = ''; gwStage = ''; gwLast = ''; pendingBotGuess = -1;
    spawnSel = 0;
    if (m === 'gamble' && !startFen) { gFirst = Math.random() < 0.5 ? WHITE : BLACK; game.turn = gFirst; }   // even the first turn is a 50/50 roll
    G = game;
    session.fresh();
    moveAt = []; moveClk = []; playStart = 0;
    viewNames = names;
    sans = [];
    fullMoves = [];
    ratings = [];
    posKeys = [];
    viewPly = 0;
    aiToken++;
    aiBusy = false;
    hintMoves = [];
    hintAvail = false;
    hintCache = null;
    hintToken++;
    classicMods = new Set();
    pend = null;
    online = null;
    lastModTool = '';
    if (window.LP && window.LP.mods) window.LP.mods.clearTool();   // a mod tool never carries over into a new game
    playBoth = false;
    paused = false;
    clearTimeout(flipTimer);
    selected = -1;
    legalTargets = [];
    clearPre();
    pickSel = -1;
    showQueen = false;
    flipped = false;
    pendingPromo = false;
    over = null;
    replay = null;
    initialSecrets = { [WHITE]: -1, [BLACK]: -1 };
    resigned = null;
    lastTick = 0;
    clock = pendingTc && (m === 'bullet' || m === 'rapid' || m === 'online') ? { [WHITE]: pendingTc.base * 1000, [BLACK]: pendingTc.base * 1000, inc: pendingTc.inc * 1000, base: pendingTc.base * 1000 } : null;
    sidesCtx = { w: 'p1', b: 'p2' };
    coverEl.classList.add('hidden');
    document.documentElement.classList.toggle('is-tas', m === 'tas');
    $('#mode-title').textContent = pz ? pz.name + ' · ' + pz.goal : startFen && m !== 'guess' ? 'Custom position' : MODE_LABEL[m];
  }

  function startGame(m, keepNames, level) {
    if (m === 'guess') startFen = null;   // every Guess Who game starts with fresh arrangements
    freshGame(m);
    phase = 'names';
    if (!keepNames) {
      names = { [WHITE]: 'White', [BLACK]: 'Black' };
      ai = level ? { level, color: BLACK, human: WHITE } : null;
      bots = null;
    }
    viewNames = names;
    showPage('game');
    buildBoard();
    renderAll();
    renderMoves([], 0);
    setStatus('');
    closeSheet();
    if (keepNames) { loadOptsFromSettings(); afterNames(); }
    else if (ai) askSoloName();
    else askName(WHITE);
  }

  function saveSession() {
    if (phase !== 'play' || !fullMoves.length || online) return;
    session.set({
      kind: 'chess', mode, names: { [WHITE]: names[WHITE], [BLACK]: names[BLACK] }, ai, bots,
      opts: { autoFlip: opts.autoFlip, hints: opts.hints, ratings: opts.ratings }, ratings: ratings.slice(), secrets: initialSecrets,
      moves: fullMoves.map((m) => Object.assign({}, m)), sans: sans.slice(), viewPly, playBoth, date: Date.now(),
      clock: clock ? { w: clock[WHITE], b: clock[BLACK], inc: clock.inc, base: clock.base } : null,
      fen: startFen, pz: pz, mods: Array.from(classicMods), ped: pend && pend.map.size ? { c: pend.castling, e: Array.from(pend.map, ([sq, v]) => [sq, v.old, v.nw]) } : null, at: moveAt.slice(), clk: moveClk.slice(), gfirst: gFirst || null,
      gw: mode === 'guess' ? { marks: { w: marks[WHITE], b: marks[BLACK] }, last: gwLast } : null,
    });
  }
  function clearSession() { session.clear(); }

  function resumeChess(d) {
    closeSheet();
    if (d.mode === 'foresight') d = Object.assign({}, d, { mode: 'basic' });   // Foresight Chess was removed: an old save carries on as a normal game
    startFen = d.fen || null;
    pz = d.pz || null;
    freshGame(d.mode);
    session.use(d.id);
    classicMods = new Set(d.mods || []);
    if (d.gfirst) { gFirst = d.gfirst; game.turn = gFirst; }
    moveAt = (d.at || []).slice(); moveClk = (d.clk || []).slice();
    playStart = Date.now() - (moveAt.length ? moveAt[moveAt.length - 1] : 0);
    names = { [WHITE]: d.names[WHITE], [BLACK]: d.names[BLACK] };
    viewNames = names;
    ai = d.ai || null;
    bots = d.bots || null;
    opts.autoFlip = d.opts.autoFlip;
    opts.hints = d.opts.hints;
    opts.ratings = !!d.opts.ratings;
    ratings = (d.ratings || []).slice();
    initialSecrets = { [WHITE]: d.secrets[WHITE], [BLACK]: d.secrets[BLACK] };
    game.secretQueen = { [WHITE]: initialSecrets[WHITE], [BLACK]: initialSecrets[BLACK] };
    sans = d.sans.slice();
    fullMoves = d.moves.map((m) => Object.assign({}, m));
    posKeys = [positionKey(game)];
    for (const m of fullMoves) { game.makeMove(m); posKeys.push(positionKey(game)); }
    viewPly = fullMoves.length;
    while (viewPly > d.viewPly) { game.unmakeMove(); viewPly--; }
    playBoth = !!d.playBoth;
    if (d.ped && viewPly === fullMoves.length) { pend = { map: new Map(d.ped.e.map((e) => [e[0], { old: e[1], nw: e[2] }])), castling: d.ped.c }; pend.map.forEach((v, sq2) => { game.board[sq2] = v.nw; }); game.problems(); }
    if (d.gw) { marks = { [WHITE]: d.gw.marks.w || {}, [BLACK]: d.gw.marks.b || {} }; gwLast = d.gw.last || ''; }
    if (d.clock) { clock = { [WHITE]: d.clock.w, [BLACK]: d.clock.b, inc: d.clock.inc, base: d.clock.base }; pendingTc = { base: d.clock.base / 1000, inc: d.clock.inc / 1000 }; } else clock = null;
    sidesCtx = ai ? { [ai.human === WHITE ? 'w' : 'b']: 'p1', [ai.human === WHITE ? 'b' : 'w']: 'p2' } : { w: 'p1', b: 'p2' };
    phase = 'play';
    showPage('game');
    flipped = false;
    buildBoard();
    setFlipped(ai ? ai.human === BLACK : opts.autoFlip && game.turn === BLACK, false);
    renderAll();
    renderMoves(sans, viewPly);
    updateStatus();
    if (mode === 'guess') {
      viewSide = ai ? ai.human : bots ? 0 : -1;
      renderAll();
      if (!ai && !bots) guessHandoff(game.turn);
    }
    if (viewPly === sans.length) maybeAI();
    refreshHint();
  }

  function backToMenu() { closeSheet(); aiToken++; aiBusy = false; phase = 'menu'; renderSavedList(); showPage('menu'); }

  function askName(color) {
    const white = color === WHITE;
    openSheet(`<h2>${white ? 'White' : 'Black'}, what is your name?</h2>
      <input id="name-in" type="text" maxlength="16" placeholder="${white ? 'White' : 'Black'}" autocomplete="off" autocapitalize="words" enterkeyhint="next">
      <div class="row"><button class="btn" id="n-cancel">Cancel</button><button class="btn primary" id="n-ok">${white ? 'Next' : 'Start'}</button></div>`);
    const inp = $('#name-in');
    if (white && window.LP.profile && window.LP.profile.name()) inp.value = window.LP.profile.name();
    const ok = () => {
      names[color] = inp.value.trim() || cname(color);
      if (white) askName(BLACK); else { loadOptsFromSettings(); closeSheet(); afterNames(); }
    };
    $('#n-ok').onclick = ok;
    $('#n-cancel').onclick = backToMenu;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  /* single player: your name, which side, then hints */
  function askSoloName() {
    const mine = window.LP.profile && window.LP.profile.name();
    if (mine) { askSide(mine); return; }            // the profile name is used automatically
    openSheet(`<h2>What is your name?</h2>
      <input id="name-in" type="text" maxlength="16" placeholder="Player" autocomplete="off" autocapitalize="words" enterkeyhint="next">
      <div class="row"><button class="btn" id="n-cancel">Cancel</button><button class="btn primary" id="n-ok">Next</button></div>`);
    const inp = $('#name-in');
    const ok = () => { const nm = inp.value.trim() || 'Player'; if (window.LP.profile) window.LP.profile.setName(nm); askSide(nm); };
    $('#n-ok').onclick = ok;
    $('#n-cancel').onclick = backToMenu;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  function askSide(name) {
    openSheet(`<h2>Play as</h2>
      <div class="stack">
        <button class="btn big" data-side="w">White</button>
        <button class="btn big" data-side="b">Black</button>
        <button class="btn big" data-side="r">Random</button>
      </div>`);
    sheet.querySelectorAll('[data-side]').forEach((b) => {
      b.onclick = () => {
        let side = b.dataset.side;
        if (side === 'r') side = Math.random() < 0.5 ? 'w' : 'b';
        ai.human = side === 'w' ? WHITE : BLACK;
        ai.color = ai.human === WHITE ? BLACK : WHITE;
        names = { [ai.human]: name, [ai.color]: 'Computer (' + LEVEL_LABEL[ai.level] + ')' };
        viewNames = names;
        sidesCtx = { [ai.human === WHITE ? 'w' : 'b']: 'p1', [ai.human === WHITE ? 'b' : 'w']: 'p2' };   // you are Player 1 whichever colour you play
        loadOptsFromSettings();
        opts.autoFlip = false;   // solo always faces your side
        closeSheet();
        afterNames();
      };
    });
  }

  function askYN(question, sub, cb) {
    openSheet(`<h2>${esc(question)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h2>
      <div class="row"><button class="btn" id="yn-n">No</button><button class="btn primary" id="yn-y">Yes</button></div>`);
    const done = (v) => { document.removeEventListener('keydown', kd); cb(v); };
    const kd = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'y') done(true); else if (k === 'n') done(false);
    };
    document.addEventListener('keydown', kd);
    $('#yn-y').onclick = () => done(true);
    $('#yn-n').onclick = () => done(false);
  }

  /* orientation: auto-flip puts the player to move at the bottom */
  function setFlipped(f, animate) {
    if (f === flipped) return;
    const apply = () => { flipped = f; buildBoard(); renderAll(); boardEl.classList.remove('fading'); };
    if (!animate) { apply(); return; }
    boardEl.classList.add('fading');
    setTimeout(apply, 170);
  }

  function syncFlip(animate, delay) {
    clearTimeout(flipTimer);
    if (!opts.autoFlip) return;
    flipTimer = setTimeout(() => {
      if (phase !== 'play' && phase !== 'over') return;
      if (viewPly < sans.length) return;
      setFlipped(game.turn === BLACK, animate);
    }, delay || 0);
  }

  function showToast(text, nudge = true) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    if (!nudge) return;
    const r = $('#redo-btn');
    r.classList.remove('nudge');
    void r.offsetWidth;
    r.classList.add('nudge');
  }

  function afterNames() {
    renderBars();
    if (mode === 'guess') { guessBegin(); return; }
    if (bots) {   // two computers: they each pick a random secret piece, then play
      if (mode === 'secret') {
        game.secretQueen[WHITE] = pickSecretPawn(WHITE);
        game.secretQueen[BLACK] = pickSecretPawn(BLACK);
        initialSecrets = { [WHITE]: game.secretQueen[WHITE], [BLACK]: game.secretQueen[BLACK] };
      }
      beginPlay();
      return;
    }
    if (mode === 'secret') pickHandoff(ai ? ai.human : WHITE); else beginPlay();
  }

  /* ------------------------------------------------ Guess Who Chess */
  const GL = { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' };
  const STD_ARR = [4, 2, 3, 5, 6, 3, 2, 4, 1, 1, 1, 1, 1, 1, 1, 1];
  const isArr = () => phase === 'arr-w' || phase === 'arr-b';
  const coverUp = () => !coverEl.classList.contains('hidden');

  /** The two arrangements as a starting position: no castling, White to move. */
  function arrFen() {
    const row = (a, from, up) => a.slice(from, from + 8).map((t) => (up ? GL[t].toUpperCase() : GL[t])).join('');
    return `${row(arrs[BLACK], 0, false)}/${row(arrs[BLACK], 8, false)}/8/8/8/8/${row(arrs[WHITE], 8, true)}/${row(arrs[WHITE], 0, true)} w - - 0 1`;
  }

  function guessBegin() {
    arrs = {};
    if (bots) {
      arrs[WHITE] = window.GuessBot.arrange(WHITE, bots[WHITE]);
      arrs[BLACK] = window.GuessBot.arrange(BLACK, bots[BLACK]);
      guessStart();
      return;
    }
    if (ai) { arrs[ai.color] = window.GuessBot.arrange(ai.color, ai.level); guessArrange(ai.human); return; }
    guessArrange(WHITE);
  }

  /** One player arranges their 16 pieces on their two ranks (tap two pieces to swap them). */
  function guessArrange(color) {
    phase = color === WHITE ? 'arr-w' : 'arr-b';
    arrColor = color;
    arrTypes = STD_ARR.slice();
    pickSel = -1;
    viewSide = color;
    const other = color === WHITE ? BLACK : WHITE;
    setFlipped(color === BLACK, false);
    renderArrange();
    setStatus('Tap two of your pieces to swap them');
    if (ai) { coverEl.classList.add('hidden'); return; }
    coverEl.innerHTML = `<h2>${esc(nameOf(color))}, arrange your pieces</h2>
      <p>${esc(nameOf(other))}, look away.</p>
      <button class="btn primary" id="cover-ok">I'm ready</button>`;
    coverEl.classList.remove('hidden');
    $('#cover-ok').onclick = () => coverEl.classList.add('hidden');
  }

  function renderArrange() {
    game.board.fill(0);
    arrTypes.forEach((t, i) => { game.board[sq(i % 8, arrColor === WHITE ? (i < 8 ? 0 : 1) : (i < 8 ? 7 : 6))] = arrColor | t; });
    renderAll();
  }

  const arrIndex = (s) => {
    const r = rankOf(s), f = fileOf(s);
    const rows = arrColor === WHITE ? [0, 1] : [7, 6];
    const k = rows.indexOf(r);
    return k < 0 ? -1 : k * 8 + f;
  };

  function arrTap(s) {
    if (coverUp()) return;
    const i = arrIndex(s);
    if (i < 0) return;
    if (pickSel < 0) { pickSel = s; renderBoard(); return; }
    const j = arrIndex(pickSel);
    pickSel = -1;
    if (j >= 0 && j !== i) { [arrTypes[i], arrTypes[j]] = [arrTypes[j], arrTypes[i]]; renderArrange(); } else renderBoard();
  }

  $('#arr-std').addEventListener('click', () => { if (!isArr() || coverUp()) return; arrTypes = STD_ARR.slice(); pickSel = -1; renderArrange(); });
  $('#arr-rnd').addEventListener('click', () => {
    if (!isArr() || coverUp()) return;
    for (let i = arrTypes.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arrTypes[i], arrTypes[j]] = [arrTypes[j], arrTypes[i]]; }
    pickSel = -1; renderArrange();
  });
  $('#arr-ok').addEventListener('click', () => {
    if (!isArr() || coverUp()) return;
    arrs[arrColor] = arrTypes.slice();
    pickSel = -1;
    if (ai || arrColor === BLACK) guessStart(); else guessArrange(BLACK);
  });

  /** Both sides are set: build the position and start. */
  function guessStart() {
    startFen = arrFen();
    game.loadFen(startFen);
    game.problems();
    game.castling = 0;
    if (bots) {   // two computers: each picks a piece at random
      game.secretQueen[WHITE] = window.GuessBot.select(game, WHITE);
      game.secretQueen[BLACK] = window.GuessBot.select(game, BLACK);
      initialSecrets = { [WHITE]: game.secretQueen[WHITE], [BLACK]: game.secretQueen[BLACK] };
      viewSide = 0;
      beginPlay();
      return;
    }
    pickHandoff(ai ? ai.human : WHITE);   // each player secretly selects one of their own pieces
  }

  /** The cover between turns in a two-player game: the board stays hidden until the next player says they are ready. */
  function guessHandoff(color) {
    if (phase !== 'play') return;
    viewSide = -1;
    selected = -1; legalTargets = [];
    const other = color === WHITE ? BLACK : WHITE;
    coverEl.innerHTML = `<h2>${esc(nameOf(color))}, take your turn</h2>
      <p>${esc(nameOf(other))}, look away.</p>${gwLast ? `<p class="cv-last">${esc(gwLast)}</p>` : ''}
      <button class="btn primary" id="cover-ok">I'm ready</button>`;
    coverEl.classList.remove('hidden');
    renderBoard();
    $('#cover-ok').onclick = () => {
      viewSide = color;
      setFlipped(color === BLACK, false);
      coverEl.classList.add('hidden');
      renderAll();
      if (gwLast) setStatus(gwLast);
    };
  }

  /** End of a Guess Who game: every hidden piece is turned over, one by one. Returns how long it takes (ms). */
  function guessReveal() {
    clearInterval(revealTimer);
    if (mode !== 'guess' || bots) { revealAll = true; return 0; }
    if (viewSide <= 0) viewSide = over && over.result === '0-1' ? BLACK : WHITE;
    const q = [];
    for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const p = game.board[s]; if (p && (p & 24) !== viewSide) q.push(s); }
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    const total = q.length * 380;
    revealTimer = setInterval(() => {
      const s = q.shift();
      if (s == null) { clearInterval(revealTimer); revealAll = true; renderBoard(); return; }
      revealSet.add(s);
      renderBoard();
      const pe = squareEls[s] && squareEls[s]._piece;
      if (pe) { pe.classList.add('reveal'); pe.addEventListener('animationend', () => pe.classList.remove('reveal'), { once: true }); }
      fx('move');
    }, 380);
    return total + 300;
  }

  /* ------------------------------------------------ secret queen selection */
  function pickHandoff(color) {
    phase = color === WHITE ? 'pick-w' : 'pick-b';
    const other = color === WHITE ? BLACK : WHITE;
    pickSel = -1;
    if (mode === 'guess') viewSide = color;   // only your own pieces show while you choose
    if (ai) {   // against the computer there is nobody to look away
      setFlipped(ai.human === BLACK, false);
      renderAll();
      $('#pick-confirm').disabled = true;
      coverEl.classList.add('hidden');
      setStatus(`${nameOf(color)}: tap one of your pieces`);
      return;
    }
    setFlipped(opts.autoFlip && color === BLACK, false);
    renderAll();
    $('#pick-confirm').disabled = true;
    setStatus('');
    coverEl.innerHTML = `<h2>${esc(nameOf(color))}, choose your ${mode === 'guess' ? 'selected piece' : 'Secret Queen'}</h2>
      <p>${esc(nameOf(other))}, look away.</p>
      <button class="btn primary" id="cover-ok">I'm ready</button>`;
    coverEl.classList.remove('hidden');
    $('#cover-ok').onclick = () => {
      coverEl.classList.add('hidden');
      setStatus(`${nameOf(color)}: tap one of your pieces`);
    };
  }

  $('#pick-confirm').addEventListener('click', () => {
    if (pickSel < 0) return;
    const color = phase === 'pick-w' ? WHITE : BLACK;
    game.secretQueen[color] = pickSel;
    pickSel = -1;
    if (ai) {
      game.secretQueen[ai.color] = mode === 'guess' ? window.GuessBot.select(game, ai.color) : pickSecretPawn(ai.color);
      initialSecrets = { [WHITE]: game.secretQueen[WHITE], [BLACK]: game.secretQueen[BLACK] };
      if (mode === 'guess') viewSide = ai.human;
      beginPlay();
      return;
    }
    if (color === WHITE) {
      pickHandoff(BLACK);
    } else {
      initialSecrets = { [WHITE]: game.secretQueen[WHITE], [BLACK]: game.secretQueen[BLACK] };
      beginPlay();
      if (mode === 'guess') guessHandoff(game.turn);
    }
  });

  /* ----------------------------------------------------------------- play */
  function beginPlay() {
    phase = 'play';
    coverEl.classList.add('hidden');
    setFlipped(ai ? ai.human === BLACK : opts.autoFlip && game.turn === BLACK, false);
    posKeys = [positionKey(game)];
    renderAll();
    renderMoves(sans, sans.length);
    updateStatus();
    maybeAI();
    refreshHint();
  }

  /* ------------------------------------------------ Chess Royale */
  /** The elixir meters (both sides) and the spawn tray for the side to move. */
  function renderRoyale() {
    const el = $('#royale');
    if (!el) return;
    const on = G.mode === 'royale' && (phase === 'play' || phase === 'over' || phase === 'replay' || phase === 'names');
    el.classList.toggle('hidden', !on);
    if (!on) return;
    for (const c of [WHITE, BLACK]) {
      const row = $(c === WHITE ? '#ry-w' : '#ry-b');
      const n = G.el[c];
      row.querySelector('.ry-nm').textContent = nameOf(c);
      row.querySelector('b').textContent = n;
      const bar = row.querySelector('.ry-bar');
      if (!bar.children.length) for (let i = 0; i < 10; i++) bar.appendChild(document.createElement('i'));
      [...bar.children].forEach((seg, i) => seg.classList.toggle('on', i < n));
      row.classList.toggle('turn', phase === 'play' && G.turn === c);
    }
    const live = phase === 'play' && G === game && humanTurn() && !bots;
    const can = spawnCan();
    const tray = $('#ry-tray');
    tray.classList.toggle('hidden', !live);
    const legal = can ? new Set(game.legalSpawns().map((m) => m.spawn)) : new Set();
    const col = G.turn === WHITE ? 'w' : 'b';
    if (!tray.children.length) {
      for (const t of SPAWN_TYPES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.t = t;
        b.setAttribute('aria-label', 'Spawn a ' + PNAME[t] + ' for ' + SPAWN_COST[t] + ' elixir');
        b.innerHTML = '<span class="rp"></span><em>' + SPAWN_COST[t] + '</em>';
        tray.appendChild(b);
      }
    }
    [...tray.children].forEach((b) => {
      const t = +b.dataset.t, rp = b.firstChild;
      rp.className = 'rp ' + col;
      rp.textContent = glyph(t);
      b.disabled = !legal.has(t);
      b.classList.toggle('sel', can && spawnSel === t);
    });
    let hint = '';
    if (live && phase === 'play') {
      const rank = G.turn === WHITE ? 'first two ranks' : 'last two ranks';
      if (spawnSel) hint = 'Tap a highlighted square on your ' + rank + ' to place the ' + PNAME[spawnSel] + '.';
      else if (G.inCheck(G.turn)) hint = 'In check: a spawn only works if it blocks the check.';
      else hint = 'Move a piece for +1 elixir, or spend elixir to spawn (no elixir gained).';
    }
    $('#ry-hint').textContent = hint;
  }

  const spawnCan = () => mode === 'royale' && phase === 'play' && G === game && !aiBusy && !pendingPromo && humanTurn() && !bots && viewPly === sans.length;

  $('#ry-tray').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !spawnCan()) return;
    const t = +b.dataset.t;
    if (spawnSel === t) { spawnSel = 0; legalTargets = []; renderAll(); return; }
    const list = game.legalSpawns().filter((m) => m.spawn === t);
    if (!list.length) return;
    spawnSel = t; selected = -1; hintMoves = []; legalTargets = list;
    renderAll();
  });

  function showRoyaleRules() {
    openSheet(`<h2>Chess Royale<span class="sub">Build your army as you go.</span></h2>
      <div class="sn-rules">
        <p>You start with <b>only your king</b>. Both sides begin with 0 elixir.</p>
        <p><b>Move a piece</b> as normal and you gain <b>1 elixir</b> (up to 10).</p>
        <p>Or <b>spawn a piece</b> on any empty square of your two starting ranks. That is your whole turn and you gain no elixir.</p>
        <p>Costs: pawn <b>1</b>, knight <b>3</b>, bishop <b>3</b>, rook <b>5</b>, queen <b>9</b>. Kings cannot be spawned.</p>
        <p>A spawn can block a check, but it can't be used if your king would still be in check. If you have no legal move and no spawn you can afford, it is checkmate or stalemate. There is no castling.</p>
      </div>
      <button class="btn wide primary" id="ryr-ok">Got it</button>`, true);
    $('#ryr-ok').onclick = closeSheet;
  }
  $('#ry-top').addEventListener('click', showRoyaleRules);

  const isHumanSide = (c) => !bots && (!ai || c === ai.human);
  const otherOf = (c) => (c === WHITE ? BLACK : WHITE);

  /* ------------------------------------------------ Guess Who Chess: questions, marks and guesses */
  const GCOL = { r: 'Red', b: 'Blue', g: 'Green', y: 'Yellow' };

  /** Marks follow the pieces they were put on: a piece that moved takes its mark along, a captured one loses it. */
  function moveMarks(m, mover) {
    for (const c of [WHITE, BLACK]) {
      const mk = marks[c];
      if (c === mover) {   // my own piece took something: its mark is gone
        delete mk[m.to];
        if (m.flags === 2) delete mk[m.to + (mover === WHITE ? -16 : 16)];
      } else {             // the enemy piece moved: its mark goes with it
        const v = mk[m.from];
        delete mk[m.from]; delete mk[m.to];
        if (v) mk[m.to] = v;
      }
    }
  }

  function markTap(s) {
    const c = viewSide, p = game.board[s];
    if (c <= 0 || !p || (p & 24) === c) return;
    if (markTool === 'x' || marks[c][s] === markTool) delete marks[c][s]; else marks[c][s] = markTool;
    saveSession();
    renderBoard();
  }

  /** The move is made. The mover now asks a question (or, if they dare, guesses). The computer decides on its own. */
  function guessAfterMove(mover, h) {
    const foe = otherOf(mover);
    if (h.enemySecret >= 0 && game.secretQueen[foe] < 0) { endGame('gcapture', mover); clearSession(); return; }
    if (isHumanSide(mover)) { guessPrompt(mover); return; }
    const g = pendingBotGuess; pendingBotGuess = -1;
    if (g >= 0 && game.board[g] && (game.board[g] & 24) === foe) {
      setStatus(nameOf(mover) + ' is making a guess...');
      setTimeout(() => { if (phase === 'play') resolveGuess(mover, g); }, 900);
      return;
    }
    const level = bots ? bots[mover] : ai.level;
    setTimeout(() => {
      if (phase !== 'play') return;
      doAsk(window.GuessBot.question(game, fullMoves, startFen, level, mover, initialSecrets[mover]), mover);
    }, 350);
  }

  /** On to the next turn: save, and hand the device over in a two-player game. */
  function guessNext() {
    saveSession();
    if (!game.hasLegalMove()) { endGame('stalemate', game.turn); clearSession(); return; }   // nothing left to move: a draw
    updateStatus();
    if (gwLast && (ai || bots)) setStatus(gwLast);
    maybeAI();
    if (!ai && !bots) setTimeout(() => guessHandoff(game.turn), 500);
    renderAll();
  }

  /** After your move: pick a question to ask, or (at the top) guess their piece. */
  function guessPrompt(mover) {
    gwStage = '';
    let html = '<h2>Ask a question<span class="sub">About their selected piece. You must ask one after every move.</span></h2><div class="gq-list">';
    html += '<button class="btn primary gq-guess" id="gq-guess">Guess their piece (win or lose)</button>';
    let grp = '';
    for (const q of GuessQ.LIST) {
      if (q.grp !== grp) { grp = q.grp; html += `<div class="gq-g">${esc(grp)}</div>`; }
      html += `<button class="btn gq" data-q="${q.id}">${esc(q.text)}</button>`;
    }
    html += '</div>';
    openSheet(html);
    sheet.querySelectorAll('.gq').forEach((b) => { b.onclick = () => { closeSheet(); doAsk(+b.dataset.q, mover); }; });
    $('#gq-guess').onclick = () => { closeSheet(); gwStage = 'guesspick'; selected = -1; legalTargets = []; setStatus('Tap the enemy piece you think is their selected piece.'); renderAll(); };
  }

  function guessTap(s) {
    const p = game.board[s], me = game.turn === WHITE ? BLACK : WHITE;   // (the mover has just moved, so the turn has passed)
    if (!p || (p & 24) === me) return;
    openSheet(`<h2>Guess this piece?<span class="sub">It is ${esc(alg(s))}. If it is not their selected piece, you lose immediately.</span></h2>
      <div class="row"><button class="btn" id="gg-n">Back</button><button class="btn primary" id="gg-y">Guess it</button></div>`);
    $('#gg-n').onclick = closeSheet;
    $('#gg-y').onclick = () => { closeSheet(); gwStage = ''; resolveGuess(me, s); };
  }

  $('#gw-skip').addEventListener('click', () => { if (gwStage !== 'guesspick') return; gwStage = ''; guessPrompt(otherOf(game.turn)); });

  /** `mover` guesses that the enemy piece on square s is the selected one. */
  function resolveGuess(mover, s) {
    const foe = otherOf(mover);
    gwStage = '';
    fullMoves[fullMoves.length - 1].gs = s;
    sans[sans.length - 1] += ' (guess ' + alg(s) + ')';
    renderMoves(sans, sans.length);
    endGame(s === game.secretQueen[foe] ? 'gright' : 'gwrong', mover);
    clearSession();
  }

  /** `mover` asks a question about the other side's selected piece, straight after their move. It is answered truthfully. */
  function doAsk(id, mover) {
    if (phase !== 'play') return;
    const foe = otherOf(mover);
    const q = GuessQ.BY_ID[id];
    const ans = GuessQ.answer(game, id, foe, game.secretQueen[foe], { askerSel: game.secretQueen[mover] });
    game.makeMove({ from: -1, to: -1, flags: 32, promo: 0, ask: id, ans: ans ? 1 : 0, by: mover });
    sans.push('Asked: ' + q.short + ' \u2192 ' + (ans ? 'Yes' : 'No'));
    fullMoves.push({ from: -1, to: -1, flags: 32, promo: 0, q: 0, ask: id, ans: ans ? 1 : 0, by: mover });
    viewPly = sans.length;
    { const nowT = Date.now(); if (!playStart) playStart = nowT; moveAt.push(nowT - playStart); moveClk.push(null); }
    ratings[fullMoves.length - 1] = null;
    posKeys.push(positionKey(game));
    gwLast = nameOf(mover) + ' asked: "' + q.text + '" \u2192 ' + (ans ? 'Yes' : 'No');
    fx('move');
    renderAll();
    renderMoves(sans, sans.length);
    if (isHumanSide(mover)) {
      openSheet(`<h2>${ans ? 'Yes' : 'No'}<span class="sub">${esc(q.text)}</span></h2><button class="btn wide primary" id="gq-ok">Continue</button>`);
      $('#gq-ok').onclick = () => { closeSheet(); guessNext(); };
    } else guessNext();
  }

  function showGuessRules() {
    openSheet(`<h2>Guess Who Chess<span class="sub">Find their piece before they find yours.</span></h2>
      <div class="sn-rules">
        <p>Arrange your pieces, then <b>secretly select one of your own pieces</b>. Enemy pieces show as plain boxes.</p>
        <p>You win by <b>capturing</b> their selected piece, or by <b>guessing</b> it right. You lose if yours is captured, they guess it, or you guess wrong.</p>
        <p>Each turn you <b>make a move</b>, then <b>ask a yes/no question</b> about their piece (answered truthfully). Instead of a question you may <b>guess</b> which enemy piece is theirs.</p>
        <p>There is no check or checkmate. Capturing a king does nothing special.</p>
        <p>Use the colour dots to mark enemy pieces for yourself. Only you see them: red = no, blue = maybe, green = likely, yellow = unsure.</p>
      </div>
      <button class="btn wide primary" id="gwr-ok">Got it</button>`, true);
    $('#gwr-ok').onclick = closeSheet;
  }
  $('#gw-rules').addEventListener('click', showGuessRules);
  document.querySelectorAll('#gw-marks .mk').forEach((b) => {
    b.addEventListener('click', () => { markTool = markTool === b.dataset.mk ? '' : b.dataset.mk; renderAll(); });
  });

  /** The Guess Who strip under the board: ask a question, colour marks, rules. */
  function renderGuessBar() {
    const bar = $('#gw-bar');
    const on = mode === 'guess' && G === game && phase === 'play' && viewSide > 0 && !coverUp() && !aiBusy && !bots && sheetBg.classList.contains('hidden');
    bar.classList.toggle('hidden', !on);
    if (!on) { if (markTool && phase !== 'play') markTool = ''; return; }
    const pick = gwStage === 'guesspick';
    $('#gw-ask').classList.add('hidden');
    $('#gw-marks').classList.toggle('hidden', pick);
    $('#gw-skip').classList.toggle('hidden', !pick);
    document.querySelectorAll('#gw-marks .mk').forEach((b) => b.classList.toggle('on', b.dataset.mk === markTool));
  }

  /* ----------------------------------------------------------- the computer */
  function thinkingStatus() {
    setStatus('', 'dim', 'Thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span>');
  }

  /**
   * Bullet and Rapid (and Classic when the "Bots use timed-mode speed" mod is on): how the computer is paced. Every computer answers
   * as fast as it can, in about 0.5 to 2 seconds in total (thinking counts towards that), a bit longer deep into the game when the
   * position needs it. With less than 10 seconds on its clock it answers as fast as it possibly can, whatever its level.
   * Returns { wait, think }: the total time to answer and the most it may spend searching, in ms.
   */
  function timedPace(level, left) {
    const late = game.fullmove >= 35 || pieceCount() <= 10;                    // lategame: allow a longer look when the position needs it
    if (left < 10000) return { wait: 0, think: Math.max(40, Math.min(150, left / 60)) };
    const wait = 500 + Math.random() * 1500;                                    // 0.5 - 2 s
    const think = Math.min(late ? 2800 : 1800, Math.max(300, left / 30));       // never more than a thirtieth of its clock
    return { wait, think };
  }
  function pieceCount() { let n = 0; for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } if (game.board[s]) n++; } return n; }
  const modTimed = () => !!(window.LP && window.LP.mods && window.LP.mods.unlocked() && window.LP.mods.cl.timed && !clock && (mode === 'basic' || mode === 'tas'));   // timed games already use fast bots: the switch changes nothing there

  function maybeAI() {
    botMove();
  }

  /** The computer plays its move now, if it is its turn. */
  function botMove() {
    const level = bots ? bots[game.turn] : (ai && !playBoth && game.turn === ai.color ? ai.level : null);
    if (!level || phase !== 'play' || paused) return;
    if (!branch() && viewPly < sans.length) return;
    const token = ++aiToken;
    aiBusy = true;
    hintMoves = [];
    selected = -1;
    legalTargets = [];
    renderBoard();
    updateControls();
    thinkingStatus();
    const t0 = Date.now();
    const pace = !bots && (clock || modTimed()) ? timedPace(level, clock ? clock[game.turn] : 1e9) : null;
    const minWait = pace ? pace.wait : bots ? 250 + Math.random() * 200 : 300 + Math.random() * 200;   // never quite instant, so you can follow the move
    const maxMs = pace ? pace.think : 0;   // under a clock the computer thinks for a small slice of the time it has left
    const seen = new Map();
    posKeys.slice(0, viewPly + 1).forEach((k) => seen.set(k, (seen.get(k) || 0) + 1));
    setTimeout(() => {
      if (token !== aiToken) return;
      const done = (m) => {
        if (token !== aiToken) return;
        setTimeout(() => {
          if (token !== aiToken) return;
          aiBusy = false;
          if (m && m.move) { pendingBotGuess = m.guess; doMove(m.move); }
          else if (m) doMove(m);
          else updateControls();
        }, Math.max(0, minWait - (Date.now() - t0)));
      };
      if (mode === 'guess' && window.GuessBot) window.GuessBot.choose(game, fullMoves, startFen, level, game.turn, done, initialSecrets[game.turn]);   // it only knows what it has seen
      else searchMove(game, level, game.turn, seen, done, maxMs);
    }, 20);
  }

  boardEl.addEventListener('click', (e) => {
    const el = e.target.closest('.square');
    if (el) onSquare(+el.dataset.sq);
  });


  /* ------------------------------------------------------------ Premoves (Classic, Bullet, Rapid and Online)
   * While it is the other side's turn you can queue moves. They are checked only when they are about to be played:
   * the first one plays the moment the opponent has moved, and the queue is cleared if one is no longer legal. */
  const PRE_MODES = ['basic', 'bullet', 'rapid', 'online'];
  const preMe = () => (online ? online.me : ai ? ai.human : 0);
  const preOn = () => !(window.LP.prefs && window.LP.prefs.get('premove') === false) && PRE_MODES.includes(mode) && !bots && !pz && G === game && !modTool();
  const preWaiting = () => preOn() && phase === 'play' && !over && !pendingPromo && !!preMe() && sheetBg.classList.contains('hidden') && !branch() && viewPly === sans.length
    && game.turn !== preMe() && (online ? true : !!ai && !playBoth);
  function clearPre() { pre = []; preSel = -1; preDest = new Set(); }
  /** The board as it will be once every queued premove has been played (pieces simply move, nothing is checked). */
  function preBoard() {
    const b = Array.from(game.board);
    for (const m of pre) {
      const p = b[m.from];
      if (!p) continue;
      if ((p & 7) === KING && Math.abs((m.to & 7) - (m.from & 7)) === 2) {   // castling moves the rook too
        const r = m.from & 0x70, up = (m.to & 7) > (m.from & 7);
        b[r + (up ? 5 : 3)] = b[r + (up ? 7 : 0)]; b[r + (up ? 7 : 0)] = 0;
      }
      b[m.to] = m.promo ? ((p & 24) | m.promo) : p;
      b[m.from] = 0;
    }
    return b;
  }
  /** Where a piece could go if the opponent's pieces move out of the way: sliders ignore blockers, own pieces still block the square itself. */
  function preTargets(b, from) {
    const p = b[from], me = p & 24, t = p & 7, f = from & 7, r = from >> 4, out = [];
    const free = (nf, nr) => nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7 && !(b[nr * 16 + nf] && (b[nr * 16 + nf] & 24) === me);
    const add = (nf, nr) => { if (free(nf, nr)) out.push(nr * 16 + nf); };
    const ray = (df, dr) => { for (let k = 1; k < 8; k++) { const nf = f + df * k, nr = r + dr * k; if (nf < 0 || nf > 7 || nr < 0 || nr > 7) break; add(nf, nr); } };
    if (t === KNIGHT) [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach((d) => add(f + d[0], r + d[1]));
    if (t === BISHOP || t === QUEEN) [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((d) => ray(d[0], d[1]));
    if (t === ROOK || t === QUEEN) [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => ray(d[0], d[1]));
    if (t === KING) {
      for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) if (df || dr) add(f + df, r + dr);
      const home = me === WHITE ? 0 : 7, bit = me === WHITE ? 1 : 4;
      if (f === 4 && r === home) {   // castling, if the rights are still there and the rook is
        if ((game.castling & bit) && (b[home * 16 + 7] & 7) === ROOK) add(6, home);
        if ((game.castling & (bit << 1)) && (b[home * 16] & 7) === ROOK) add(2, home);
      }
    }
    if (t === PAWN) {
      const dir = me === WHITE ? 1 : -1, start = me === WHITE ? 1 : 6, epRank = me === WHITE ? 4 : 3;
      add(f, r + dir);
      if (r === start) add(f, r + 2 * dir);
      [-1, 1].forEach((df) => { const nf = f + df, nr = r + dir; if (free(nf, nr) && ((b[nr * 16 + nf] & 24) || r === epRank)) out.push(nr * 16 + nf); });
    }
    return out;
  }
  function preTap(s) {
    const b = preBoard(), me = preMe(), p = b[s], own = !!p && (p & 24) === me;
    if (preSel >= 0 && preDest.has(s)) {
      const from = preSel, last = (b[from] & 7) === PAWN && (s >> 4) === (me === WHITE ? 7 : 0);
      const add = (promo) => { pre.push({ from, to: s, promo: promo || 0 }); preSel = -1; preDest = new Set(); renderBoard(); preRunSoon(); };
      if (last) showPromotion({ from, to: s }, (m) => add(m.promo), me); else add(0);   // the promotion piece is asked for straight away
      return;
    }
    if (own && s !== preSel) { preSel = s; preDest = new Set(preTargets(b, s)); renderBoard(); return; }
    if (s === preSel) { preSel = -1; preDest = new Set(); renderBoard(); return; }
    clearPre(); renderBoard();   // a tap anywhere else cancels every premove
  }
  /** Play the first queued premove if it is our turn now. */
  function preRun() {
    if (!pre.length || phase !== 'play' || over || pendingPromo || aiBusy) return;
    if (game.turn !== preMe()) return;
    const q = pre.shift();
    const m = game.legalMoves().find((x) => x.from === q.from && x.to === q.to && (x.promo || 0) === (q.promo || 0));
    if (!m) { clearPre(); renderBoard(); showToast('Premove cancelled', false); return; }
    preSel = -1; preDest = new Set();
    doMove(m);
  }
  function preRunSoon() { if (pre.length) setTimeout(preRun, 30); }
  /** Red arrows for the queued premoves. */
  function drawPre() {
    const wrap = boardEl.parentElement;
    let svg = wrap.querySelector('.pre-arrows');
    if (!pre.length || G !== game) { if (svg) svg.remove(); return; }
    const NS = 'http://www.w3.org/2000/svg';
    if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'pre-arrows'); wrap.appendChild(svg); }
    const w = wrap.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + w.width + ' ' + w.height);
    const c = (s) => { const r = squareEls[s].getBoundingClientRect(); return [r.left - w.left + r.width / 2, r.top - w.top + r.height / 2, r.width]; };
    svg.innerHTML = '<defs><marker id="pre-ah" markerWidth="3.2" markerHeight="3.2" refX="1.6" refY="1.6" orient="auto"><path d="M0,0 L3.2,1.6 L0,3.2 z" fill="rgba(229,72,77,.9)"/></marker></defs>' + pre.map((m) => {
      const a = c(m.from), z = c(m.to), dx = z[0] - a[0], dy = z[1] - a[1], len = Math.hypot(dx, dy) || 1, k = z[2] * 0.32 / len;
      return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + (z[0] - dx * k) + '" y2="' + (z[1] - dy * k) + '" stroke="rgba(229,72,77,.8)" stroke-width="' + (z[2] * 0.17) + '" stroke-linecap="round" marker-end="url(#pre-ah)"/>';
    }).join('');
  }
  window.addEventListener('resize', () => { if (pre.length) drawPre(); });
  boardEl.addEventListener('contextmenu', (e) => { if (pre.length || preSel >= 0) { e.preventDefault(); clearPre(); renderBoard(); } });

  function onSquare(s) {
    if (isArr()) { arrTap(s); return; }
    if (paused && clock && !bots) { showToast('The game is paused.', false); return; }
    if (preWaiting()) { preTap(s); return; }
    if (online && phase === 'play' && game.turn !== online.me) { showToast('Wait for your opponent.', false); return; }
    if (modTool() && !pendingPromo && sheetBg.classList.contains('hidden')) { modToolTap(s); return; }   // a mod tool is on: normal moves are off
    if (mode === 'guess' && phase === 'play') {
      if (coverUp() || !sheetBg.classList.contains('hidden')) return;
      if (gwStage === 'guesspick') { guessTap(s); return; }
      if (markTool && !aiBusy) { markTap(s); return; }
    }
    if (phase === 'pick-w' || phase === 'pick-b') {
      if (!coverEl.classList.contains('hidden')) return;
      const color = phase === 'pick-w' ? WHITE : BLACK;
      const pc = game.board[s];
      if (pc && (pc & 24) === color && (mode === 'guess' || ((pc & 7) !== KING && (pc & 7) !== QUEEN))) {
        pickSel = pickSel === s ? -1 : s;
        $('#pick-confirm').disabled = pickSel < 0;
        setStatus(pickSel < 0 ? `${nameOf(color)}: tap one of your pieces` : 'Tap Confirm to lock it in');
        renderBoard();
      }
      return;
    }
    if (bots && phase === 'play') return;   // nobody to move for: the computers are playing
    if (phase === 'play' && !branch() && viewPly < sans.length) {
      showToast('You are viewing an earlier move. Press Forward to get back to the current position before playing.');
      return;
    }
    if (phase !== 'play' || pendingPromo || aiBusy) return;
    if (ai && !humanTurn()) {
      if (isTas()) showToast("It's the computer's move here. Press Redo, or switch on Both sides to play it yourself.", false);
      return;
    }

    const p = game.board[s];
    const own = p && (p & 24) === game.turn;

    if (spawnSel) {   // Chess Royale: a piece was picked in the tray, so a tap on a highlighted square places it
      const sm = legalTargets.find((m) => m.to === s);
      if (sm) { doMove(sm); return; }
      spawnSel = 0; legalTargets = [];
      if (own) { select(s); return; }
      renderAll();
      return;
    }

    if (selected >= 0) {
      const move = legalTargets.find((m) => m.to === s);
      if (move) {
        if (move.promo) { showPromotion(move); return; }
        doMove(move);
        return;
      }
      if (own && s !== selected) { select(s); return; }
      selected = -1;
      legalTargets = [];
      renderBoard();
      return;
    }
    if (own) select(s);
  }

  /* ------------------------------------------------ Classic mods (hidden mod menu, see mods.js) */
  const MOD_MODES = ['basic', 'tas', 'bullet', 'rapid'];   // the Classic mods also work in Sandbox and the timed games
  const modLive = () => !!(window.LP && window.LP.mods && window.LP.mods.unlocked() && MOD_MODES.includes(mode) && G === game && !bots && !pz && !online && phase === 'play');
  const modTool = () => (modLive() ? window.LP.mods.cl.tool : '');
  function modToolStatus() {
    const t = modTool();
    if (t === 'move') setStatus('Move pieces: tap a piece, then any square', 'dim');
    else if (t === 'paint') setStatus('Paint tile: tap a square to place the chosen piece', 'dim');
    else if (phase === 'play') updateStatus();
  }
  let lastModTool = '';
  function modSync() {
    const t = modTool();
    if (t === lastModTool) return;
    lastModTool = t;
    selected = -1; legalTargets = []; hintMoves = [];
    if (phase === 'play') { renderBoard(); modToolStatus(); }
  }

  /** Tap with a mod tool on. Move pieces: tap a piece, then any square. Paint tile: put the chosen colour + piece type on the square (Empty clears it). */
  function modToolTap(s) {
    const M = window.LP.mods.cl, p = game.board[s];
    const refuse = (t) => showToast(t, false);
    const lastRank = (q) => (q >> 4) === 0 || (q >> 4) === 7;
    if (M.tool === 'move') {
      if (selected < 0) { if (p) { selected = s; renderBoard(); setStatus('Now tap the square to move it to (tap it again to put it down)', 'dim'); } return; }
      if (s === selected) { selected = -1; renderBoard(); modToolStatus(); return; }
      const from = selected, mp = game.board[from];
      if (p && (p & 7) === KING) { refuse('A king cannot be taken off the board.'); return; }
      if ((mp & 7) === PAWN && lastRank(s)) { refuse('A pawn cannot stand on the first or last rank.'); return; }
      modEdit('Move pieces', (b) => { b[s] = mp; b[from] = 0; });
      return;
    }
    if (M.tool === 'paint') {
      const col = M.color === 'b' ? BLACK : WHITE, t = M.piece | 0;
      if (t === 0) {
        if (!p) return;
        if ((p & 7) === KING) { refuse('A king cannot be removed. Paint a king on another square to move it.'); return; }
        modEdit('Paint tile', (b) => { b[s] = 0; });
        return;
      }
      if (p === (col | t)) return;
      if (p && (p & 7) === KING) { refuse('A king cannot be replaced.'); return; }
      if (t === PAWN && lastRank(s)) { refuse('A pawn cannot stand on the first or last rank.'); return; }
      modEdit('Paint tile', (b) => {
        if (t === KING) { const old = game.kingSquare(col); if (old >= 0 && old !== s) b[old] = 0; }   // each side has one king: painting one moves it
        b[s] = col | t;
      });
    }
  }

  /** Change the board for a mod, without touching the game. The change is kept as "pending" and written into the next move (see modAttach),
   *  so Back, replays and History show the piece appearing out of nowhere on that move. */
  function modEdit(name, change) {
    if (viewPly !== sans.length) { showToast('Go to the latest move first.', false); return; }
    const snap = { board: Uint8Array.from(game.board), turn: game.turn, castling: game.castling, ep: game.ep };
    const undo = () => { game.board.set(snap.board); game.turn = snap.turn; game.castling = snap.castling; game.ep = snap.ep; };
    change(game.board);
    game.ep = -1;
    const bad = game.problems();
    if (bad.length) { undo(); showToast(bad[0], false); return; }
    if (game.inCheck(WHITE) && game.inCheck(BLACK)) { undo(); showToast('Both kings would be in check.', false); return; }
    if (!pend) pend = { map: new Map(), castling: snap.castling };
    for (let q = 0; q < 128; q++) {
      if (q & 0x88) { q += 7; continue; }
      if (snap.board[q] === game.board[q]) continue;
      const e = pend.map.get(q);
      if (e) { e.nw = game.board[q]; if (e.nw === e.old) pend.map.delete(q); } else pend.map.set(q, { old: snap.board[q], nw: game.board[q] });
    }
    classicMods.add(name);
    modAfterEdit();
  }

  /** Put the pending edits into the move that is about to be played: take them off the board, and let the engine put them back as part of the move. */
  function modAttach(m) {
    const ed = [];
    pend.map.forEach((v, q) => { ed.push([q, v.nw]); game.board[q] = v.old; });
    const ec = game.castling;
    game.castling = pend.castling;
    return Object.assign({}, m, { ed, ec });
  }
  /** Throw away edits that are not in a move yet (Back / Undo went past them). */
  function modDiscard() {
    if (!pend) return;
    pend.map.forEach((v, q) => { game.board[q] = v.old; });
    game.castling = pend.castling;
    game.ep = -1;
    pend = null;
  }

  function modAfterEdit() {
    aiToken++; aiBusy = false; hintToken++;
    hintMoves = []; hintAvail = false; hintCache = null;
    selected = -1; legalTargets = [];
    $('#mode-title').textContent = MODE_LABEL[mode] + ' · Modded';
    renderAll();
    const check = game.inCheck(game.turn);
    const end = !game.hasLegalMove() ? (check ? 'mate' : 'stalemate') : insufficientMaterial() ? 'material' : null;
    if (end) { endGame(end, game.turn === WHITE ? BLACK : WHITE); clearSession(); return; }
    modToolStatus();
    if (!modTool()) updateStatus();
    maybeAI();
    refreshHint();
  }

  /** Both sides: you play the computer's turns too. Used by the Sandbox button and the mod menu. */
  function setPlayBoth(on) {
    if (!ai || bots || (phase !== 'play' && phase !== 'over')) return false;
    if (playBoth === on) return true;
    playBoth = on;
    if (on && !isTas()) classicMods.add('Both sides');
    saveSession();
    if (playBoth) { aiToken++; aiBusy = false; }
    hintMoves = [];
    if (phase === 'play') updateStatus(); else overStatus();
    renderBoard();
    updateControls();
    if (!playBoth) maybeAI();
    refreshHint();
    showToast(playBoth ? 'Both sides are yours now. The computer will not move.' : 'The computer plays its own turns again.', false);
    return true;
  }

  (function registerMods(tries) {
    const M = window.LP && window.LP.mods;
    if (!M) { if (tries < 60) setTimeout(() => registerMods(tries + 1), 100); return; }
    M.hook('classic', {
      state: () => ({ live: modLive(), canHint: modLive() && !aiBusy && humanTurn() && !(paused && clock), canBoth: modLive() && !!ai, both: playBoth, mode }),
      hint: () => { if (modLive()) runHint(true); },
      setBoth: (on) => { if (modLive()) setPlayBoth(!!on); },
    });
    M.on(modSync);
  })(0);

  function select(s) {
    if (hintMoves.length && !hintMoves.some((m) => m.from === s)) hintMoves = [];   // tapping the hinted piece keeps the hint visible
    selected = s;
    spawnSel = 0;
    legalTargets = game.legalMovesFrom(s);
    renderAll();
  }

  function insufficientMaterial() {
    const left = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = game.board[s];
      if (p && (p & 7) !== KING) left.push(p & 7);
    }
    return left.length === 0 || (left.length === 1 && (left[0] === KNIGHT || left[0] === BISHOP));
  }

  function doMove(m) {
    if (branch() && viewPly < sans.length) {
      // TAS: playing from an earlier point throws away the old future (redo is off until you undo again)
      sans.length = viewPly;
      fullMoves.length = viewPly;
      moveAt.length = Math.min(moveAt.length, viewPly); moveClk.length = Math.min(moveClk.length, viewPly);
      ratings.length = viewPly;
      posKeys.length = viewPly + 1;
      over = null;
      phase = 'play';
      closeSheet();
    }
    hintMoves = [];
    spawnSel = 0;
    showQueen = false;   // the queen is hidden again once the turn is done
    const bookMove = !isTas() && !isTwist() && !!(window.MoveRating && window.MoveRating.isBook && window.MoveRating.isBook(game, m));   // only book moves are labelled while you play; everything else comes from Analyze game
    const san = game.moveToSan(m);
    const mover = game.turn;
    if (pend && pend.map.size) m = modAttach(m);   // mod edits made since the last move go into this move, so a replay shows them appearing now
    pend = null;
    const capBefore = mode === 'guess' ? (game.board[m.to] || m.flags === 2) : 0;
    if (!bots && window.LP.rewards && (game.board[m.to] || m.flags === 2)) window.LP.rewards.event('capture', 1);
    if (mode === 'gamble') m.nx = Math.random() * 100 < game.oddsAfter(mover) ? WHITE : BLACK;   // roll who moves next
    game.makeMove(m);
    if (mode === 'gamble' && !game.kingTaken && !game.hasLegalMove()) {   // the rolled side is stuck: the turn goes to the other side
      game.turn = game.turn === WHITE ? BLACK : WHITE;
      game.ep = -1;
      m.nx = game.turn;
    }
    const check = game.inCheck(game.turn);
    const gcheck = check && mode !== 'guess';   // Guess Who does not announce check
    const canMove = game.hasLegalMove();
    let full = san + (check ? (canMove ? '+' : '#') : '');
    if (mode === 'guess') full = alg(m.from) + (capBefore ? 'x' : '-') + alg(m.to) + (m.promo ? '=?' : '');   // squares only: nothing says what the pieces are
    sans.push(full);
    fullMoves.push({ from: m.from, to: m.to, flags: m.flags, promo: m.promo || 0, q: m.q || 0 });
    if (m.spawn) fullMoves[fullMoves.length - 1].spawn = m.spawn;
    if (m.ed) { fullMoves[fullMoves.length - 1].ed = m.ed; fullMoves[fullMoves.length - 1].ec = m.ec; }
    if (online && !remoteApplying && window.LP.onlineNet) window.LP.onlineNet.sendMove(alg(m.from) + alg(m.to) + (({ 5: 'q', 4: 'r', 3: 'b', 2: 'n' })[m.promo] || ''), clock ? { w: clock[WHITE], b: clock[BLACK] } : null);
    if (mode === 'gamble') { const fm = fullMoves[fullMoves.length - 1]; fm.nx = m.nx; fm.mc = mover; }
    viewPly = sans.length;
    ratings[fullMoves.length - 1] = bookMove ? 'book' : null;
    if (clock && !bots) clock[mover] += clock.inc;
    { const nowT = Date.now(); if (!playStart) playStart = nowT; moveAt.push(nowT - playStart); moveClk.push(clock ? [Math.round(clock[WHITE]), Math.round(clock[BLACK])] : null); }
    lastTick = 0;
    posKeys.push(positionKey(game));
    selected = -1;
    legalTargets = [];
    preSel = -1; preDest = new Set();

    renderAll();
    animateMove(m, false);
    const h = game.history[game.history.length - 1];
    if (h.wasSecretMove) popReveal(m.to);
    renderMoves(sans, sans.length);
    fx(!canMove && check ? 'win' : gcheck ? 'check' : h.captured || h.epCaptured || (h.sn && h.sn.eaten.length) ? 'capture' : m.flags === 4 || m.flags === 8 ? 'castle' : 'move');
    if (h.sn) animateSnails(h, false);

    if (mode === 'guess') { moveMarks(m, mover); gwLast = ''; guessAfterMove(mover, h); return; }
    let end = null;
    if (game.snailKilled) end = 'snail';
    else if (game.kingTaken) end = 'king';
    else if (!canMove) end = check ? 'mate' : 'stalemate';
    else if (!isTwist() && insufficientMaterial()) end = 'material';
    else if (game.halfmove >= 100) end = 'fifty';
    else if (posKeys.filter((k) => k === posKeys[viewPly]).length >= 3) end = 'repeat';

    if (end) { endGame(end, mover); clearSession(); }
    else if (pzSpent(mover)) { saveSession(); }
    else { saveSession(); updateStatus(); syncFlip(true, 380); maybeAI(); refreshHint(); preRunSoon(); }
  }

  /** Popular puzzle: you have played your last move for the mate and it was not mate, so stop and offer undo / retry. */
  function pzSpent(mover) {
    if (!pz || !pz.n || !ai || mover !== ai.human) return false;
    const mine = fullMoves.filter((_, i) => (i % 2 === 0) === (ai.human === WHITE)).length;
    if (mine < pz.n) return false;
    aiToken++; aiBusy = false;
    setStatus('Out of moves');
    openSheet(`<h2>Not solved<span class="sub">The mate has to come within ${pz.n} move${pz.n === 1 ? '' : 's'}.</span></h2>
      <div class="row"><button class="btn" id="pz-c">Close</button><button class="btn primary" id="pz-r">Try again</button></div>`, true);
    $('#pz-c').onclick = closeSheet;
    $('#pz-r').onclick = () => { closeSheet(); session.clear(); startGame(mode, true); };
    return true;
  }

  function showPromotion(move, cb, color) {
    pendingPromo = true;
    const col = color || game.turn;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const box = document.createElement('div');
    box.className = 'promo';
    [QUEEN, ROOK, BISHOP, KNIGHT].forEach((t) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="piece ${col === WHITE ? 'w' : 'b'}">${glyph(col | t)}</span>`;
      b.onclick = (e) => {
        e.stopPropagation();
        move.promo = t;
        ov.remove();
        pendingPromo = false;
        if (cb) cb(move); else doMove(move);
      };
      box.appendChild(b);
    });
    ov.appendChild(box);
    ov.onclick = () => { ov.remove(); pendingPromo = false; };
    boardEl.parentElement.appendChild(ov);
  }

  /* --------------------------------------------------------------- end game */
  function endGame(type, mover) {
    phase = 'over';
    clearPre();
    spawnSel = 0; gwStage = ''; markTool = '';
    coverEl.classList.add('hidden');
    clearTimeout(flipTimer);
    const why = { gcapture: 'Selected piece captured', gright: 'Guessed the selected piece', gwrong: 'Guessed the wrong piece', agreed: 'Draw agreed', stalemate: 'Stalemate', material: 'Insufficient material', fifty: '50-move rule', repeat: 'Threefold repetition', snail: 'Both snails reached a king' };
    let winner = type === 'mate' || type === 'resign' || type === 'time' || type === 'abandon' ? mover : null;   // mover = the side that won (or that gave the mate)
    if (type === 'king') winner = game.kingTaken === WHITE ? BLACK : WHITE;
    if (type === 'gcapture' || type === 'gright') winner = mover;
    if (type === 'gwrong') winner = mover === WHITE ? BLACK : WHITE;
    if (type === 'snail') winner = game.snailKilled === 24 ? null : game.snailKilled === WHITE ? BLACK : WHITE;   // the side whose snail reached its king loses
    const loser = winner === WHITE ? BLACK : WHITE;
    if (type === 'resign') resigned = loser;
    over = winner != null
      ? { title: nameOf(winner) + ' wins', sub: type === 'mate' ? 'Checkmate' : type === 'gcapture' ? nameOf(loser) + "'s selected piece was captured" : type === 'gright' ? nameOf(winner) + ' guessed the selected piece' : type === 'gwrong' ? nameOf(loser) + ' guessed the wrong piece' : type === 'snail' ? nameOf(loser) + "'s snail reached their king" : type === 'king' ? nameOf(loser) + "'s king was captured" : type === 'resign' ? nameOf(loser) + ' forfeited' : type === 'abandon' ? nameOf(loser) + ' disconnected' : nameOf(loser) + ' ran out of time', result: winner === WHITE ? '1-0' : '0-1' }
      : { title: 'Draw', sub: why[type], result: '1/2-1/2' };
    if (pz) {
      const won = winner != null && !!ai && winner === ai.human;
      over = { title: won ? 'Puzzle solved!' : 'Not solved', sub: won ? pz.name : type === 'mate' ? 'You were checkmated' : type === 'resign' ? 'You gave up' : winner != null ? 'The computer won' : (why[type] || 'Drawn') + ', the puzzle needs a win', result: over.result };
      if (won && window.LP.popular) window.LP.popular.done(pz.id);
    }
    const unranked = !!startFen || classicMods.size > 0;   // custom positions and games that used a mod do not count for ratings, rewards or the leaderboard
    const lb = type === 'mate' && !unranked && !online ? recordWin(mover) : null;
    if (online && !remoteEnding && window.LP.onlineNet) window.LP.onlineNet.report(over.result, type);
    const Pf = window.LP.profile;
    if (Pf && ai && !bots && !playBoth && !unranked && Pf.MODES[mode]) over.elo = Pf.record(mode, ai.level, winner != null ? (winner === ai.human ? 1 : 0) : 0.5);
    if (lb && lb.rank) over.note = lb.isBest ? 'New best: checkmate in ' + lb.entry.value + ' moves!' : '#' + lb.rank + ' on the leaderboard';
    if (!bots && !isTas() && !unranked && !online && window.LP.rewards) {
      const q = {};
      ratings.forEach((r, i) => { if (r && (!ai || (i % 2 === 0) === (ai.human === WHITE))) q[r] = (q[r] || 0) + 1; });
      window.LP.rewards.event('game', {
        mode, won: winner != null && (!ai || winner === ai.human), draw: winner == null, level: ai ? ai.level : 'pvp',
        moves: Math.ceil(fullMoves.length / 2), secs: Math.min(10800, Math.round((Date.now() - (gameStart || Date.now())) / 1000)), elo: over.elo || null, q,
      });
    }
    updateControls();
    overStatus();
    fx(winner == null ? 'draw' : ai && !bots && winner !== ai.human ? 'lose' : 'win');
    if (window.LP.history && fullMoves.length) { try { const d = buildReplayData(); window.LP.history.add({ kind: 'chess', id: d.id, mode: d.mode2 || mode, modeLabel: pz ? 'Puzzle · ' + pz.name : startFen && mode !== 'guess' ? 'Custom position' : MODE_LABEL[mode], names: d.names, level: d.level, bots: !!bots, human: d.human, result: d.result, winner: d.winner, dur: Math.round((Date.now() - (playStart || Date.now())) / 1000) || 0, moves: Math.ceil(fullMoves.length / 2), timed: !!clock, modded: classicMods.size ? Array.from(classicMods) : undefined, payload: d }); } catch (e) { /* history is best effort */ } }
    const revealMs = mode === 'guess' ? guessReveal() : 0;
    setTimeout(() => {
      if (phase !== 'over' || !sheetBg.classList.contains('hidden')) return;
      if (lb && lb.isBest && window.LP.board) window.LP.board.askName(lb.entry, () => { if (phase === 'over') showOverSheet(); }, 'Your fastest win so far. Choose the name for the leaderboard.');
      else showOverSheet();
    }, (type === 'resign' ? 200 : 800) + revealMs);
  }

  $('#draw-btn').addEventListener('click', () => { if (online && phase === 'play' && window.LP.onlineNet) window.LP.onlineNet.offerDraw(); });

  /** Give up the game: the other side wins. */
  function resign(color) {
    if (phase !== 'play' || bots || isTas()) return;
    aiToken++; aiBusy = false;
    endGame('resign', color === WHITE ? BLACK : WHITE);
    clearSession();
  }

  $('#forfeit-btn').addEventListener('click', () => {
    if (phase !== 'play' || bots || isTas()) return;
    if (online) { confirmSheet('Forfeit this game?', 'Forfeit', () => resign(online.me)); return; }
    if (ai) { confirmSheet('Forfeit this game?', 'Forfeit', () => resign(ai.human)); return; }
    openSheet(`<h2>Who forfeits?<span class="sub">The other player wins.</span></h2>
      <div class="stack"><button class="btn big" id="ff-w">${esc(nameOf(WHITE))} (White)</button><button class="btn big" id="ff-b">${esc(nameOf(BLACK))} (Black)</button><button class="btn" id="ff-x">Cancel</button></div>`, true);
    $('#ff-w').onclick = () => { closeSheet(); resign(WHITE); };
    $('#ff-b').onclick = () => { closeSheet(); resign(BLACK); };
    $('#ff-x').onclick = closeSheet;
  });

  /** Classic and Secret Queen wins, against the computer or a friend, ranked by how few moves they took. */
  function recordWin(mover) {
    if (!window.LP.board || isTas() || bots || playBoth || (ai && mover !== ai.human)) return null;
    const lvl = ai ? ai.level : 'pvp';
    return window.LP.board.record({
      cat: 'chess', key: 'chess:' + mode + ':' + lvl,
      group: MODE_LABEL[mode] + ' · ' + (ai ? LEVEL_LABEL[ai.level] : '2 players'),
      name: names[mover], vs: ai ? 'Computer (' + LEVEL_LABEL[ai.level] + ')' : names[mover === WHITE ? BLACK : WHITE],
      value: Math.ceil(fullMoves.length / 2), unit: 'moves', low: true,
    });
  }

  function overStatus() {
    const quick = !window.LP.prefs || window.LP.prefs.get('quick');
    setStatus('', '', `${esc(over.title)} · ${esc(over.sub)} <button id="st-opts">Options</button>${quick ? ' <button id="st-again">' + (pz ? 'Retry' : 'Rematch') + '</button>' : ''}`);
    $('#st-opts').onclick = () => showOverSheet();
    if (quick) $('#st-again').onclick = () => { if (online) window.LP.onlineNet.rematch(); else startGame(mode, true); };
  }

  function showOverSheet() {
    const tas = isTas(), noAn = tas || isTwist();
    openSheet(`<h2>${esc(over.title)}<span class="sub">${esc(over.sub)}</span></h2>
      <div class="stack">
        ${noAn ? '' : '<button class="btn primary" id="ov-analyze">Analyze game</button>'}
        ${exportable() ? '<button class="btn" id="ov-export">Export match</button>' : ''}
        <div class="row"><button class="btn" id="ov-new">${pz ? 'Try again' : 'Rematch'}</button><button class="btn" id="ov-close">Close</button></div>
        ${pz ? '<button class="btn" id="ov-list">Puzzle list</button>' : ''}
      </div>
      ${over.elo ? `<p class="elo-line ${over.elo.delta >= 0 ? 'up' : 'down'}"><span>${MODE_LABEL[mode]} rating</span><b>${over.elo.after}</b><em>${over.elo.delta >= 0 ? '+' : '\u2212'}${Math.abs(over.elo.delta)}</em></p>` : ''}
      <p class="note">${over.note ? esc(over.note) + '<br>' : ''}${tas ? 'Sandbox games are not saved or analysed.' : isTwist() ? MODE_LABEL[mode] + ' games are saved in History, but Analyze does not support them.' : 'Analyzing saves the game. You can open it again any time from Analyze in the Train section.'}</p>`);
    const an = $('#ov-analyze');
    if (an) an.onclick = () => {
      const data = buildReplayData();
      const list = store.get();
      list.unshift(data);
      store.set(list.slice(0, 40));
      closeSheet();
      if (window.LP.analyze) window.LP.analyze.begin(data.id);
    };
    const ex = $('#ov-export');
    if (ex) ex.onclick = () => window.LP.exporter.matchSheet(buildReplayData(), showOverSheet);
    $('#ov-new').onclick = () => { closeSheet(); if (online) window.LP.onlineNet.rematch(); else startGame(mode, true); };
    $('#ov-close').onclick = closeSheet;
    const pl = $('#ov-list');
    if (pl) pl.onclick = () => { closeSheet(); backToMenu(); if (window.LP.popular) window.LP.popular.open(); };
  }
  /** Export match is for Classic and the timed games (not Secret Queen or TAS). */
  function exportable() { return !!(window.LP.exporter && over && sans.length && window.LP.exporter.canExport(buildReplayData())); }

  function buildReplayData() {
    return {
      v: 1,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: Date.now(),
      mode: engineMode(mode),
      tas: isTas(),
      level: ai ? ai.level : null,
      names: { w: names[WHITE], b: names[BLACK] },
      secrets: { w: initialSecrets[WHITE], b: initialSecrets[BLACK] },
      moves: fullMoves.map((m) => Object.assign({}, m)),
      ratings: ratingsOn() ? ratings.slice() : null,
      sans: sans.slice(),
      result: over ? over.title + ' · ' + over.sub : '',
      mode2: mode,
      human: ai ? (ai.human === WHITE ? 'w' : 'b') : null,
      resigned: resigned == null ? null : (resigned === WHITE ? 'w' : 'b'),
      winner: over && over.result === '1-0' ? 'w' : over && over.result === '0-1' ? 'b' : null,
      clock: clock ? { base: clock.base, inc: clock.inc } : null,
      fen: startFen || null,
      gfirst: gFirst || null,
      at: clock ? moveAt.slice() : null, clk: clock ? moveClk.slice() : null,
      endAt: clock && playStart ? Date.now() - playStart : null,
    };
  }

  /* --------------------------------------------------------------- controls */
  $('#queen-btn').addEventListener('click', () => {
    if (!canShowQueen()) return;
    showQueen = !showQueen;
    renderAll();
  });

  $('#flip-btn').addEventListener('click', () => {
    flipped = !flipped;
    buildBoard();
    renderAll();
  });

  /* Two-player and computer games: undo / redo only move the view, nobody can play until it is back at
     the latest move. TAS: undo / redo are real, and playing from an earlier point drops the old future. */
  function navigate(dir) {
    if (mode === 'guess' || (online && phase === 'play')) return;
    if ((phase !== 'play' && phase !== 'over') || aiBusy) return;
    const target = viewPly + dir;
    if (target < 0 || target > fullMoves.length || target === viewPly) return;
    modDiscard();
    let m = null, undone = null;
    while (viewPly > target) { m = fullMoves[viewPly - 1]; undone = game.history[game.history.length - 1]; game.unmakeMove(); viewPly--; }
    while (viewPly < target) { m = fullMoves[viewPly]; game.makeMove(m); viewPly++; }
    closeSheet();
    hintMoves = [];
    showQueen = false;
    selected = -1;
    legalTargets = [];
    const atLive = viewPly === fullMoves.length;
    phase = atLive && over ? 'over' : 'play';
    renderAll();
    animateMove(m, dir < 0);
    if (dir < 0) animateSnails(undone, true);
    const h = game.history[game.history.length - 1];
    if (dir > 0 && h && h.wasSecretMove) popReveal(m.to);
    if (dir > 0) animateSnails(h, false);
    renderMoves(sans, viewPly);
    if (phase === 'over') overStatus(); else updateStatus();
    saveSession();
    if (atLive) { syncFlip(true, 300); maybeAI(); }
    refreshHint();
  }

  $('#undo-btn').addEventListener('click', () => navigate(-1));
  $('#redo-btn').addEventListener('click', () => navigate(1));

  /* TAS hint: the 3 best moves for the side to move, numbered 1-3 on the board */
  $('#hint-btn').addEventListener('click', () => runHint(false));
  /** Show the hint. `viaMod`: started from the mod menu in a Classic game (also works in 2-player games and in games from other modes' rules). */
  function runHint(viaMod) {
    if (phase !== 'play' || aiBusy || !humanTurn() || (!viaMod && !ai)) return;
    if (viaMod) classicMods.add('Hint');
    const key = positionKey(game);
    const sanOf = (m) => {
      let san = game.moveToSan(m);
      game.makeMove(m);
      if (game.inCheck(game.turn)) san += game.hasLegalMove() ? '+' : '#';
      game.unmakeMove();
      return fmt(san);
    };
    const show = (list, mate, brill) => {
      if (!list.length) return;
      selected = -1;
      legalTargets = [];
      hintMoves = list.slice(0, mate ? 1 : 3);
      if (mate) hintMoves.mate = mate.steps;
      else if (brill) hintMoves.brill = brill;
      renderBoard();
      updateHintGlow();
      if (mate) setStatus('Forced mate in ' + mate.n + ': play the orange squares in order');
      else setStatus((brill ? 'Brilliant move in blue. ' : '') + (list.length > 1 ? 'Best 3 moves: ' : 'Best move: ') + hintMoves.map((m, i) => `${i + 1}. ${sanOf(m)}`).join('   '));
    };
    const mate = hintCache && hintCache.key === key && hintCache.result ? hintCache.result : (window.findMateLine ? window.findMateLine(game, 8, 1500) : null);   // (the quick check that lights the button is shallow; pressing Hint looks deeper)
    if (mate) { show([mate.move], mate); return; }
    const tok = ++aiToken;       // blocks play while the search runs, and is cancelled by anything that resets the game
    aiBusy = true;
    updateControls();
    thinkingStatus();
    const t0 = Date.now();
    searchTop(game, 'hint', game.turn, null, (res) => {
      if (tok !== aiToken) return;
      setTimeout(() => {
        if (tok !== aiToken) return;
        const ordered = window.MoveRating && window.MoveRating.sacOrder ? window.MoveRating.sacOrder(game, res) : res;   // a sound sacrifice that breaks up their defence goes first
        const list = ordered.map((r) => r.move);
        const finish = (brill) => {
          if (tok !== aiToken) return;
          aiBusy = false;
          updateControls();
          if (phase !== 'play' || positionKey(game) !== key) return;
          show(list, null, brill);
        };
        // is one of the three a brilliant move? check them one at a time so the page stays alive
        let i = 0;
        const next = () => {
          if (tok !== aiToken) return;
          if (i >= list.length || !(window.MoveRating && window.MoveRating.rate)) { finish(null); return; }
          let r = null;
          try { r = window.MoveRating.rate(game, list[i]); } catch (e) { r = null; }
          if (r && r.id === 'brilliant') { finish(list[i]); return; }
          i++;
          setTimeout(next, 0);
        };
        setTimeout(next, Math.max(0, 300 - (Date.now() - t0)));
      }, 0);
    });
  }

  /* 0 players: pause and resume the match */
  $('#pause-btn').addEventListener('click', () => {
    if (!(bots || clock) || phase !== 'play') return;
    paused = !paused;
    if (clock && !bots) {   // timed game: the clock stops, the computer stops thinking, and nobody can move until Resume
      if (paused) { aiToken++; aiBusy = false; hintMoves = []; selected = -1; legalTargets = []; renderBoard(); setStatus('Paused. Tap Resume to carry on.'); }
      else { lastTick = 0; updateStatus(); maybeAI(); }
      updateControls();
      return;
    }
    updateControls();
    if (!paused) maybeAI();
    else if (!aiBusy) setStatus('Paused');
  });

  /* TAS: take the computer's turns yourself. While this is on the computer never moves. */
  $('#both-btn').addEventListener('click', () => { if (isTas()) setPlayBoth(!playBoth); });

  $('#reset-btn').addEventListener('click', () => {
    if (online) return;
    if (phase === 'play' && sans.length) {
      confirmSheet('Start a new game?', 'New game', () => { session.clear(); startGame(mode, true); });
    } else {
      startGame(mode, true);
    }
  });

  $('#back-btn').addEventListener('click', () => {
    if (phase === 'replay') { exitReplay(); return; }
    const leave = () => { if (online && window.LP.onlineNet) window.LP.onlineNet.leave(); backToMenu(); };
    if (online && phase === 'play') { confirmSheet('Leave this game? Leaving forfeits it.', 'Forfeit', () => { resign(online.me); leave(); }); return; }
    if ((phase === 'play' && sans.length)) confirmSheet('Leave this game? You can continue it from the menu.', 'Leave', leave); else leave();
  });

  /* ----------------------------------------------------------------- replay */
  const SPEEDS = [1, 2, 4, 0.5];
  const TIMED_SPEEDS = [1, 2, 4, 8, 16, 0.5];   // a timed replay runs on the real clock, so it can go much faster

  function startReplay(data, from) {
    pauseReplay();
    closeSheet();
    const timed = !!(data.clock && data.at && data.at.length === data.moves.length && data.moves.length);
    replay = { data, idx: 0, speed: 1, timer: null, from, prevFlipped: flipped, timed, t: 0, total: timed ? Math.max(1000, data.endAt || data.at[data.at.length - 1] + 1000) : 0 };
    rgame.mode = data.mode;
    rgame.reset();
    if (data.fen) rgame.loadFen(data.fen);
    if (data.gfirst) rgame.turn = data.gfirst;
    rgame.secretQueen = { [WHITE]: data.secrets.w, [BLACK]: data.secrets.b };
    G = rgame;
    viewNames = { [WHITE]: data.names.w, [BLACK]: data.names.b };
    phase = 'replay';
    selected = -1;
    legalTargets = [];
    pickSel = -1;
    flipped = false;
    coverEl.classList.add('hidden');
    $('#mode-title').textContent = data.tas ? 'Sandbox replay' : 'Replay';
    $('#scrub').max = timed ? replay.total : data.moves.length;
    $('#scrub').step = timed ? 50 : 1;
    $('#scrub').value = 0;
    $('#rp-speed').textContent = '1x';
    showPage('game');
    buildBoard();
    renderAll();
    renderMoves(data.sans, 0);
    replayStatus();
    syncReplayUI();
  }

  function replayStatus() {
    const { data, idx } = replay;
    if (idx === 0) { setStatus('Start position', 'dim'); return; }
    if (idx === data.moves.length && data.result) { setStatus(data.result); return; }
    const check = G.inCheck(G.turn);
    const snl = G.mode === 'snail' ? snailLine(G.history[G.history.length - 1]) : '';
    setStatus(`${snl}Move ${Math.ceil(idx / 2)} · ${fmt(data.sans[idx - 1])}${replay.timed ? ' · ' + mmss(replay.t) : ''}`, check ? 'check' : '');
  }
  const mmss = (ms) => { const t = Math.floor(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  function syncReplayUI() {
    const { data, idx, timer } = replay;
    $('#scrub').value = replay.timed ? replay.t : idx;
    const ex = $('#rp-export');
    if (ex) { ex.disabled = !!timer; ex.title = timer ? 'Pause the replay to export the board' : ''; ex.classList.toggle('hidden', !!data.tas); }
    const play = $('#rp-play');
    play.textContent = timer ? 'Pause' : (replay.timed ? replay.t >= replay.total : idx >= data.moves.length) ? 'Restart' : 'Play';
    const tl = $('#rp-time');
    if (tl) { tl.classList.toggle('hidden', !replay.timed); tl.textContent = replay.timed ? mmss(replay.t) + ' / ' + mmss(replay.total) : ''; }
  }

  /** Timed replays: jump to a moment on the timeline, showing every move played up to then. */
  function seekT(t, anim) {
    const d = replay.data;
    t = Math.max(0, Math.min(replay.total, t));
    replay.t = t;
    let n = 0;
    while (n < d.at.length && d.at[n] <= t) n++;
    if (n !== replay.idx) goTo(n, anim && Math.abs(n - replay.idx) === 1, true);
    else { renderBars(); replayStatus(); }
    syncReplayUI();
  }

  function goTo(n, anim, keepT) {
    const { data } = replay;
    n = Math.max(0, Math.min(data.moves.length, n));
    const cur = replay.idx;
    if (replay.timed && !keepT) replay.t = n ? data.at[n - 1] : 0;
    if (n === cur) { if (replay.timed) { renderBars(); syncReplayUI(); } return; }
    let animated = null, reverse = false, undoneH = null;
    while (replay.idx < n) {
      const m = data.moves[replay.idx];
      rgame.makeMove(m);
      replay.idx++;
      animated = m;
    }
    while (replay.idx > n) {
      undoneH = rgame.history[rgame.history.length - 1];
      animated = undoneH.move;
      rgame.unmakeMove();
      replay.idx--;
      reverse = true;
    }
    renderAll();
    if (anim && Math.abs(n - cur) === 1 && animated) {
      animateMove(animated, reverse);
      const h = rgame.history[rgame.history.length - 1];
      if (!reverse && h && h.wasSecretMove) popReveal(animated.to);
      if (reverse) animateSnails(undoneH, true); else animateSnails(h, false);
    }
    renderMoves(data.sans, n);
    replayStatus();
    syncReplayUI();
  }

  function tick() {
    if (!replay || !replay.timer) return;
    if (replay.timed) {
      replay.t += 50 * replay.speed;
      if (replay.t >= replay.total) { seekT(replay.total, false); pauseReplay(); return; }
      seekT(replay.t, true);
      replay.timer = setTimeout(tick, 50);
      return;
    }
    if (replay.idx >= replay.data.moves.length) { pauseReplay(); return; }
    goTo(replay.idx + 1, true);
    replay.timer = setTimeout(tick, 950 / replay.speed);
    syncReplayUI();
  }

  function playReplay() {
    if (!replay) return;
    if (replay.timed ? replay.t >= replay.total : replay.idx >= replay.data.moves.length) { replay.t = 0; goTo(0, false); }
    replay.timer = setTimeout(tick, replay.timed ? 50 : 400);
    syncReplayUI();
  }

  function pauseReplay() {
    if (!replay) return;
    clearTimeout(replay.timer);
    replay.timer = null;
    syncReplayUI();
  }

  function exitReplay() {
    const from = replay.from;
    const pf = replay.prevFlipped;
    pauseReplay();
    replay = null;
    G = game;
    viewNames = names;
    $('#mode-title').textContent = MODE_LABEL[mode];
    if (from === 'over') {
      phase = 'over';
      flipped = pf;
      buildBoard();
      renderAll();
      renderMoves(sans, sans.length);
      overStatus();
      showOverSheet();
    } else if (from === 'history' && window.LP.history) {
      phase = 'menu';
      updateControls();
      window.LP.history.show();
    } else {
      phase = 'menu';
      renderSavedList();
      showPage('menu');
      updateControls();
    }
  }

  $('#rp-export').addEventListener('click', () => { if (replay && !replay.timer && window.LP.exporter) window.LP.exporter.boardSheet(rgame.toFen()); });
  $('#rp-play').addEventListener('click', () => { replay.timer ? pauseReplay() : playReplay(); });
  $('#rp-next').addEventListener('click', () => { pauseReplay(); goTo(replay.idx + 1, true); });
  $('#rp-prev').addEventListener('click', () => { pauseReplay(); goTo(replay.idx - 1, true); });
  $('#rp-start').addEventListener('click', () => { pauseReplay(); goTo(0, false); });
  $('#rp-end').addEventListener('click', () => { pauseReplay(); goTo(replay.data.moves.length, false); });
  $('#rp-exit').addEventListener('click', exitReplay);
  $('#rp-speed').addEventListener('click', () => {
    const list = replay.timed ? TIMED_SPEEDS : SPEEDS;
    replay.speed = list[(list.indexOf(replay.speed) + 1) % list.length];
    $('#rp-speed').textContent = replay.speed + 'x';
  });
  $('#scrub').addEventListener('input', (e) => { pauseReplay(); if (replay.timed) seekT(+e.target.value, false); else goTo(+e.target.value, false); });

  document.addEventListener('keydown', (e) => {
    if (phase !== 'replay' || !sheetBg.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') { pauseReplay(); goTo(replay.idx + 1, true); }
    else if (e.key === 'ArrowLeft') { pauseReplay(); goTo(replay.idx - 1, true); }
    else if (e.key === ' ') { e.preventDefault(); replay.timer ? pauseReplay() : playReplay(); }
  });

  /* ------------------------------------------------------------ saved list */
  function renderSavedList() {
    if (window.LP && window.LP.saves) window.LP.saves.render();
    if (window.LP && window.LP.analyze && window.LP.analyze.refreshMenu) window.LP.analyze.refreshMenu();
    if (window.LP && window.LP.history && window.LP.history.refreshMenu) window.LP.history.refreshMenu();
  }

  renderSavedList();
  buildBoard();
  /** Start a game from a custom position (the editor): players = 1 (against the computer) or 2. */
  function playPosition(fen, players) {
    const probe = new Chess();
    if (probe.loadFen(fen)) return;
    startFen = fen;
    pz = null;
    pendingTc = null;
    guardSlots(() => { if (players === 2) { startGame('basic', false, null); } else askDifficulty('basic'); });
  }
  /** A Popular puzzle: you are forced to the side to move, the computer is always Insane. */
  function playPopular(p) {
    const probe = new Chess();
    if (probe.loadFen(p.fen)) return;
    guardSlots(() => {
      startFen = p.fen;
      pz = { id: p.id, name: p.name, goal: p.goal, n: p.n || 0 };
      pendingTc = null;
      freshGame('basic');
      const me = p.fen.split(' ')[1] === 'b' ? BLACK : WHITE;
      ai = { level: 'insane', color: me === WHITE ? BLACK : WHITE, human: me };
      bots = null;
      const nm = (window.LP.profile && window.LP.profile.name()) || 'Player';
      names = { [me]: nm, [ai.color]: 'Computer (Insane)' };
      viewNames = names;
      sidesCtx = { [me === WHITE ? 'w' : 'b']: 'p1', [me === WHITE ? 'b' : 'w']: 'p2' };
      phase = 'names';
      showPage('game');
      buildBoard();
      renderAll();
      renderMoves([], 0);
      setStatus('');
      closeSheet();
      loadOptsFromSettings();
      opts.autoFlip = false;
      afterNames();
    });
  }
  /** Drag and drop (drag.js): only your own pieces, on your turn, in the modes that move by tapping squares. */
  const dragHooks = {
    tap: (s) => onSquare(s),
    selected: () => (preWaiting() ? preSel : selected),
    can: (s) => preWaiting() ? (!!preBoard()[s] && (preBoard()[s] & 24) === preMe()) : (paused && clock && !bots) || (online && game.turn !== online.me) ? false : modTool() ? (modTool() === 'move' && !pendingPromo && !!game.board[s] && sheetBg.classList.contains('hidden')) : phase === 'play' && !aiBusy && !pendingPromo && !isArr() && mode !== 'guess' && coverEl.classList.contains('hidden') && sheetBg.classList.contains('hidden')
      && humanTurn() && !!game.board[s] && (game.board[s] & 24) === game.turn && (branch() || viewPly === sans.length),
  };
  /* ------------------------------------------------------------ Online (the network side lives in online.js) */
  const sqOf = (t) => (+t[1] - 1) * 16 + (t.charCodeAt(0) - 97);
  /** cfg: { id, me: 'w'|'b', names: { w, b }, base, inc } (base 0 = unlimited) */
  function onlineStart(cfg) {
    startFen = null; pz = null;
    pendingTc = cfg.base ? { base: cfg.base, inc: cfg.inc || 0 } : null;
    freshGame('online');
    phase = 'names';
    ai = null; bots = null;
    names = { [WHITE]: cfg.names.w, [BLACK]: cfg.names.b };
    viewNames = names;
    const me = cfg.me === 'w' ? WHITE : BLACK;
    online = { me, id: cfg.id, flagAt: 0 };
    sidesCtx = { [me === WHITE ? 'w' : 'b']: 'p1', [me === WHITE ? 'b' : 'w']: 'p2' };
    loadOptsFromSettings();
    opts.autoFlip = false;
    opts.ratings = false;
    showPage('game');
    buildBoard();
    renderAll();
    renderMoves([], 0);
    setStatus('');
    closeSheet();
    afterNames();
    setFlipped(me === BLACK, false);
    updateControls();
  }
  /** The other player's move, e.g. "e2e4" or "e7e8q". False if it is not a legal move here. */
  function onlineApply(u) {
    if (!online || phase !== 'play') return true;
    const pr = ({ q: 5, r: 4, b: 3, n: 2 })[u[4]] || 0;
    const m = game.legalMoves().find((x) => x.from === sqOf(u.slice(0, 2)) && x.to === sqOf(u.slice(2, 4)) && (x.promo || 0) === pr);
    if (!m) return false;
    remoteApplying = true;
    try { doMove(m); } finally { remoteApplying = false; }
    online.flagAt = 0;
    return true;
  }
  function onlineClocks(c) {
    if (!clock || !c) return;
    clock[WHITE] = c.w; clock[BLACK] = c.b;
    online.flagAt = 0;
    lastTick = Date.now();
    updateClocks();
  }
  /** The server says the game ended (resign, time, idle, draw agreed, or a result the other browser reported first). */
  function onlineEnd(result, reason) {
    if (!online || phase !== 'play') return;
    const winner = result === '1-0' ? WHITE : result === '0-1' ? BLACK : null;
    aiToken++; aiBusy = false;
    remoteEnding = true;
    try {
      if (winner == null) endGame(['stalemate', 'material', 'fifty', 'repeat'].includes(reason) ? reason : 'agreed', null);
      else if (reason === 'timeout') endGame('time', winner);
      else if (reason === 'resign') endGame('resign', winner);
      else if (reason === 'mate') endGame('mate', winner);
      else endGame('abandon', winner);
    } finally { remoteEnding = false; }
  }
  const chessOnline = {
    start: onlineStart, apply: onlineApply, setClocks: onlineClocks, remoteEnd: onlineEnd, toast: (t) => showToast(t, false),
    state: () => ({ phase, turn: game.turn === WHITE ? 'w' : 'b', me: online ? (online.me === WHITE ? 'w' : 'b') : '', active: !!online }),
  };
  window.LP = { chessOnline, levelMenu, playPopular, dragHooks, openSheet, closeSheet, showPage, esc, LEVEL_LABEL, store, renderSavedList, session, applySettings, sides: () => sidesCtx, setSides: (m) => { sidesCtx = m || { w: 'p1', b: 'p2' }; }, fmt,
    resumeChess, startReplay, playPosition, MODE_LABEL, confirmSheet, MAX_SLOTS };
  // Profile loads after app.js; pick up saved settings once it is ready
  setTimeout(loadOptsFromSettings, 0);
})();
