/**
 * Global leaderboard (needs the online server). Each device has an anonymous player id; the name and a tiny
 * copy of the profile picture are sent with each score. Boards: average Elo, win streak against real players, perfect puzzles,
 * pieces captured, currency, Puzzle Rush best scores, Highest Solved puzzle rating, Capture Rush, brilliant moves, best moves and
 * time played. Tap a player on a board to open their profile.
 * Scores are sent by the player's own browser, so the board is for fun and trusts what it is sent.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const PIDKEY = 'localPieces.pid';
  const N = () => LP.onlineApi;
  const enabled = () => !!(N() && N().url && N().url());

  let pid = '';
  try { pid = localStorage.getItem(PIDKEY) || ''; } catch (e) { /* ignore */ }
  if (!pid) {
    pid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
    try { localStorage.setItem(PIDKEY, pid); } catch (e) { /* ignore */ }
  }
  const nameNow = () => (LP.profile && LP.profile.name && LP.profile.name()) || 'Player';

  /** The profile picture shrunk to a small JPEG so it is cheap to send and store. */
  const cache = { big: { src: null, out: '' }, small: { src: null, out: '' } };
  function thumb(src, small) {
    if (!src) return Promise.resolve('');
    const SZ = small ? 28 : 64, CAP = small ? 2000 : 8500, cc = small ? cache.small : cache.big;
    if (cc.src === src) return Promise.resolve(cc.out);
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = SZ;
          const x = c.getContext('2d'), s = Math.min(im.width, im.height);
          x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, SZ, SZ);
          let out = c.toDataURL('image/jpeg', 0.7);
          if (out.length > CAP) out = c.toDataURL('image/jpeg', 0.45);
          if (out.length > CAP) out = '';
          cc.src = src; cc.out = out; res(out);
        } catch (e) { res(''); }
      };
      im.onerror = () => res('');
      im.src = src;
    });
  }

  async function submitRush(score, hs, mode) {
    if (!enabled()) return null;
    const pfp = await thumb(LP.profile && LP.profile.pfp && LP.profile.pfp());
    const r = await N().post({ a: 'lbsubmit', pid, name: nameNow(), pfp, score, hs, m: mode || 's' }, 3, 'lb');
    return r && r.ranks ? r : null;
  }

  /** Sends the numbers for the boards and the profile card (name, tiny pictures, stats). Only when something changed. */
  let lastSent = '';
  async function syncStats(force) {
    if (!enabled() || !LP.stats || !LP.stats.snapshot || !(LP.profile && LP.profile.name && LP.profile.name())) return;
    const pf = LP.profile && LP.profile.pfp && LP.profile.pfp();
    const s = Object.assign(LP.stats.snapshot(), { pfp: await thumb(pf), pfs: await thumb(pf, true) });
    const k = nameNow() + '|' + JSON.stringify(s);
    if (!force && k === lastSent) return;
    lastSent = k;
    return N().post(Object.assign({ a: 'lbstats', pid, name: nameNow() }, s), 2, 'lb').then((r) => { if (!r || r.error) lastSent = ''; });
  }

  /* ------------------------------------------------------------------ page */
  // [id, chip label, title shown over the list, what the number is, unit under each number]
  const BOARDS = [
    ['elo', 'Elo', 'Average Elo', 'The average of your Classic, Bullet and Rapid ratings. Elo only changes in online games against real players.', 'Elo'],
    ['ws', 'Win streak', 'Win streak against real players', 'The most online games won in a row against real players. A draw or a loss ends the run.', 'in a row'],
    ['perf', 'Perfect puzzles', 'Perfect puzzles solved', 'Puzzles solved with no wrong move, no hint and no solution used.', 'perfect'],
    ['taken', 'Pieces captured', 'Most pieces captured', 'Every piece you have captured in your games.', 'pieces'],
    ['coins', 'Currency', 'Most currency', 'The coins each player holds right now.', 'coins'],
    ['rushavg', 'Rush', 'Puzzle Rush: average score', 'The average of your best 3 minute, 5 minute and Survival Puzzle Rush scores. Play all three to raise it.', 'points'],
    ['hs', 'Hardest puzzle', 'Puzzle Rush: hardest puzzle solved', 'The rating of the hardest puzzle solved in a Puzzle Rush run.', 'rating'],
    ['brill', 'Brilliant moves', 'Most brilliant moves found', 'Brilliant moves found in your Analyze reviews.', 'brilliant'],
    ['best', 'Best moves', 'Most best moves found', 'Best moves found in your Analyze reviews.', 'best moves'],
    ['secs', 'Time played', 'Most time played', 'Total time spent playing on this device.', 'played'],
  ];
  let board = 'elo', token = 0;
  const fmtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + 'h ' + m + 'm' : Math.max(1, m) + 'm'; };
  const fmtV = (b, v) => (b === 'secs' ? fmtT(v) : String(v));
  const av = (src, name) => (src ? `<span class="gl-av" style="background-image:url(${src})"></span>` : `<span class="gl-av">${esc((name || '?')[0].toUpperCase())}</span>`);

  function render(chips, body) {
    const my = ++token;
    chips.className = 'lb-chips';
    if (!enabled()) {
      chips.innerHTML = '';
      body.innerHTML = '<div class="lb-empty"><span aria-hidden="true">&#127760;&#xFE0E;</span><p>The global leaderboard needs the online server. Set it up in supabase-config.js.</p></div>';
      return;
    }
    chips.innerHTML = BOARDS.map((b) => `<button class="lb-chip${b[0] === board ? ' on' : ''}" data-b="${b[0]}">${b[1]}</button>`).join('');
    chips.querySelectorAll('.lb-chip').forEach((b) => { b.onclick = () => { board = b.dataset.b; render(chips, body); }; });
    const B = BOARDS.find((b) => b[0] === board);
    body.innerHTML = `<h2 class="gl-title">${esc(B[2])}</h2><p class="lb-hint gl-info">What it measures: ${esc(B[3].charAt(0).toLowerCase() + B[3].slice(1))}</p>` +
      '<div id="gl-list"><p class="lb-hint">Loading…</p></div>';
    syncStats().then(() => N().get({ a: 'lbget', board, pid })).then((r) => {
      if (my !== token) return;
      const box = body.querySelector('#gl-list');
      if (!box) return;
      if (!r || r.error || !r.top) { box.innerHTML = '<p class="lb-hint">Could not load the board. Check your connection.</p>'; return; }
      if (!r.top.length) { box.innerHTML = '<div class="lb-empty"><span aria-hidden="true"><i class="ic-star"></i></span><p>Nobody is on this board yet. Be the first.</p></div>'; return; }
      const rows = r.top.map((e) => `<li class="lb-row gl-row r${e.rank <= 3 ? e.rank : ''}${e.you ? ' me' : ''}"${e.id ? ` data-id="${esc(e.id)}"` : ''}>
          <span class="lb-rank">${e.rank}</span>${av(e.pfp, e.name)}
          <span class="lb-who"><b>${esc(e.name)}${e.you ? ' (you)' : ''}</b></span>
          <span class="lb-val"><b>${esc(fmtV(board, e.value))}</b><span>${esc(B[4])}</span></span></li>`).join('');
      const mine = r.me && r.me.rank > r.top.length ? `<p class="lb-hint">Your rank: #${r.me.rank} of ${r.total}. Your score: ${esc(fmtV(board, r.me.value))}</p>` : (!r.me ? '<p class="lb-hint">Your rank: not on this board yet.</p>' : '');
      box.innerHTML = '<ol class="lb-list">' + rows + '</ol>' + mine + `<p class="lb-hint">Players on this board: ${r.total}. Tap a player to see their profile.</p>`;
      box.querySelectorAll('.gl-row[data-id]').forEach((li) => { li.onclick = () => { if (LP.players) LP.players.open(li.dataset.id); }; });
    });
  }

  /* ---- its own page, opened from the Global section of the menu */
  function build() {
    const app = document.querySelector('#app');
    if (!app) return;
    const sec = document.createElement('section');
    sec.id = 'gl-page'; sec.className = 'page';
    sec.innerHTML = `<header class="game-header">
        <button id="gl-back" class="text-btn" aria-label="Back to menu">&larr; Menu</button>
        <span class="pz-head"><span class="mode-title">Global Leaderboard</span></span>
        <span class="header-spacer"></span>
      </header>
      <div class="lb-wrap"><p class="sg-lead">See how you rank against every player. Pick a board:</p>
        <div id="gl-chips" class="lb-chips"></div><div id="gl-body"></div></div>`;
    app.insertBefore(sec, document.querySelector('#sheet-bg'));
    document.querySelector('#gl-back').onclick = () => LP.showPage('menu');
    const m = document.querySelector('.mode[data-mode="global"]');
    if (m) m.addEventListener('click', () => show());
  }
  function show(b) {
    if (b) board = b;
    render(document.querySelector('#gl-chips'), document.querySelector('#gl-body'));
    LP.showPage('gl-page');
  }
  build();

  setTimeout(() => syncStats(), 3000);
  setInterval(() => { if (!document.hidden) syncStats(); }, 120000);   // picks up a new name or picture, finished puzzles, coins
  LP.global = { pid: () => pid, thumb, thumbSmall: (src) => thumb(src, true), submitRush, syncStats, render, show, enabled };
})();
