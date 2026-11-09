/**
 * Global leaderboard (needs the online server). Each device has an anonymous player id; the name and a tiny
 * copy of the profile picture are sent with each score. Boards: Puzzle Rush best score, Highest Solved
 * puzzle rating, Capture Rush, brilliant moves, best moves and time played.
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
  const cache = { src: null, out: '' };
  function thumb(src) {
    if (!src) return Promise.resolve('');
    if (cache.src === src) return Promise.resolve(cache.out);
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 64;
          const x = c.getContext('2d'), s = Math.min(im.width, im.height);
          x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 64, 64);
          let out = c.toDataURL('image/jpeg', 0.7);
          if (out.length > 8500) out = c.toDataURL('image/jpeg', 0.45);
          if (out.length > 8500) out = '';
          cache.src = src; cache.out = out; res(out);
        } catch (e) { res(''); }
      };
      im.onerror = () => res('');
      im.src = src;
    });
  }

  async function submitRush(score, hs) {
    if (!enabled()) return null;
    const pfp = await thumb(LP.profile && LP.profile.pfp && LP.profile.pfp());
    const r = await N().post({ a: 'lbsubmit', pid, name: nameNow(), pfp, score, hs }, 3);
    return r && r.ranks ? r : null;
  }

  let lastSent = '';
  function syncStats(force) {
    if (!enabled() || !LP.stats || !LP.stats.snapshot) return Promise.resolve();
    const s = LP.stats.snapshot();
    if (!s.cap && !s.brill && !s.best && !s.secs) return Promise.resolve();
    const k = JSON.stringify(s);
    if (!force && k === lastSent) return Promise.resolve();
    lastSent = k;
    return N().post(Object.assign({ a: 'lbstats', pid, name: nameNow() }, s), 2).then((r) => { if (!r || r.error) lastSent = ''; });
  }

  /* ------------------------------------------------------------------ page */
  // [id, chip label, title shown over the list, what the number is, unit under each number]
  const BOARDS = [
    ['rush', 'Puzzle Rush score', 'Puzzle Rush: best score', 'The most puzzles solved in one Puzzle Rush run.', 'points'],
    ['hs', 'Hardest puzzle', 'Puzzle Rush: hardest puzzle solved', 'The rating of the hardest puzzle solved in a Puzzle Rush run.', 'rating'],
    ['cap', 'Capture Rush score', 'Capture Rush: best score', 'The highest score in a single Capture Rush game.', 'points'],
    ['brill', 'Brilliant moves', 'Most brilliant moves found', 'Brilliant moves found in your Analyze reviews.', 'brilliant'],
    ['best', 'Best moves', 'Most best moves found', 'Best moves found in your Analyze reviews.', 'best moves'],
    ['secs', 'Time played', 'Most time played', 'Total time spent playing on this device.', 'played'],
  ];
  const PERIODS = [['today', 'Today'], ['week', 'This week'], ['all', 'All time']];
  let board = 'rush', period = 'all', token = 0;
  const fmtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + 'h ' + m + 'm' : Math.max(1, m) + 'm'; };
  const fmtV = (b, v) => (b === 'secs' ? fmtT(v) : String(v));
  const av = (src, name) => (src ? `<span class="gl-av" style="background-image:url(${src})"></span>` : `<span class="gl-av">${esc((name || '?')[0].toUpperCase())}</span>`);

  function render(chips, body) {
    const my = ++token;
    chips.className = 'lb-chips';
    if (!enabled()) {
      chips.innerHTML = '';
      body.innerHTML = '<div class="lb-empty"><span aria-hidden="true">&#127760;&#xFE0E;</span><p>The global leaderboard needs the online server. Set it up in online-config.js.</p></div>';
      return;
    }
    chips.innerHTML = BOARDS.map((b) => `<button class="lb-chip${b[0] === board ? ' on' : ''}" data-b="${b[0]}">${b[1]}</button>`).join('');
    chips.querySelectorAll('.lb-chip').forEach((b) => { b.onclick = () => { board = b.dataset.b; render(chips, body); }; });
    const timed = board === 'rush' || board === 'hs';
    const B = BOARDS.find((b) => b[0] === board);
    const per = timed ? PERIODS.find((p) => p[0] === period)[1] : 'All time';
    body.innerHTML = `<h2 class="gl-title">${esc(B[2])}<small>${esc(per)}</small></h2><p class="lb-hint gl-info">${esc(B[3])}</p>` +
      (timed ? `<div class="lb-chips seg">${PERIODS.map((p) => `<button class="lb-chip${p[0] === period ? ' on' : ''}" data-p="${p[0]}">${p[1]}</button>`).join('')}</div>` : '') +
      '<div id="gl-list"><p class="lb-hint">Loading…</p></div>';
    body.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { period = b.dataset.p; render(chips, body); }; });
    syncStats().then(() => N().get({ a: 'lbget', board, period: timed ? period : 'all', pid })).then((r) => {
      if (my !== token) return;
      const box = body.querySelector('#gl-list');
      if (!box) return;
      if (!r || r.error || !r.top) { box.innerHTML = '<p class="lb-hint">Could not load the board. Check your connection.</p>'; return; }
      if (!r.top.length) { box.innerHTML = '<div class="lb-empty"><span aria-hidden="true"><i class="ic-star"></i></span><p>Nobody is on this board yet. Be the first.</p></div>'; return; }
      const rows = r.top.map((e) => `<li class="lb-row gl-row r${e.rank <= 3 ? e.rank : ''}${e.you ? ' me' : ''}">
          <span class="lb-rank">${e.rank}</span>${av(e.pfp, e.name)}
          <span class="lb-who"><b>${esc(e.name)}${e.you ? ' (you)' : ''}</b></span>
          <span class="lb-val"><b>${esc(fmtV(board, e.value))}</b><span>${esc(B[4])}</span></span></li>`).join('');
      const mine = r.me && r.me.rank > r.top.length ? `<p class="lb-hint">Your rank: #${r.me.rank} of ${r.total} (${esc(fmtV(board, r.me.value))})</p>` : (!r.me ? '<p class="lb-hint">You are not on this board yet.</p>' : '');
      box.innerHTML = '<ol class="lb-list">' + rows + '</ol>' + mine + `<p class="lb-hint">${r.total} player${r.total === 1 ? '' : 's'}</p>`;
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

  setTimeout(() => syncStats(), 6000);
  LP.global = { pid: () => pid, thumb, submitRush, syncStats, render, show, enabled };
})();
