/**
 * Live watching for every mode that has no move list to replay: variants (Secret Queen, Gamblite, Royale, Snail, 2-player),
 * Capture Rush, puzzles + Puzzle Rush + Puzzle Battle, and Air Hockey.
 * - SENDING: a mode calls LP.live.push(kind, label, () => snapshot, minGapMs). Snapshots are small (<6 KB), sent at most every ~0.6 s
 *   (hockey ~0.35 s), resent every 25 s as a keep-alive, and closed with LP.live.end().
 * - WATCHING: LP.live.watch(pl, name, back) opens the viewer from the Players list. It redraws from the newest snapshot (polls every ~0.7 s).
 * - Secrets are never sent: the Secret Queen's hidden queen stays a pawn on the spectator's board until it reveals itself.
 * - Respects Settings > "Allow spectators".
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const N = () => LP.onlineApi;
  const online = () => !!(N() && N().url && N().url());
  const pid = () => (LP.global && LP.global.pid ? LP.global.pid() : '');
  const allowed = () => !(LP.prefs && LP.prefs.get('spectate') === false);
  const PAGES = { chess: ['game'], crush: ['rush'], puzzle: ['puzzle', 'popular'], hockey: ['hockey'] };

  /* ================================================================== sending */
  let cur = null;   // { id, kind, label, fn, last, timer, busy }
  const sendNow = (final) => {
    if (!cur) return;
    let snap;
    try { snap = cur.fn(); } catch (e) { snap = null; }
    if (!snap) return;
    cur.last = Date.now();
    N().post({ a: 'lsync', pid: pid(), id: cur.id, kind: cur.kind, label: cur.label, snap, status: final ? 'over' : 'active' }, 2, 'live');
  };
  function push(kind, label, fn, gap) {
    if (!online() || !allowed() || !pid()) return;
    if (cur && cur.kind !== kind) end();
    if (!cur) cur = { id: 'L' + N().rnd(), kind, label, fn, last: 0, timer: 0 };
    cur.fn = fn; cur.label = label;
    if (cur.timer) return;
    const wait = Math.max(0, (gap || 600) - (Date.now() - cur.last));
    cur.timer = setTimeout(() => { if (cur) { cur.timer = 0; sendNow(false); } }, wait);
  }
  /** The game or run is over (or you left it): send the last picture and stop listing it as live. */
  function end(kind) {
    if (!cur || (kind && cur.kind !== kind)) return;
    clearTimeout(cur.timer); cur.timer = 0;
    sendNow(true);
    cur = null;
  }
  const activePage = () => { const p = document.querySelector('.page.active'); return p ? p.id : ''; };
  setInterval(() => { if (cur && !(PAGES[cur.kind] || []).includes(activePage())) end(); }, 2000);   // left the screen: no longer live
  setInterval(() => { if (cur && !cur.timer && !document.hidden && Date.now() - cur.last > 25000) sendNow(false); }, 5000);   // keep-alive for long thinks

  /* ================================================================== watching */
  const FILL = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  let page = null, poll = 0, token = 0, upd = null, view = null, tick = 0;

  function build() {
    if (page) return;
    const app = $('#app');
    page = document.createElement('section');
    page.id = 'lw-page'; page.className = 'page';
    page.innerHTML = '<header class="game-header"><button id="lw-back" class="text-btn" aria-label="Back">&larr; Back</button><span class="mode-title" id="lw-title">Watching</span><span class="header-spacer"></span></header><div class="lw-wrap"><div class="lw-bar lw-top" id="lw-top"></div><div id="lw-stage"></div><div class="lw-bar lw-bot" id="lw-bot"></div><p class="lw-status" id="lw-status" aria-live="polite"></p><p class="lw-note" id="lw-note"></p></div>';
    app.insertBefore(page, $('#sheet-bg'));
    $('#lw-back').onclick = () => {
      stop();
      const b = (view && view.back) || 'menu';
      if (b === 'pl-page' && LP.players && LP.players.show) LP.players.show();   // back to the player list
      else LP.showPage(b);
    };
    new MutationObserver(() => { if (!page.classList.contains('active')) stop(); }).observe(page, { attributes: true, attributeFilter: ['class'] });
  }
  function stop() { token++; clearTimeout(poll); clearInterval(tick); }

  /** pieces string: 64 chars, rank 8 first, a to h; upper = white, lower = black, '.' empty. Drawn with the app's own piece look. */
  function boardHtml(b, lm, flip, extra) {
    let h = '<div class="lw-board" aria-label="Board">';
    for (let i = 0; i < 64; i++) {
      const s = flip ? 63 - i : i, r = s >> 3, f = s & 7, c = b[s] || '.';
      const cls = ((r + f) % 2 ? 'dark' : 'light') + (lm && (lm[0] === s || lm[1] === s) ? ' last' : '') + (extra && extra[s] ? ' ' + extra[s] : '');
      h += `<div class="square ${cls}">${c !== '.' ? `<span class="piece ${c === c.toUpperCase() ? 'w' : 'b'}">${FILL[c.toLowerCase()]}︎</span>` : ''}</div>`;
    }
    return h + '</div>';
  }
  const bar = (name, side, txt) => `<span class="lw-nm"><i class="lw-dot ${side}"></i><b>${esc(name || (side === 'w' ? 'White' : 'Black'))}</b></span><span class="lw-tx">${txt || ''}</span>`;
  const clockTxt = (ms) => { ms = Math.max(0, Math.round(ms / 1000)); return Math.floor(ms / 60) + ':' + String(ms % 60).padStart(2, '0'); };

  /* ---- one drawing function per kind ---- */
  function drawChess(sn) {
    const flip = !!sn.fl, nm = sn.nm || [], ck = sn.ck;
    const ex = {};
    if (sn.sn) sn.sn.forEach((q, i) => { if (q >= 0) ex[q] = 'lw-snail'; });
    const clk = (side) => (ck ? `<span class="lw-clk${ck.run === side ? ' run' : ''}" data-side="${side}">${clockTxt(ck[side])}</span>` : '');
    const extra = (side) => {
      if (sn.el) return `<span class="lw-el">&#9889; ${sn.el[side === 'w' ? 0 : 1]}/10</span>`;
      if (sn.pw != null) return `<span class="lw-el">${side === 'w' ? sn.pw : 100 - sn.pw}%</span>`;
      return '';
    };
    const top = flip ? 'w' : 'b', bot = flip ? 'b' : 'w';
    $('#lw-top').innerHTML = bar(nm[top === 'w' ? 0 : 1], top, extra(top) + clk(top));
    $('#lw-bot').innerHTML = bar(nm[bot === 'w' ? 0 : 1], bot, extra(bot) + clk(bot));
    $('#lw-stage').innerHTML = boardHtml(sn.b, sn.lm, flip, ex);
    $('#lw-status').textContent = sn.ov || sn.st || '';
    $('#lw-note').textContent = sn.mode === 'secret' ? 'The secret queen stays hidden from spectators until it is revealed.' : '';
  }
  function drawCrush(sn) {
    $('#lw-top').innerHTML = bar((sn.nm || [])[1], 'b', '');
    $('#lw-bot').innerHTML = bar((sn.nm || [])[0], 'w', `<span class="lw-el">Score ${sn.sc || 0}</span><span class="lw-clk run">${clockTxt(sn.left || 0)}</span>`);
    $('#lw-stage').innerHTML = boardHtml(sn.b, sn.lm, false);
    $('#lw-status').textContent = sn.st || '';
    $('#lw-note').textContent = '';
  }
  function drawPuzzle(sn, name) {
    $('#lw-top').innerHTML = `<span class="lw-nm"><b>${esc(sn.ttl || 'Puzzle')}</b></span><span class="lw-tx">${esc(sn.hud || '')}</span>`;
    $('#lw-bot').innerHTML = `<span class="lw-nm"><b>${esc(name)}</b></span><span class="lw-tx">${sn.opp ? esc(sn.opp) : ''}</span>`;
    $('#lw-stage').innerHTML = boardHtml(sn.b, sn.lm, !!sn.fl);
    $('#lw-status').textContent = sn.st || '';
    $('#lw-note').textContent = '';
  }
  function drawHockey(sn) {
    const nm = sn.nm || [];
    $('#lw-top').innerHTML = bar(nm[1], 'b', `<span class="lw-el">${(sn.sc || [0, 0])[1]}</span>`);
    $('#lw-bot').innerHTML = bar(nm[0], 'w', `<span class="lw-el">${(sn.sc || [0, 0])[0]}</span>`);
    let st = $('#lw-stage .lw-pitch');
    if (!st) { $('#lw-stage').innerHTML = '<div class="lw-pitch"><div class="lw-mid"></div><div class="lw-goal t"></div><div class="lw-goal b"></div></div>'; st = $('#lw-stage .lw-pitch'); }
    const dots = [];
    (sn.q || []).forEach((q, i) => dots.push([q[0], q[1], 'lw-pad ' + (i % 2 ? 'b' : 'w') + ' ' + (sn.pc || 'q')]));
    dots.push([sn.p[0], sn.p[1], 'lw-puck']);
    (sn.xp || []).forEach((q) => dots.push([q[0], q[1], 'lw-puck']));
    while (st.querySelectorAll('.lw-d').length < dots.length) { const d = document.createElement('i'); d.className = 'lw-d'; st.appendChild(d); }
    [...st.querySelectorAll('.lw-d')].forEach((d, i) => {
      const x = dots[i];
      if (!x) { d.style.display = 'none'; return; }
      d.style.display = ''; d.className = 'lw-d ' + x[2];
      d.style.left = (x[0] / 8 * 100) + '%'; d.style.top = ((8 - x[1]) / 8 * 100) + '%';
    });
    $('#lw-status').textContent = sn.st || '';
    $('#lw-note').textContent = '';
  }
  const DRAW = { chess: drawChess, crush: drawCrush, puzzle: drawPuzzle, hockey: drawHockey };

  function watch(pl, name, back) {
    build();
    stop();
    const my = ++token;
    view = { back };
    upd = null;
    $('#lw-title').textContent = 'Watching ' + (name || 'player');
    $('#lw-top').innerHTML = ''; $('#lw-bot').innerHTML = ''; $('#lw-stage').innerHTML = '<div class="lb-empty"><p>Loading…</p></div>'; $('#lw-status').textContent = ''; $('#lw-note').textContent = '';
    LP.showPage('lw-page');
    let gone = 0;
    const loop = async () => {
      if (my !== token) return;
      const r = await N().get({ a: 'lget', id: pl.id, u: upd || '' });
      if (my !== token) return;
      if (!r || r.error) {
        $('#lw-stage').innerHTML = `<div class="lb-empty"><p>${esc((r && r.error) || 'Could not load. Check your connection.')}</p></div>`;
        if (r && r.error) return;
      } else {
        if (!r.same && r.snap) {
          upd = r.upd;
          if (DRAW[r.kind]) DRAW[r.kind](r.snap, r.name || name);
          $('#lw-title').textContent = 'Watching ' + (r.name || name || 'player');
        }
        if (r.status === 'over') { const s = $('#lw-status'); if (s && !s.textContent) s.textContent = 'The game has ended'; return; }
        gone = r.live ? 0 : gone + 1;
        if (gone > 6) { $('#lw-status').textContent = 'This player has left.'; return; }
      }
      poll = setTimeout(loop, r && r.kind === 'hockey' ? 450 : 750);
    };
    loop();
    tick = setInterval(() => {   // keep a running clock moving between snapshots
      document.querySelectorAll('#lw-page .lw-clk.run[data-side]').forEach((e) => {
        const m = e.textContent.split(':'), s = (+m[0]) * 60 + (+m[1]) - 1;
        if (s >= 0) e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      });
    }, 1000);
  }

  LP.live = { push, end, watch, active: () => cur };
})();
