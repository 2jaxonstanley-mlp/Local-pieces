/**
 * Online tab (top left of the main menu): "Online now X", the player list (A to Z, Online and Offline drop-downs) and
 * player profiles. Anyone can open anyone's profile from the list or from a leaderboard and see their stats.
 * Needs the online server. Each open page sends a heartbeat every 25 seconds; the server counts who sent one lately.
 * Every online player shows what they are doing (in a match vs a player or a computer, with the game mode) and games that can be watched have a Watch button.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const N = () => LP.onlineApi;
  const enabled = () => !!(N() && N().url && N().url());
  const pid = () => (LP.global && LP.global.pid ? LP.global.pid() : '');
  const BEAT_MS = 25000;

  let count = null;       // people online right now (null until the server has answered)
  const tab = $('#on-tab'), label = $('#on-count');

  function showCount() {
    if (!tab) return;
    tab.classList.toggle('off', count == null);
    label.innerHTML = count == null ? 'Online' : '<span class="on-w">Online Now </span>' + count;
  }
  async function beat() {
    if (!enabled() || document.hidden) return;
    let st = null;
    try { st = LP.liveStatus ? LP.liveStatus() : null; } catch (e) { st = null; }
    const allow = !(LP.prefs && LP.prefs.get('spectate') === false);
    const r = await N().post({ a: 'hb', pid: pid(), st, nospec: allow ? 0 : 1 }, 1, 'hb');
    if (r && typeof r.online === 'number') { count = r.online; showCount(); }
    if (r && LP.challenge) LP.challenge.receive(r.ch || []);
    if (r && LP.profile && LP.profile.syncSocial) LP.profile.syncSocial();
  }

  /** "In a match vs Bob · Bullet 3 min + 1", "Playing vs Insane (computer) · Classic", "Not in a match". */
  const modeText = (pl) => {
    if (pl.mode === 'pbattle') return 'Puzzle Battle';
    if (pl.mode === 'timed') return (pl.base <= 180 ? 'Bullet ' : 'Rapid ') + N().label('timed', pl.base, pl.inc);
    return 'Classic';
  };
  const statusText = (pl) => {
    if (!pl) return 'Not in a match';
    if (pl.k === 'game') return 'In a match vs ' + pl.vs + ' \u00b7 ' + modeText(pl);
    if (pl.k === 'bot') return 'In a match vs ' + pl.vs + ' (computer)' + (pl.label ? ' \u00b7 ' + pl.label : '');
    return pl.txt || 'Online';
  };
  const watchBtn = (p) => (p.pl && p.pl.w ? `<button class="pl-watch" data-w="${esc(p.id)}" aria-label="Watch ${esc(p.name)}" title="Watch this game">Watch</button>` : '');
  const av = (src, name, cls) => (src ? `<span class="gl-av ${cls || ''}" style="background-image:url(${src})"></span>` : `<span class="gl-av ${cls || ''}">${esc((name || '?').charAt(0).toUpperCase())}</span>`);

  /* ------------------------------------------------------------------ player list */
  let open = { on: true, off: false }, data = null, token = 0, timer = 0;

  function drawList() {
    const box = $('#pl-body');
    if (!box || !data) return;
    const on = data.players.filter((p) => p.on), off = data.players.filter((p) => !p.on);
    const me = pid();
    const row = (p) => `<li class="lb-row pl-row" data-id="${esc(p.id)}">${av(p.pfp, p.name)}<span class="lb-who"><b>${esc(p.name)}${p.id === me ? ' (you)' : ''}</b>${p.on ? `<small class="pl-st${p.pl ? ' busy' : ''}">${esc(statusText(p.pl))}</small>` : ''}</span><span class="lb-val"><b>${p.elo || '—'}</b><span>Elo</span></span>${p.id === me ? '' : watchBtn(p) + `<button class="pl-ch" data-ch="${esc(p.id)}" aria-label="Challenge ${esc(p.name)}" title="Challenge">Challenge</button>`}</li>`;
    const section = (key, title, list, dot) => `<section class="pl-sec${open[key] ? ' open' : ''}">
        <button class="pl-head" data-k="${key}" aria-expanded="${open[key]}"><span class="pl-dot ${dot}"></span><b>${title}</b><span class="pl-n">${list.length}</span><i class="pl-chev" aria-hidden="true"></i></button>
        ${open[key] ? (list.length ? '<ol class="lb-list pl-list">' + list.map(row).join('') + '</ol>' : `<p class="lb-hint">Nobody is ${key === 'on' ? 'online' : 'offline'} right now.</p>`) : ''}
      </section>`;
    box.innerHTML = `<p class="lb-hint pl-sum">${on.length} online now &middot; ${data.players.length} players in total. Tap a player to see their stats.</p>` + section('on', 'Online', on, 'on') + section('off', 'Offline', off, 'off');
    box.querySelectorAll('.pl-head').forEach((b) => { b.onclick = () => { open[b.dataset.k] = !open[b.dataset.k]; drawList(); }; });
    box.querySelectorAll('.pl-row').forEach((li) => { li.onclick = () => openProfile(li.dataset.id); });
    box.querySelectorAll('.pl-watch').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const p = data.players.find((x) => x.id === b.dataset.w); if (p && LP.spectate) LP.spectate.watch(p.pl, p.name, 'pl-page'); }; });
    box.querySelectorAll('.pl-ch').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const p = data.players.find((x) => x.id === b.dataset.ch); if (p && LP.challenge) LP.challenge.ask(p.id, p.name); }; });
  }
  async function load() {
    const my = ++token, box = $('#pl-body');
    if (!enabled()) { box.innerHTML = '<div class="lb-empty"><span aria-hidden="true">&#127760;&#xFE0E;</span><p>The player list needs the online server. Set it up in supabase-config.js.</p></div>'; return; }
    if (!data) box.innerHTML = '<p class="lb-hint">Loading…</p>';
    const r = await N().get({ a: 'plist' });
    if (my !== token) return;
    if (!r || r.error || !r.players) { if (!data) box.innerHTML = '<p class="lb-hint">Could not load the player list. Check your connection.</p>'; return; }
    data = r;
    if (typeof r.online === 'number') { count = r.online; showCount(); }
    drawList();
  }
  function show() {
    LP.showPage('pl-page');
    data = null; open = { on: true, off: false };
    load();
    clearInterval(timer);
    timer = setInterval(() => { if ($('#pl-page').classList.contains('active')) load(); else clearInterval(timer); }, 15000);
  }

  /* ------------------------------------------------------------------ profile */
  let from = 'menu';
  async function openProfile(id, first) {
    const cur = document.querySelector('.page.active');
    if (cur && cur.id !== 'pf-page') from = cur.id;
    LP.showPage('pf-page');
    const body = $('#pf-body'), mine = id === pid();
    $('#pf-title').textContent = mine ? 'Your profile' : 'Profile';
    body.innerHTML = '<p class="lb-hint">Loading…</p>';
    let r = null;
    if (enabled()) r = await N().get({ a: 'pprof', id });
    if (!$('#pf-page').classList.contains('active')) return;
    if ((!r || r.error) && !mine) { body.innerHTML = '<div class="lb-empty"><p>Could not load this profile. Check your connection.</p></div>'; return; }
    const P = LP.profile;
    const card = mine && LP.stats ? LP.stats.selfCard() : (r && r.prof ? (r.prof.d ? r.prof : { d: r.prof }) : null), d = card && card.d;
    const name = mine ? (P && P.name()) || 'Player' : r.name, pfp = mine ? (P && P.pfp && P.pfp()) : r.pfp;
    $('#pf-title').textContent = name;
    const status = !mine && r ? `<p class="pf-status ${r.on ? 'on' : ''}"><span class="pl-dot ${r.on ? 'on' : 'off'}"></span>${r.on ? 'Online now' : 'Offline'}${r.on ? ` &middot; <span class="pf-play">${esc(statusText(r.pl))}</span>` : ''}</p>` : '';
    const bio = mine ? (P && P.bio ? P.bio() : '') : (r && r.bio) || '', bg = mine ? (P && P.bg ? P.bg() : '') : (r && r.bg) || '';
    const nocm = mine ? false : !!(r && r.nocm);
    const cover = (bg ? `<div class="pf-cover" style="background-image:url(${bg.replace(/[^A-Za-z0-9+/=:;,.\-_]/g, '')})"></div>` : '') + (bio ? `<p class="pf-bio-t">${esc(bio)}</p>` : '');
    const streak = mine ? (LP.daily ? LP.daily.streak() : 0) : (r && r.streak) || 0;
    const streakChip = streak > 0 ? `<p class="pf-streak"><span aria-hidden="true">\u{1F525}</span> <b>${streak}</b> day streak</p>` : '';
    const frBox = !mine && r && enabled() ? '<div id="pf-fr"></div>' : '';
    const watch = !mine && r && r.on && r.pl && r.pl.w && LP.spectate ? `<button class="btn primary wide pf-watch" id="pf-watch">Watch ${esc(r.name)}'s game</button>` : '';
    const chal = !mine && r && enabled() && LP.challenge ? `<button class="btn primary wide pf-chal" id="pf-ch">Challenge ${esc(name)}</button>` : '';
    if (!d) {
      body.innerHTML = cover + status + streakChip + frBox + watch + chal + `<div class="st-hero">${av(pfp, name, 'st-av')}<span class="st-hero-t"><b>${esc(name)}</b><span>Average Elo <strong class="st-avg">${(r && r.elo) || '—'}</strong></span></span></div><div class="st-empty">This player has not shared their stats yet.</div><h3 class="st-sub">Comments</h3><div id="pf-cm"></div>`;
      if (nocm && $('#pf-cm')) $('#pf-cm').innerHTML = '<p class="lb-hint">This player has turned comments off.</p>';
      if (LP.comments && $('#pf-cm') && !nocm) LP.comments.mount($('#pf-cm'), id, mine);
      if ($('#pf-fr') && LP.friends) LP.friends.mountBtn($('#pf-fr'), id, name, r.fc);
      if ($('#pf-ch')) $('#pf-ch').onclick = () => LP.challenge.ask(id, name);
      if ($('#pf-watch')) $('#pf-watch').onclick = () => LP.spectate.watch(r.pl, name, 'pf-page');
      return;
    }
    body.innerHTML = cover + status + streakChip + frBox + watch + chal + '<div id="pf-nav" class="lb-tabs st-nav" role="tablist"></div><div id="pf-tabs"></div>';
    const extra = LP.comments && !nocm ? { tabs: [['comments', 'Comments']], first: first === 'comments' ? 'comments' : '', mount: (k, b) => LP.comments.mount(b, id, mine) } : null;
    LP.stats.mountProfile($('#pf-nav'), $('#pf-tabs'), card, pfp, name, extra);
    if ($('#pf-fr') && LP.friends) LP.friends.mountBtn($('#pf-fr'), id, name, r.fc);
    if ($('#pf-ch')) $('#pf-ch').onclick = () => LP.challenge.ask(id, name);
    if ($('#pf-watch')) $('#pf-watch').onclick = () => LP.spectate.watch(r.pl, name, 'pf-page');
  }
  function build() {
    const app = $('#app');
    if (!app) return;
    const mk = (id, title, backId, titleId) => {
      const s = document.createElement('section');
      s.id = id; s.className = 'page';
      s.innerHTML = `<header class="game-header"><button id="${backId}" class="text-btn" aria-label="Back">&larr; Back</button><span class="mode-title"${titleId ? ` id="${titleId}"` : ''}>${title}</span><span class="header-spacer"></span></header><div class="lb-wrap">${id === 'pl-page' ? '<div id="pl-body"></div>' : '<div id="pf-body" class="st-body"></div>'}</div>`;
      app.insertBefore(s, $('#sheet-bg'));
    };
    mk('pl-page', 'Players', 'pl-back');
    mk('pf-page', 'Profile', 'pf-back', 'pf-title');
    $('#pl-back').onclick = () => { clearInterval(timer); LP.showPage('menu'); };
    $('#pf-back').onclick = () => { LP.showPage(from === 'pl-page' ? 'pl-page' : from || 'menu'); if (from === 'pl-page') load(); };
  }
  build();
  if (tab) {
    if (!enabled()) tab.classList.add('hidden');
    tab.addEventListener('click', show);
  }
  // the acct chip on the menu opens your settings; your own public profile is one tap from the player list or a leaderboard
  setTimeout(beat, 1200);
  setInterval(beat, BEAT_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
  LP.players = { show, open: openProfile, beat, statusText };
})();
