/**
 * Puzzle Rush (one player) and Puzzle Battle (two players, online).
 *   Rush:   random puzzles that get harder, 3 lives, 1 point per puzzle solved. A wrong move shows the answer, costs a life, and moves on.
 *   Battle: both players get the same puzzles in the same order for 3 minutes. It ends when time runs out, or when one player is out of
 *           lives and the other has a higher score. The server (online-server.gs) keeps the scores and decides the winner.
 * The puzzle screen itself lives in puzzles.js; this file drives it through Puzzle.rushStart / rushLoad / rushStop and the hooks below.
 */
(() => {
  'use strict';
  const LP = window.LP, PG = window.PuzzleGen, Puz = window.Puzzle;
  if (!LP || !PG || !Puz) return;
  const $ = (q) => document.querySelector(q);
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const N = () => LP.onlineApi;
  const LIVES = 3;
  const TYPEKEY = 'localPieces.rushType', BESTKEY = 'localPieces.rushBest', MODEKEY = 'localPieces.rushMode';
  const MODES = { 3: '3 min', 5: '5 min', s: 'Survival' };      // Puzzle Rush modes: two timed, one with no timer
  const BOARD_OF = { 3: 'rush3', 5: 'rush5', s: 'rush' };      // Global Leaderboard board for each mode
  const MATEIN = { easy: [1, 2], normal: [1, 2, 3], hard: [2, 3, 4, 5], insane: [2, 3, 4, 5, 6, 7, 8] };
  const TYPES = ['mate', 'mate', 'check', 'best', 'sac'];

  const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const showType = () => readJ(TYPEKEY, true) !== false;
  const readMode = () => { const m = String(readJ(MODEKEY, '3')); return MODES[m] ? m : '3'; };
  /** Personal bests, one set per mode. (An older save held one set for everything: that was Survival.) */
  const bests = () => { const a = readJ(BESTKEY, {}) || {}; return a.score != null ? { s: { score: a.score, hs: a.hs, streak: a.streak } } : a; };
  const best = (m) => Object.assign({ score: 0, hs: 0, streak: 0 }, bests()[m] || {});

  /* ------------------------------------------------------------ puzzles */
  /** What the k-th puzzle of a run should be: harder the further you get. */
  function plan(k) {
    const L = k < 4 ? ['easy', 0, 4] : k < 9 ? ['normal', 4, 9] : k < 16 ? ['hard', 9, 16] : ['insane', 16, 40];
    const diff = L[0], prog = Math.min(1, (k - L[1]) / (L[2] - L[1]));
    const type = diff === 'insane' ? 'mate' : TYPES[Math.floor(Math.random() * TYPES.length)];
    let n = 0;
    if (type === 'mate') { const l = MATEIN[diff]; n = l[Math.min(l.length - 1, Math.floor((Math.random() * 0.5 + prog * 0.6) * l.length))]; }
    return { type, diff, n };
  }
  /** A puzzle's rating, used for "Highest Solved". */
  function ratingOf(p) {
    const base = { easy: 500, normal: 1000, hard: 1600, insane: 2200 }[p.diff || 'normal'] || 1000;
    const t = p.type === 'mate' ? ((p.n || 1) - 1) * 120 : p.type === 'sac' ? 150 : p.type === 'best' ? 50 : 0;
    return Math.min(3200, base + t);
  }
  function slim(p) { const q = Object.assign({}, p); delete q.explain; q.rt = ratingOf(q); return q; }
  const clone = (p) => JSON.parse(JSON.stringify(p));

  /* ------------------------------------------------------------ state */
  let run = null;       // the Rush or Battle in progress
  let wait = null;      // a battle we made and are waiting for someone to join

  function stopWait() { if (wait) { clearTimeout(wait.timer); wait.stop = true; wait = null; } }
  function stopRun() {
    const r = run; run = null;
    if (r) { r.stop = true; clearInterval(r.ticker); }
    stopWait();
    Puz.rushStop();
    const o = $('#pr-over'); if (o) o.classList.add('hidden');
    const b = $('#pr-bar'); if (b) b.innerHTML = '';
    const f = $('#pr-foot'); if (f) f.innerHTML = '';
  }

  /* ------------------------------------------------------------ the bar above the board */
  const lives = (n) => '<span class="pr-lives" aria-label="' + n + ' lives left">' + Array.from({ length: LIVES }, (_, i) => `<i class="pr-box${i < LIVES - n ? ' x' : ''}"></i>`).join('') + '</span>';
  const av = (src, name) => (src ? `<span class="pr-av" style="background-image:url(${src})"></span>` : `<span class="pr-av">${esc((name || '?')[0].toUpperCase())}</span>`);
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const myName = () => (LP.profile && LP.profile.name && LP.profile.name()) || 'You';

  const typeLabel = (p) => (!p ? '' : p.type === 'mate' ? 'Mate in ' + (p.n || 1) : p.type === 'check' ? 'Checks only' : p.type === 'best' ? 'Best move' : 'Sacrifice');
  function bar() {
    const top = $('#pr-bar'), foot = $('#pr-foot'), r = run;
    if (!top || !foot) return;
    if (!r) { top.innerHTML = ''; foot.innerHTML = ''; return; }
    const key = [r.mode, r.score, r.lives, r.opp && r.opp.s, r.opp && r.opp.l, r.oppName, r.cur && r.cur.rt, r.waiting, r.hideType].join('|');
    if (r.barKey === key) return;
    r.barKey = key;
    const me = `<div class="pr-who">${av(LP.profile && LP.profile.pfp && LP.profile.pfp(), myName())}<b class="pr-score">${r.score}</b></div>`;
    const diff = `<div class="pr-diff"><small>Difficulty:</small><b>${r.cur && !r.waiting ? r.cur.rt : '–'}</b>${r.hideType || !r.cur || r.waiting ? '' : `<span>${esc(typeLabel(r.cur))}</span>`}</div>`;
    if (r.mode === 'solo') {
      top.innerHTML = me + (r.timed ? `<div class="pr-mode"><b id="pr-time">${mmss(r.left)}</b></div>` : '<div class="pr-mode"><span class="pr-surv"><i></i>Survival</span></div>');
      foot.innerHTML = lives(r.lives) + diff;
      return;
    }
    top.innerHTML = me.replace('</div>', `<small class="pr-name">${esc(myName())}</small></div>`) + `<div class="pr-mode"><b id="pr-time">${mmss(r.len)}</b></div>` +
      `<div class="pr-who opp">${av('', r.oppName)}<b class="pr-score">${r.opp.s}</b><small class="pr-name">${esc(r.oppName)}</small></div>`;
    foot.innerHTML = lives(r.lives) + diff + lives(r.opp.l);
  }
  function over(html) { const o = $('#pr-over'); if (!o) return; o.innerHTML = html || ''; o.classList.toggle('hidden', !html); }

  /* ------------------------------------------------------------ serving puzzles */
  function nextPuzzle(r) {
    if (r.mode === 'solo') { const p = r.q.shift(); soloFill(r); return p || null; }
    const p = r.pz[r.i];
    if (p) { r.i++; battleFill(r); }
    return p || null;
  }
  function serve(r) {
    if (run !== r || r.over || r.timeUp || r.out) return;
    const p = nextPuzzle(r);
    if (!p) { r.waiting = true; Puz.rushWait('Setting up a puzzle…'); return; }
    r.waiting = false; r.cur = p; r.curT = Date.now();
    if (!r.started) { r.started = true; r.lastTick = Date.now(); }
    Puz.rushLoad(clone(p));
    bar();
  }

  const hooks = {
    get hideType() { return !!(run && run.hideType); },
    onSolved() {
      const r = run;
      if (!r || r.over || r.timeUp) return;
      r.score++; r.streak++; r.longest = Math.max(r.longest, r.streak);
      if (r.cur) r.hs = Math.max(r.hs, r.cur.rt || 0);
      r.times.push((Date.now() - r.curT) / 1000);
      bar();
      if (r.mode === 'battle') send(r);
      setTimeout(() => serve(r), 450);
    },
    onFail() {
      const r = run;
      if (!r || r.over || r.timeUp) return;
      r.lives = Math.max(0, r.lives - 1); r.streak = 0;
      bar();
      if (r.mode === 'battle') send(r);
    },
    afterFail() {
      const r = run;
      if (!r || r.over || r.timeUp) return;
      if (r.lives > 0) { serve(r); return; }
      if (r.mode === 'solo') finishSolo(r);
      else { r.out = true; over('<small>Out of lives:</small><b>Waiting for the result</b>'); Puz.rushIdle(); }
    },
    back() {
      const r = run;
      if (!r) { LP.showPage('menu'); return; }
      if (r.over) { stopRun(); LP.closeSheet(); LP.showPage('menu'); return; }
      if (r.mode === 'solo') {
        LP.openSheet(`<h2>Quit this run?<span class="sub">Your score of ${r.score} still counts.</span></h2>
          <div class="row"><button class="btn" id="q-no">Keep playing</button><button class="btn primary" id="q-yes">Quit</button></div>`);
        $('#q-no').onclick = LP.closeSheet;
        $('#q-yes').onclick = () => { LP.closeSheet(); finishSolo(r); };
      } else {
        LP.openSheet(`<h2>Leave the battle?<span class="sub">You forfeit and your opponent wins.</span></h2>
          <div class="row"><button class="btn" id="q-no">Keep playing</button><button class="btn primary" id="q-yes">Leave</button></div>`);
        $('#q-no').onclick = LP.closeSheet;
        $('#q-yes').onclick = () => {
          N().post({ a: 'pend', id: r.id, tok: r.tok, reason: 'forfeit' }, 2);
          if (LP.stats && LP.stats.addTime && r.t0) LP.stats.addTime((Date.now() - r.t0) / 1000);
          stopRun(); LP.closeSheet(); LP.showPage('menu');
        };
      }
    },
  };

  /* ------------------------------------------------------------ Puzzle Rush (one player) */
  function soloFill(r) {
    if (run !== r || r.over || r.gen || r.q.length >= 3) return;
    r.gen = true;
    const sp = plan(r.made++);
    PG.make(sp.type, sp.diff, (p) => {
      r.gen = false;
      if (run !== r || r.over) return;
      r.q.push(slim(p));
      if (r.waiting) serve(r);
      soloFill(r);
    }, sp.n);
  }

  function newRun(mode, extra) {
    return Object.assign({ mode, score: 0, lives: LIVES, streak: 0, longest: 0, hs: 0, times: [], cur: null, curT: 0, over: false, waiting: false, gen: false, made: 0, hideType: !showType(), t0: Date.now(), barKey: '' }, extra);
  }

  function beginSolo(mode) {
    mode = MODES[mode] ? String(mode) : readMode();
    stopRun();
    const ms = mode === '3' ? 180000 : mode === '5' ? 300000 : 0;
    const r = run = newRun('solo', { q: [], rmode: mode, timed: !!ms, left: ms, started: false, lastTick: 0, timeUp: false });
    Puz.rushStart(hooks, 'Puzzle Rush');
    syncTitle();
    bar(); over('');
    r.ticker = setInterval(() => tickSolo(r), 200);
    soloFill(r);
    serve(r);
  }

  /** The clock of a timed run only counts down while a puzzle is on the board. */
  function tickSolo(r) {
    if (run !== r || r.over) return;
    const now = Date.now();
    if (r.timed && r.started && !r.waiting && !r.timeUp) r.left -= now - r.lastTick;
    r.lastTick = now;
    const t = $('#pr-time');
    if (t) { t.textContent = mmss(r.left); t.classList.toggle('low', r.left < 30000); }
    if (r.timed && r.started && r.left <= 0 && !r.timeUp) {
      r.timeUp = true;
      Puz.rushIdle();
      over('<small>Time:</small><b>Time is up!</b>');
      setTimeout(() => finishSolo(r), 1300);
    }
  }

  const rank = (n) => (n ? '#' + n : '–');
  function pfpHtml() {
    const src = LP.profile && LP.profile.pfp && LP.profile.pfp();
    return `<span class="re-av"${src ? ` style="background-image:url(${src})"` : ''}>${src ? '' : esc(myName()[0].toUpperCase())}</span>`;
  }

  function finishSolo(r) {
    if (r.over) return;
    r.over = true;
    Puz.rushIdle();
    clearInterval(r.ticker);
    const secs = (Date.now() - r.t0) / 1000;
    if (LP.stats && LP.stats.addTime) LP.stats.addTime(secs);
    const b = best(r.rmode), record = r.score > 0 && r.score > b.score;
    const all = bests(); all[r.rmode] = { score: Math.max(b.score, r.score), hs: Math.max(b.hs, r.hs), streak: Math.max(b.streak, r.longest) };
    writeJ(BESTKEY, all);
    const avg = r.times.length ? (r.times.reduce((a, x) => a + x, 0) / r.times.length).toFixed(1) + 's' : '–';
    LP.openSheet(`<div class="re">
        <div class="re-mode">Puzzle Rush: ${MODES[r.rmode]}</div>
        ${record ? '<div class="re-new">New Record!</div>' : ''}
        ${pfpHtml()}<div class="re-score">${r.score}</div>
        <div class="re-ranks"><div><span>Today:</span><b id="re-t">…</b></div><div><span>This week:</span><b id="re-w">…</b></div><div><span>All time:</span><b id="re-a">…</b></div></div>
        <div class="re-sum"><h3>Summary:</h3>
          <div><span>Longest Streak:</span><b>${r.longest}</b></div>
          <div><span>Highest Solved:</span><b>${r.hs || '–'}</b></div>
          <div><span>Avg Time per Puzzle:</span><b>${avg}</b></div>
          <div><span>Global Rank:</span><b id="re-g">…</b></div>
        </div>
        <button class="btn big primary" id="re-again">Play Again</button>
        <div class="row"><button class="btn" id="re-lb">Global Leaderboard</button><button class="btn" id="re-menu">Menu</button></div>
      </div>`, false);
    $('#re-again').onclick = () => beginSolo(r.rmode);
    $('#re-menu').onclick = () => { stopRun(); LP.closeSheet(); LP.showPage('menu'); };
    $('#re-lb').onclick = () => { stopRun(); LP.closeSheet(); if (LP.global) LP.global.show(BOARD_OF[r.rmode]); else LP.showPage('menu'); };
    const fill = (res) => {
      if (!$('#re-t')) return;
      const k = res && res.ranks;
      $('#re-t').textContent = k ? rank(k.today) : '–'; $('#re-w').textContent = k ? rank(k.week) : '–';
      $('#re-a').textContent = k ? rank(k.all) : '–'; $('#re-g').textContent = k ? rank(k.all) : '–';
    };
    if (r.score > 0 && LP.global) LP.global.submitRush(r.score, r.hs, r.rmode).then(fill, () => fill(null)); else fill(null);
    if (LP.global) LP.global.syncStats();
  }

  /** Start prompt for a single run: pick Survival or a timed mode, and whether to show the puzzle type. */
  function soloSheet() {
    let mode = readMode();
    LP.openSheet(`<h2>Puzzle Rush<span class="sub">Solve as many puzzles as you can. You have ${LIVES} lives.</span></h2>
      <p class="pr-lbl">Mode:</p>
      <div class="pr-modes">${Object.keys(MODES).map((m) => `<button class="pr-m${m === mode ? ' on' : ''}" data-m="${m}"><b>${MODES[m]}</b><small>${m === 's' ? 'No timer' : 'Beat the clock'}</small></button>`).join('')}</div>
      <p class="note pr-rules" id="pr-rules"></p>
      ${typeOpt()}
      <div class="row"><button class="btn" id="pr-x">Cancel</button><button class="btn primary" id="pr-go">Start</button></div>
      <button class="btn wide pr-lbb" id="pr-lbb">Global Leaderboard</button>`, true);
    const info = () => {
      $('#pr-rules').textContent = (mode === 's' ? 'No timer: play until you lose all your lives.' : 'You have ' + (mode === '3' ? '3' : '5') + ' minutes. The run also ends if you lose all your lives.') +
        ' Puzzles are random and get harder as you go. 1 point for each puzzle solved. Your best here: ' + best(mode).score + '.';
    };
    info();
    document.querySelectorAll('.pr-m').forEach((b) => { b.onclick = () => { mode = b.dataset.m; writeJ(MODEKEY, mode); document.querySelectorAll('.pr-m').forEach((x) => x.classList.toggle('on', x === b)); info(); }; });
    wireOpt();
    $('#pr-x').onclick = LP.closeSheet;
    $('#pr-go').onclick = () => beginSolo(mode);
    $('#pr-lbb').onclick = () => { LP.closeSheet(); if (LP.global) LP.global.show(BOARD_OF[mode]); };
  }
  const typeOpt = () => `<label class="pr-opt"><input type="checkbox" id="pr-show"${showType() ? ' checked' : ''}><span><b>Show the puzzle type</b><small>Mate, check, best move or sacrifice. Turn it off for a harder run.</small></span></label>`;
  function wireOpt() { const c = $('#pr-show'); if (c) c.onchange = () => writeJ(TYPEKEY, c.checked); }

  /* ------------------------------------------------------------ Puzzle Battle (online) */
  function ensureName(cb) {
    const nm = LP.profile && LP.profile.name();
    if (nm) { cb(nm); return; }
    LP.openSheet(`<h2>What is your name?<span class="sub">Your opponent will see it.</span></h2>
      <input id="pb-name" type="text" maxlength="16" placeholder="Player" autocomplete="off" autocapitalize="words">
      <div class="row"><button class="btn" id="pb-nx">Cancel</button><button class="btn primary" id="pb-nok">Next</button></div>`);
    const inp = $('#pb-name');
    const ok = () => { const v = inp.value.trim() || 'Player'; if (LP.profile) LP.profile.setName(v); cb(v); };
    $('#pb-nok').onclick = ok; $('#pb-nx').onclick = LP.closeSheet;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  function battleSheet() {
    if (!N() || !N().url()) {
      LP.openSheet(`<h2>Online is not set up yet<span class="sub">The server address is missing.</span></h2>
        <p class="note">Paste your Google Apps Script web app URL into online-config.js, then upload it again.</p><button class="btn wide" id="pb-x">Close</button>`, true);
      $('#pb-x').onclick = LP.closeSheet;
      return;
    }
    LP.openSheet(`<h2>Puzzle Battle<span class="sub">Race a friend on the same puzzles for 3 minutes. The highest score wins.</span></h2>
      ${typeOpt()}
      <div class="stack">
        <button class="btn big primary" id="pb-new">Create a battle</button>
        <button class="btn big" id="pb-join">Join with a code</button>
        <button class="btn big" id="pb-list">Open battles</button>
        <button class="btn" id="pb-x">Cancel</button>
      </div>`, true);
    wireOpt();
    $('#pb-new').onclick = () => ensureName(askWho);
    $('#pb-join').onclick = () => ensureName(() => joinSheet());
    $('#pb-list').onclick = () => ensureName(listSheet);
    $('#pb-x').onclick = LP.closeSheet;
  }

  function askWho() {
    LP.openSheet(`<h2>Who can join?</h2><div class="stack">
        <button class="btn big" id="w-priv"><b>Private</b><small>Only people you give the code to.</small></button>
        <button class="btn big" id="w-pub"><b>Public</b><small>Shows in Open battles for anyone.</small></button>
        <div class="row"><button class="btn" id="w-b">Back</button><button class="btn" id="w-x">Cancel</button></div></div>`, true);
    $('#w-priv').onclick = () => createBattle(0);
    $('#w-pub').onclick = () => createBattle(1);
    $('#w-b').onclick = battleSheet; $('#w-x').onclick = LP.closeSheet;
  }

  function failSheet(msg, back) {
    LP.openSheet(`<h2>Could not connect</h2><p class="note">${esc(msg || 'Something went wrong.')} Check your connection and try again.</p><button class="btn wide" id="f-x">Close</button>`, true);
    $('#f-x').onclick = back || LP.closeSheet;
  }

  async function createBattle(pub) {
    const tok = N().rnd();
    LP.openSheet('<h2>Creating battle…</h2>');
    const r = await N().post({ a: 'create', mode: 'pbattle', pub, side: 'r', name: myName(), tok }, 2);
    if (!r || !r.id) { failSheet(r && r.error); return; }
    waitSheet(r.id, tok, false, pub);
  }

  function waitSheet(id, tok, rematch, pub) {
    stopWait();
    const w = wait = { id, tok, u: '' };
    LP.openSheet(`<h2>${rematch ? 'Rematch asked' : 'Waiting for a player'}<span class="sub">${rematch ? 'Waiting for your opponent to accept.' : 'Puzzle Battle · ' + (pub ? 'Public' : 'Private')}</span></h2>
      <div class="on-code">${esc(id)}</div>
      <p class="note">${rematch ? '' : 'Send this code to your friend. They tap Puzzle Battle, then Join with a code.'}</p>
      <div class="row"><button class="btn" id="wt-copy">Copy code</button><button class="btn" id="wt-x">Cancel</button></div>`, false);
    $('#wt-copy').onclick = () => { try { navigator.clipboard.writeText(id); } catch (e) { /* ignore */ } };
    $('#wt-x').onclick = () => { stopWait(); N().post({ a: 'cancel', id, tok }, 1); LP.closeSheet(); };
    const loop = async () => {
      if (wait !== w) return;
      const s = await N().get({ a: 'poll', id, tok, since: 0, wait: 1, u: w.u, pn: 0 });
      if (wait !== w) return;
      if (s && s.status === 'active' && s.pb) { stopWait(); begin(id, tok, s); return; }
      if (s && (s.status === 'cancelled' || s.status === 'expired')) { stopWait(); LP.closeSheet(); return; }
      if (s && s.upd) w.u = s.upd;
      w.timer = setTimeout(loop, s && s.error ? 1500 : 100);
    };
    w.timer = setTimeout(loop, 300);
  }

  function joinSheet(msg) {
    LP.openSheet(`<h2>Join with a code<span class="sub">Ask your friend for their 6 letter code.</span></h2>
      <input id="j-code" type="text" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.2em;text-align:center">
      ${msg ? `<p class="note">${esc(msg)}</p>` : ''}
      <div class="row"><button class="btn" id="j-b">Back</button><button class="btn primary" id="j-ok">Join</button></div>`, true);
    const inp = $('#j-code');
    const go = () => { const c = inp.value.trim().toUpperCase(); if (c.length >= 4) joinBattle(c); };
    $('#j-ok').onclick = go; $('#j-b').onclick = battleSheet;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  async function joinBattle(id, tok) {
    tok = tok || N().rnd();
    LP.openSheet('<h2>Joining…</h2>');
    const s = await N().post({ a: 'join', id, tok, name: myName() }, 2);
    if (!s || s.error || !s.pb) { joinSheet(s && s.error ? s.error : 'Could not join that battle.'); return; }
    begin(id, tok, s);
  }

  async function listSheet() {
    LP.openSheet('<h2>Open battles<span class="sub">Looking…</span></h2>', true);
    const r = await N().get({ a: 'list', kind: 'pbattle' });
    if (!r || !r.games) { failSheet(r && r.error, battleSheet); return; }
    LP.openSheet(`<h2>Open battles<span class="sub">${r.games.length ? 'Tap one to join.' : 'Nobody is waiting right now.'}</span></h2><div class="stack">
        ${r.games.map((g) => `<button class="btn big" data-id="${esc(g.id)}"><b>${esc(g.name)}</b><small>3 minutes</small></button>`).join('')}
        <div class="row"><button class="btn" id="l-b">Back</button><button class="btn" id="l-r">Refresh</button></div></div>`, true);
    document.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => joinBattle(b.dataset.id); });
    $('#l-b').onclick = battleSheet; $('#l-r').onclick = listSheet;
  }

  /* ---- the battle itself */
  const srv = (r) => Date.now() + r.off;

  function begin(id, tok, s) {
    if (run && run.mode === 'battle' && run.id === id) return;
    stopRun();
    const pb = s.pb;
    const r = run = newRun('battle', {
      id, tok, role: pb.role, pz: [], i: 0, full: false, start: pb.start, len: pb.len || 180000, off: s.now ? s.now - Date.now() : 0, offSet: false,
      opp: { s: 0, l: LIVES, hp: 0 }, oppName: pb.role === 'h' ? pb.guestName : pb.hostName, u: '', started: false, timeUp: false, out: false, overPolls: 0, t0: 0,
    });
    Puz.rushStart(hooks, 'Puzzle Battle');
    syncTitle();
    applyPb(r, s, 0);
    bar();
    r.ticker = setInterval(() => tick(r), 200);
    tick(r);
    battleFill(r);
    pollLoop(r);
  }

  function applyPb(r, s, pn) {
    const pb = s.pb;
    if (!pb) return;
    (pb.pz || []).forEach((p, j) => { if (pn + j === r.pz.length) r.pz.push(p); });
    r.opp = r.role === 'h' ? pb.g : pb.h;
  }

  function tick(r) {
    if (run !== r) return;
    const now = srv(r), left = r.start - now, rem = r.start + r.len - now;
    if (!r.started) {
      if (left > 0) { over(`<small>Get ready:</small><b>${Math.ceil(left / 1000)}</b>`); return; }
      r.started = true; r.t0 = Date.now(); over('');
      serve(r);
    }
    if (r.over) return;
    const t = $('#pr-time');
    if (t) { t.textContent = mmss(rem); t.classList.toggle('low', rem < 30000); }
    if (rem <= 0 && !r.timeUp) timeUp(r);
  }

  async function timeUp(r) {
    r.timeUp = true;
    Puz.rushIdle();
    over('<small>Time:</small><b>Time is up!</b>');
    for (let i = 0; i < 8 && run === r && !r.over; i++) {
      await sleep(i ? 1200 : 1500);
      if (run !== r || r.over) return;
      const res = await N().post({ a: 'pend', id: r.id, tok: r.tok, reason: 'time' }, 1);
      if (res && res.ok) return;      // the poll brings the result
    }
  }

  function send(r) { N().post({ a: 'pscore', id: r.id, tok: r.tok, s: r.score, l: r.lives, hp: r.hs }, 3); }

  /** Whoever needs the next puzzle first makes it and sends it; the other one downloads it, so both always get the same ones. */
  function battleFill(r) {
    if (run !== r || r.over || r.gen || r.full || r.pz.length >= r.i + 3) return;
    const k = r.pz.length;
    r.gen = true;
    const sp = plan(k);
    PG.make(sp.type, sp.diff, async (p) => {
      r.gen = false;
      if (run !== r || r.over) return;
      if (r.pz.length !== k) { battleFill(r); return; }       // the other player's puzzle got there first
      p = slim(p);
      const res = await N().post({ a: 'pput', id: r.id, tok: r.tok, k, data: p }, 2);
      if (run !== r) return;
      if (res && res.ok && r.pz.length === k) r.pz.push(p);
      else if (res && res.full) r.full = true;
      if (r.waiting) serve(r);
      battleFill(r);
    }, sp.n);
  }

  async function pollLoop(r) {
    while (run === r && !r.stop) {
      const pn = r.pz.length;
      const s = await N().get({ a: 'poll', id: r.id, tok: r.tok, since: 0, wait: 1, u: r.u, pn });
      if (run !== r) return;
      if (s && !s.error && s.pb) onPoll(r, s, pn, Date.now());
      if (r.over && ++r.overPolls > 80) return;
      await sleep(s && s.error ? 1500 : 100);
    }
  }

  function onPoll(r, s, pn, t1) {
    if (s.upd) r.u = s.upd;
    if (s.now) { const o = s.now - t1; r.off = r.offSet ? Math.max(r.off, o) : o; r.offSet = true; }
    r.start = s.pb.start || r.start;
    applyPb(r, s, pn);
    bar();
    battleFill(r);
    if (r.waiting) serve(r);
    if (s.status === 'over' && !r.over) { endBattle(r, s); return; }
    if (!r.over && s.oppAgo > 30000 && !r.claiming) {
      r.claiming = true;
      N().post({ a: 'pend', id: r.id, tok: r.tok, reason: 'abandon' }, 2).then(() => { r.claiming = false; });
    }
    if (r.over && s.rematch && !r.myRematch && !r.rematchShown) {
      r.rematchShown = true;
      LP.openSheet(`<h2>Rematch?<span class="sub">Your opponent wants to play again.</span></h2>
        <div class="row"><button class="btn" id="r-no">No thanks</button><button class="btn primary" id="r-yes">Accept</button></div>`);
      $('#r-no').onclick = () => { showResult(r); };
      $('#r-yes').onclick = () => rematch(r);
    }
  }

  function endBattle(r, s) {
    r.over = true; r.overPolls = 0; r.final = s;
    Puz.rushIdle();
    over('');
    if (LP.stats && LP.stats.addTime && r.t0) LP.stats.addTime((Date.now() - r.t0) / 1000);
    showResult(r);
  }

  function showResult(r) {
    const s = r.final;
    if (!s || !s.pb) return;
    const mine = r.role === 'h' ? s.pb.h : s.pb.g, theirs = r.role === 'h' ? s.pb.g : s.pb.h;
    const res = s.result, win = res === 'd' ? 'd' : res === r.role ? 'w' : 'l';
    const why = { lives: win === 'w' ? 'Your opponent ran out of lives.' : win === 'l' ? 'You ran out of lives.' : 'Both players ran out of lives.', time: 'Time ran out.', forfeit: win === 'w' ? 'Your opponent left the battle.' : 'You left the battle.', abandon: win === 'w' ? 'Your opponent disconnected.' : 'You were disconnected.' }[s.reason] || '';
    LP.openSheet(`<div class="re">
        <div class="re-new ${win}">${win === 'w' ? 'You won!' : win === 'l' ? 'You lost' : 'Draw'}</div>
        <div class="pb-vs"><div><small>${esc(myName())}:</small><b>${mine.s}</b><em>Lives:</em>${lives(Math.max(0, mine.l))}</div><div><small>${esc(r.oppName)}:</small><b>${theirs.s}</b><em>Lives:</em>${lives(Math.max(0, theirs.l))}</div></div>
        <p class="note">${esc(why)}</p>
        <button class="btn big primary" id="pb-re">Rematch</button>
        <button class="btn wide" id="pb-menu">Menu</button></div>`, false);
    $('#pb-re').onclick = () => rematch(r);
    $('#pb-menu').onclick = () => { stopRun(); LP.closeSheet(); LP.showPage('menu'); };
  }

  async function rematch(r) {
    r.myRematch = true;
    LP.openSheet('<h2>Rematch…</h2>');
    const nt = N().rnd();
    const res = await N().post({ a: 'rematch', id: r.id, tok: r.tok, newTok: nt }, 2);
    if (!res || res.error || !res.id) { r.myRematch = false; showResult(r); return; }
    stopRun();
    if (res.join) joinBattle(res.id, nt); else waitSheet(res.id, nt, true, 0);
  }

  /* ------------------------------------------------------------ the prompt, shown in the banner at the top */
  let lastSide = 'w';
  function syncTitle() {
    const st = $('#pz-status'), t = $('#pz-title');
    if (!run || !st || !t) return;
    const txt = st.textContent.replace(/\u00a0/g, ' ').trim();
    if (/^black to move/i.test(txt)) lastSide = 'b'; else if (/^white to move/i.test(txt)) lastSide = 'w';
    t.innerHTML = `<i class="pr-turn ${lastSide}"></i><span>${esc(txt || (run.mode === 'battle' ? 'Puzzle Battle' : 'Puzzle Rush'))}</span>`;
  }
  const st0 = $('#pz-status');
  if (st0) new MutationObserver(syncTitle).observe(st0, { childList: true, characterData: true, subtree: true });

  /* ------------------------------------------------------------ menu */
  const c1 = document.querySelector('.mode[data-mode="puzzlerush"]'), c2 = document.querySelector('.mode[data-mode="pbattle"]');
  if (c1) c1.addEventListener('click', soloSheet);
  if (c2) c2.addEventListener('click', battleSheet);
  LP.puzzleRush = { plan, ratingOf, slim };
})();
