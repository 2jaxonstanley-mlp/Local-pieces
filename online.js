/**
 * Online: play a friend on another device. The game state lives in a Supabase database (see the supabase-*.sql files);
 * this file is the menu and the network side. Every call goes to one database function (api) and Supabase Realtime wakes the
 * polling loops the moment a game changes, so a move shows on the other screen almost at once.
 *
 *   - Create a game (timed or unlimited, private code or public list), join with a code, or pick an open game.
 *   - Each player's browser checks every move it receives, so the server never needs to know the rules.
 *   - No idle rule: take as long as you like to move. The other side only wins if your browser stops answering
 *     the server for 30 seconds (the page was closed).
 *   - Fast updates: polls are held open by the server and answer the moment something changes.
 *   - Resign, draw offers and rematches go through the same server.
 *   - Rematch: the server makes the next game straight away (colours swapped); both screens count down together and start
 *     at the same moment. Either player can decline during the countdown.
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (q) => document.querySelector(q);
  const IDLE_MS = 45000;
  const POLL_MS = 100;     // gap between polls (a poll waits for Realtime news, or 4 seconds, before it answers)
  const HOLD_MS = 4000;
  const TIMES = [[60, 0, '1 minute'], [180, 1, '3 minutes + 1'], [300, 0, '5 minutes'], [600, 0, '10 minutes']];
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
  const label = (mode, base, inc) => (mode === 'timed' ? (base % 60 === 0 ? base / 60 + ' min' : base + ' s') + (inc ? ' + ' + inc : '') : 'Unlimited');

  /* ---------------------------------------------------------------- network (Supabase) */
  const chains = {};   // writes go one after another per lane: puzzle scores never wait behind a puzzle upload
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SB_KEY = () => (window.SUPABASE_ANON_KEY || '').trim();
  const url = () => ((window.SUPABASE_URL || '').trim() && SB_KEY() ? (window.SUPABASE_URL || '').trim().replace(/\/+$/, '') : '');
  let sb = null;
  /** The Supabase client (made once). Null if the settings are empty or the library did not load. */
  function client() {
    if (sb) return sb;
    if (!url() || !window.supabase || !window.supabase.createClient) return null;
    sb = window.supabase.createClient(url(), SB_KEY(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 20 } } });
    return sb;
  }
  /** A secret key that proves this device owns its player id (sent with every request that names the player). */
  const ptk = (() => {
    let k = '';
    try { k = localStorage.getItem('localPieces.ptk') || ''; } catch (e) { k = ''; }
    if (k.length < 24) { k = rnd() + rnd(); try { localStorage.setItem('localPieces.ptk', k); } catch (e) { /* ignore */ } }
    return k;
  })();
  function rpc(body) {
    const c = client();
    if (!c) return Promise.reject(new Error('Supabase is not ready'));
    const payload = body && body.pid ? Object.assign({ ptk }, body) : body;
    const call = c.rpc('api', { p: payload }).then((r) => { if (r.error) throw new Error(r.error.message || 'request failed'); return r.data; });
    return Promise.race([call, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);   // a hung request must not stop the polling
  }
  const rawPost = (body) => rpc(body);

  /* Realtime: one channel per game being watched. A change wakes the poll that is waiting on it. */
  const watchers = {};
  function watch(table, id) {
    const key = table + ':' + id;
    let w = watchers[key];
    if (!w) {
      w = watchers[key] = { ver: 0, waiters: new Set(), t: 0, ch: null };
      const c = client();
      if (c) {
        try {
          w.ch = c.channel('lp-' + key + '-' + rnd().slice(0, 4)).on('postgres_changes', { event: '*', schema: 'public', table, filter: 'id=eq.' + id }, () => { w.ver++; Array.from(w.waiters).forEach((f) => f(true)); }).subscribe();
        } catch (e) { w.ch = null; }
      }
    }
    w.t = Date.now();
    return w;
  }
  setInterval(() => {   // a channel nobody has asked about for 30 seconds is closed
    Object.keys(watchers).forEach((k) => {
      const w = watchers[k];
      if (w.waiters.size || Date.now() - w.t < 30000) return;
      try { if (w.ch && client()) client().removeChannel(w.ch); } catch (e) { /* ignore */ }
      delete watchers[k];
    });
  }, 15000);
  const news = (w, ver, ms) => new Promise((res) => {   // resolves true when Realtime reports a change, false after ms
    if (w.ver !== ver) { res(true); return; }
    const f = (hit) => { clearTimeout(tm); w.waiters.delete(f); res(hit === true); };
    const tm = setTimeout(f, ms);
    w.waiters.add(f);
  });
  /** A "held" poll: if nothing has changed since the stamp the caller has (u), wait for news instead of answering at once. */
  async function heldGet(params) {
    if ((params.a !== 'poll' && params.a !== 'spec') || !params.wait || !params.id) return rpc(params);
    const w = watch(params.a === 'spec' && params.k === 'bot' ? 'bot_games' : 'games', String(params.id));
    const ver = w.ver;
    const r = await rpc(params);
    if (!r || r.error || !params.u || String(r.upd) !== String(params.u)) return r;
    return (await news(w, ver, HOLD_MS)) ? rpc(params) : r;
  }
  const rawGet = (params) => heldGet(params);

  /** Writes go one after another (a move must reach the server before the result), and are retried if the connection drops. */
  function post(body, tries, lane) {
    const run = async () => {
      for (let i = 0; i < (tries || 5); i++) {
        try {
          const r = await rawPost(body);
          if (r && r.error && /^Not out|^Opponent is still/.test(r.error) && i < (tries || 5) - 1) { await sleep(2000); continue; }
          return r;
        } catch (e) { await sleep(1000); }
      }
      return { error: 'No connection' };
    };
    lane = lane || 'main';
    const p = (chains[lane] || Promise.resolve()).then(run);
    chains[lane] = p.then(() => {}, () => {});
    return p;
  }
  const get = (params) => rawGet(params).catch(() => ({ error: 'No connection' }));

  /* ------------------------------------------------------------------ state */
  let net = null;      // the game in progress: { id, tok, me, n, timer, ... }
  let wait = null;     // a game we made that is waiting for someone to join

  function stopAll() {
    if (net) clearTimeout(net.timer);
    if (wait) clearTimeout(wait.timer);
    net = null; wait = null;
  }

  /* ------------------------------------------------------------------- who I am to the other player */
  /** Elo mode of a game: Classic (no clock), Bullet (1 and 3 minute games), Rapid (5 and 10 minute games). */
  const catOf = (mode, base) => (mode !== 'timed' ? 'basic' : base <= 180 ? 'bullet' : 'rapid');
  /** My card sent with create / join / rematch: id, my rating in every mode and a tiny picture. */
  async function myInfo() {
    const P = LP.profile, Gl = LP.global;
    let pfs = '';
    try { pfs = Gl && Gl.thumbSmall && P && P.pfp ? await Gl.thumbSmall(P.pfp()) : ''; } catch (e) { pfs = ''; }
    const elo = {};
    if (P) Object.keys(P.MODES).forEach((m) => { elo[m] = P.elo(m); });
    return { pid: Gl && Gl.pid ? Gl.pid() : '', elo, pfs };
  }
  const avOf = (src, name) => (src ? `<span class="gl-av" style="background-image:url(${src})"></span>` : `<span class="gl-av">${esc((name || '?').charAt(0).toUpperCase())}</span>`);

  /* ------------------------------------------------------------------- menu */
  function profileName(cb) {
    const nm = LP.profile && LP.profile.name();
    if (nm) { cb(nm); return; }
    LP.openSheet(`<h2>What is your name?<span class="sub">Your opponent will see it.</span></h2>
      <input id="on-name" type="text" maxlength="16" placeholder="Player" autocomplete="off" autocapitalize="words">
      <div class="row"><button class="btn" id="on-nx">Cancel</button><button class="btn primary" id="on-nok">Next</button></div>`);
    const inp = $('#on-name');
    const ok = () => { const v = inp.value.trim() || 'Player'; if (LP.profile) LP.profile.setName(v); cb(v); };
    $('#on-nok').onclick = ok;
    $('#on-nx').onclick = LP.closeSheet;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  function mainSheet() {
    if (!url()) {
      LP.openSheet(`<h2>Online is not set up yet<span class="sub">The server address is missing.</span></h2>
        <p class="note">Paste your Supabase Project URL and anon key into supabase-config.js, then upload it again.</p>
        <button class="btn wide" id="on-x">Close</button>`, true);
      $('#on-x').onclick = LP.closeSheet;
      return;
    }
    get({ a: 'ping' });   // wake the server while the person is choosing
    LP.openSheet(`<h2>Online<span class="sub">Play a friend on another device.</span></h2>
      <div class="stack">
        <button class="btn big primary" id="on-new">Create a game</button>
        <button class="btn big" id="on-join">Join with a code</button>
        <button class="btn big" id="on-list">Open games</button>
        <button class="btn" id="on-x">Cancel</button>
      </div>`, true);
    $('#on-new').onclick = () => profileName(() => askKind());
    $('#on-join').onclick = () => profileName(() => joinSheet());
    $('#on-list').onclick = () => profileName(() => listSheet());
    $('#on-x').onclick = LP.closeSheet;
  }

  function askKind() {
    LP.openSheet(`<h2>Create a game<span class="sub">How should the clock work?</span></h2>
      <div class="stack">
        <button class="btn big" id="k-t"><b>Timed</b><small>Pick a time for each side.</small></button>
        <button class="btn big" id="k-u"><b>Unlimited</b><small>No clock. Take as long as you like.</small></button>
        <div class="row"><button class="btn" id="k-b">Back</button><button class="btn" id="k-x">Cancel</button></div>
      </div>`, true);
    $('#k-t').onclick = askTime;
    $('#k-u').onclick = () => askWho({ mode: 'unlimited', base: 0, inc: 0 });
    $('#k-b').onclick = mainSheet;
    $('#k-x').onclick = LP.closeSheet;
  }

  function askTime() {
    LP.openSheet(`<h2>Timed<span class="sub">Time for each side.</span></h2>
      <div class="stack">
        ${TIMES.map((t, i) => `<button class="btn big" data-i="${i}"><b>${t[2]}</b></button>`).join('')}
        <div class="row"><button class="btn" id="t-b">Back</button><button class="btn" id="t-x">Cancel</button></div>
      </div>`, true);
    document.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const t = TIMES[+b.dataset.i]; askWho({ mode: 'timed', base: t[0], inc: t[1] }); }; });
    $('#t-b').onclick = askKind;
    $('#t-x').onclick = LP.closeSheet;
  }

  function askWho(cfg) {
    LP.openSheet(`<h2>Who can join?<span class="sub">${esc(label(cfg.mode, cfg.base, cfg.inc))}</span></h2>
      <div class="stack">
        <button class="btn big" id="w-priv"><b>Private</b><small>Only people you give the code to.</small></button>
        <button class="btn big" id="w-pub"><b>Public</b><small>Shows in Open games for anyone.</small></button>
        <div class="row"><button class="btn" id="w-b">Back</button><button class="btn" id="w-x">Cancel</button></div>
      </div>`, true);
    $('#w-priv').onclick = () => create(Object.assign({ pub: 0 }, cfg));
    $('#w-pub').onclick = () => create(Object.assign({ pub: 1 }, cfg));
    $('#w-b').onclick = () => (cfg.mode === 'timed' ? askTime() : askKind());
    $('#w-x').onclick = LP.closeSheet;
  }

  async function create(cfg) {
    const tok = rnd();
    LP.openSheet('<h2>Creating game…</h2>');
    const r = await post({ a: 'create', mode: cfg.mode, base: cfg.base, inc: cfg.inc, pub: cfg.pub, side: 'r', name: LP.profile.name(), tok, info: await myInfo() }, 2);
    if (!r || !r.id) { failSheet(r && r.error); return; }
    waitSheet(r.id, tok, cfg, false);
  }

  function failSheet(msg, back) {
    LP.openSheet(`<h2>Could not connect</h2><p class="note">${esc(msg || 'Something went wrong.')} Check your connection and the server address, then try again.</p>
      <button class="btn wide" id="f-x">Close</button>`, true);
    $('#f-x').onclick = back || LP.closeSheet;
  }

  /** A game we made (or a rematch we asked for): show the code and wait for the other player. */
  function waitSheet(id, tok, cfg, rematch) {
    stopAll();
    wait = { id, tok };
    LP.openSheet(`<h2>${rematch ? 'Rematch asked' : 'Waiting for a player'}<span class="sub">${rematch ? 'Waiting for your opponent to accept.' : esc(label(cfg.mode, cfg.base, cfg.inc)) + (cfg.pub ? ' · Public' : ' · Private')}</span></h2>
      <div class="on-code" id="on-code">${esc(id)}</div>
      <p class="note">${rematch ? '' : 'Send this code to your friend. They tap Online, then Join with a code.'}</p>
      <div class="row"><button class="btn" id="wt-copy">Copy code</button><button class="btn" id="wt-x">Cancel</button></div>`, false);
    $('#wt-copy').onclick = () => { try { navigator.clipboard.writeText(id); LP.chessOnline.toast('Code copied'); } catch (e) { /* ignore */ } };
    $('#wt-x').onclick = () => { const w = wait; stopAll(); if (w) post({ a: 'cancel', id: w.id, tok: w.tok }, 1); LP.closeSheet(); };
    const loop = async () => {
      if (!wait || wait.id !== id) return;
      const s = await get({ a: 'poll', id, tok, since: 0, wait: 1, u: wait.u || '' });
      if (!wait || wait.id !== id) return;
      if (s && s.status === 'active' && s.you) { stopAll(); begin(id, tok, s); return; }
      if (s && (s.status === 'cancelled' || s.status === 'expired')) { stopAll(); LP.closeSheet(); return; }
      if (s && s.upd) wait.u = s.upd;
      wait.timer = setTimeout(loop, s && s.error ? 1500 : POLL_MS);
    };
    wait.timer = setTimeout(loop, 300);
  }

  function joinSheet(msg) {
    LP.openSheet(`<h2>Join with a code<span class="sub">Ask your friend for their 6 letter code.</span></h2>
      <input id="j-code" type="text" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.2em;text-align:center">
      ${msg ? `<p class="note">${esc(msg)}</p>` : ''}
      <div class="row"><button class="btn" id="j-b">Back</button><button class="btn primary" id="j-ok">Join</button></div>`, true);
    const inp = $('#j-code');
    const go = () => { const c = inp.value.trim().toUpperCase(); if (c.length >= 4) joinGame(c); };
    $('#j-ok').onclick = go;
    $('#j-b').onclick = mainSheet;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  async function joinGame(id, tok) {
    tok = tok || rnd();
    LP.openSheet('<h2>Joining…</h2>');
    const s = await post({ a: 'join', id, tok, name: LP.profile.name(), info: await myInfo() }, 2);
    if (!s || s.error || !s.you) { joinSheet(s && s.error ? s.error : 'Could not join that game.'); return; }
    begin(id, tok, s);
  }

  async function listSheet() {
    LP.openSheet('<h2>Open games<span class="sub">Looking…</span></h2>', true);
    const r = await get({ a: 'list' });
    if (!r || !r.games) { failSheet(r && r.error, mainSheet); return; }
    LP.openSheet(`<h2>Open games<span class="sub">${r.games.length ? 'Tap one to join.' : 'Nobody is waiting right now.'}</span></h2>
      <div class="stack">
        ${r.games.map((g) => `<button class="btn big ol-game" data-id="${esc(g.id)}">${avOf(g.pfs, g.name)}<span class="ol-gt"><b>${esc(g.name)}</b><small>${esc(label(g.mode, g.base, g.inc))}</small></span><span class="ol-elo">${g.elo || 'new'}<small>Elo</small></span></button>`).join('')}
        <div class="row"><button class="btn" id="l-b">Back</button><button class="btn" id="l-r">Refresh</button></div>
      </div>`, true);
    document.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => joinGame(b.dataset.id); });
    $('#l-b').onclick = mainSheet;
    $('#l-r').onclick = listSheet;
  }

  /* -------------------------------------------------------------- the game */
  function begin(id, tok, s) {
    if (net && net.id === id) return;   // this game is already running: never start it a second time
    stopAll();
    net = { id, tok, me: s.you, n: 0, timer: 0, drawShown: false, offered: false, rematchShown: false, over: false, busy: false, overPolls: 0, ud: s.ud || 0, undoAsked: false, undoShown: -1, rxShown: '' };
    const cat = catOf(s.mode, s.base);
    LP.chessOnline.start({ id, me: s.you, names: s.names, base: s.mode === 'timed' ? s.base : 0, inc: s.inc, cat, opp: s.opp ? { elo: (s.opp.elo || {})[cat] || 0, pfs: s.opp.pfs || '' } : null });
    // moves already on the server (a game joined late) are applied straight away
    onState(s, 0);
    schedule();
  }

  function schedule(ms) {
    if (!net) return;
    clearTimeout(net.timer);
    net.timer = setTimeout(pollOnce, ms == null ? POLL_MS : ms);
  }

  async function pollOnce() {
    const my = net;
    if (!my) return;
    if (my.busy) { schedule(500); return; }
    if (my.over && ++my.overPolls > 60) return;   // a finished game is only watched for a rematch for a few minutes
    my.busy = true;
    const since = my.n;
    const s = await get({ a: 'poll', id: my.id, tok: my.tok, since, wait: 1, u: my.u || '' });
    my.busy = false;
    if (net !== my) return;
    if (s && !s.error) { if (s.upd) my.u = s.upd; onState(s, since); }
    else if (LP.chessOnline.presence) LP.chessOnline.presence(-1);    // our own connection is failing
    schedule(s && s.error ? 1500 : POLL_MS);
  }

  function loserOf(me) { return me === 'w' ? '0-1' : '1-0'; }

  function onState(s, since) {
    const co = LP.chessOnline;
    const st = co.state();
    if (!st.active) return;
    // a take-back that was agreed: both screens go back the same number of moves
    if ((s.ud || 0) > net.ud) {
      net.ud = s.ud; net.undoAsked = false;
      while (net.n > s.n && co.undo()) net.n--;
      co.toast('Move taken back');
    }
    // moves from the other player
    if (s.moves && s.moves.length && st.phase === 'play') {
      let got = 0;
      for (let i = 0; i < s.moves.length; i++) {
        if (since + i < net.n) continue;        // we already have it (our own move)
        if (!co.apply(s.moves[i])) { illegal(); return; }
        net.n++; got++;
      }
      if (got && s.mode === 'timed') co.setClocks(s.clocks);
    }
    if (s.result && co.state().phase === 'play') { net.over = true; co.remoteEnd(s.result, s.reason); }
    if (s.status === 'over') net.over = true;
    // take-back requests
    const u = s.undo;
    if (u && u.st === 'ask' && u.by !== net.me && net.undoShown !== u.n && co.state().phase === 'play') {
      net.undoShown = u.n;
      LP.openSheet(`<h2>Take back a move?<span class="sub">Your opponent asks to undo their last move.</span></h2>
        <div class="row"><button class="btn" id="u-no">Decline</button><button class="btn primary" id="u-yes">Accept</button></div>`);
      $('#u-yes').onclick = () => { LP.closeSheet(); post({ a: 'answerundo', id: net.id, tok: net.tok, accept: 1 }); };
      $('#u-no').onclick = () => { LP.closeSheet(); post({ a: 'answerundo', id: net.id, tok: net.tok, accept: 0 }); };
    }
    if (u && u.st === 'no' && net.undoAsked) { net.undoAsked = false; co.toast('Take-back declined'); }
    if ((!u || u.st !== 'ask') && $('#u-yes')) LP.closeSheet();   // the request went away (a move was played): close its sheet
    // the other player's connection, and their reaction after the game
    if (co.presence) co.presence(s.oppAgo || 0);
    if (s.rx && s.rx !== net.rxShown) { net.rxShown = s.rx; co.reacted(s.rx, false); }
    // draw offers
    if (s.draw && s.draw !== net.me && !net.drawShown && co.state().phase === 'play') {
      net.drawShown = true;
      LP.openSheet(`<h2>Draw offered<span class="sub">Your opponent offers a draw.</span></h2>
        <div class="row"><button class="btn" id="d-no">Decline</button><button class="btn primary" id="d-yes">Accept</button></div>`);
      $('#d-yes').onclick = () => { LP.closeSheet(); post({ a: 'answerdraw', id: net.id, tok: net.tok, accept: 1 }); };
      $('#d-no').onclick = () => { LP.closeSheet(); post({ a: 'answerdraw', id: net.id, tok: net.tok, accept: 0 }); };
    }
    if (!s.draw) { if (net.offered) { net.offered = false; if (co.state().phase === 'play') co.toast('Draw declined'); } net.drawShown = false; }
    // rematch asked by the other player: no prompt, both screens count down together (they can decline)
    if (s.rematch && s.status === 'over' && s.rematch !== net.rmId) {
      net.rmId = s.rematch;
      startRematch(net, s.rematch, s.rat, (s.now || Date.now()) - Date.now(), false);
    }
    // the other browser went quiet
    if (co.state().phase === 'play' && s.oppAgo > IDLE_MS && !net.claiming) {
      net.claiming = true;
      post({ a: 'end', id: net.id, tok: net.tok, reason: 'abandon' }, 3).then((r) => {
        net && (net.claiming = false);
        if (r && r.ok) { const me = net && net.me; if (me && co.state().phase === 'play') co.remoteEnd(me === 'w' ? '1-0' : '0-1', 'abandon'); }
      });
    }
  }

  function illegal() {
    const co = LP.chessOnline, me = net.me;
    co.toast('Your opponent sent a move that is not legal.');
    post({ a: 'end', id: net.id, tok: net.tok, reason: 'illegal' }, 2);
    co.remoteEnd(me === 'w' ? '1-0' : '0-1', 'illegal');
  }

  /* ---------------------------------------------- calls made by the game */
  /** Ask for a rematch. The server answers with the new game and the moment it starts. */
  async function rematch() {
    const my = net;
    if (!my || my.rmBusy || my.rmActive) return;
    my.rmBusy = true;
    LP.openSheet('<h2>Rematch…</h2>');
    const t0 = Date.now();
    const r = await post({ a: 'rematch', id: my.id, tok: my.tok, info: await myInfo() }, 2);
    my.rmBusy = false;
    if (net !== my) return;
    if (!r || r.error || !r.id) { LP.closeSheet(); LP.chessOnline.toast((r && r.error) || 'Could not ask for a rematch'); return; }
    my.rmId = r.id;
    startRematch(my, r.id, r.at, r.now - (t0 + Date.now()) / 2, true);
  }
  function startRematch(my, id, at, off, mine) {
    if (!my || my.rmActive) return;
    my.rmActive = true;
    countdown({ id, tok: my.tok, at, off, mine, go: (s) => begin(id, my.tok, s), gone: () => { my.rmActive = false; } });
  }

  /** The rematch countdown, shared with Puzzle Battle. o: { id, tok, at (server time), off (server minus this device), mine, go(state), gone(iDeclined) } */
  function countdown(o) {
    let stop = false, s0 = null, mine = false, busy = false, timer = 0;
    LP.openSheet(`<div class="rm-count"><small>${esc(o.title || 'Rematch')}</small><b id="rm-n">3</b><span id="rm-s">${esc(o.sub || 'Colours swap. Starting together.')}</span></div>
      <button class="btn wide" id="rm-x">${o.mine ? 'Cancel' : 'Decline'}</button>`, false);
    const end = () => { stop = true; clearInterval(timer); };
    const cancelled = () => { end(); LP.closeSheet(); if (!mine) LP.chessOnline.toast('Your opponent declined the ' + (o.what || 'rematch')); if (o.gone) o.gone(mine); };
    $('#rm-x').onclick = () => { mine = true; end(); post({ a: 'decline', id: o.id, tok: o.tok }, 2); LP.closeSheet(); if (o.gone) o.gone(true); };
    (async () => {   // watch the new game: it gives us our state, and tells us at once if the other player declines
      let u = '';
      while (!stop) {
        const s = await get({ a: 'poll', id: o.id, tok: o.tok, since: 0, wait: 1, u, pn: 0 });
        if (stop) return;
        if (s && !s.error) { s0 = s; u = s.upd || u; if (s.status === 'cancelled') { cancelled(); return; } }
        await sleep(s && s.error ? 1000 : 100);
      }
    })();
    timer = setInterval(async () => {
      const left = o.at - (Date.now() + o.off), n = $('#rm-n'), t = $('#rm-s');
      if (stop || !n) return;
      if (left > 0) { n.textContent = Math.ceil(left / 1000); return; }
      n.textContent = '…';
      if (s0 && s0.status === 'active' && s0.you && s0.ack) { end(); o.go(s0); return; }   // both of us have the game open: go
      if (t) t.textContent = 'Waiting for your opponent…';
      if (left < -9000) { end(); post({ a: 'decline', id: o.id, tok: o.tok }, 1); LP.closeSheet(); LP.chessOnline.toast('Your opponent did not join the ' + (o.what || 'rematch')); if (o.gone) o.gone(true); return; }
      if (!busy) { busy = true; const s = await get({ a: 'poll', id: o.id, tok: o.tok, since: 0, pn: 0 }); busy = false; if (s && !s.error && !stop) s0 = s; }
    }, 100);
  }

  LP.onlineNet = {
    sendMove(uci, clocks) {
      if (!net) return;
      const ply = net.n;
      net.n++;
      post({ a: 'move', id: net.id, tok: net.tok, ply, mv: uci, clocks }).then((r) => {
        if (r && r.error && net) LP.chessOnline.toast('Move not saved: ' + r.error);
      });
    },
    report(result, type) {
      if (!net || net.over) return;
      net.over = true;
      const reason = type === 'time' ? 'timeout' : type;
      post({ a: 'end', id: net.id, tok: net.tok, result, reason }, 6);
    },
    askUndo() {
      if (!net) return;
      net.undoAsked = true;
      post({ a: 'askundo', id: net.id, tok: net.tok }).then((r) => { if (r && r.error && net) { net.undoAsked = false; LP.chessOnline.toast(r.error); } else if (net) LP.chessOnline.toast('Take-back requested'); });
    },
    react(code) {
      if (!net) return;
      post({ a: 'react', id: net.id, tok: net.tok, code: String(code) }, 2);
    },
    offerDraw() {
      if (!net) return;
      net.offered = true;
      post({ a: 'offerdraw', id: net.id, tok: net.tok });
      LP.chessOnline.toast('Draw offered');
    },
    rematch,
    begin,
    active() { return !!net && !net.over; },
    leave() { if (net) { clearTimeout(net.timer); net = null; } },
  };

  /** The network helpers are shared with Puzzle Battle and the global leaderboard. */
  LP.onlineApi = { get, post, rawGet, rawPost, client, rnd, url, sleep, countdown, TIMES, label, myInfo, profileName, catOf };

  const card = document.querySelector('.mode[data-mode="online"]');
  if (card) card.addEventListener('click', mainSheet);
})();
