/**
 * Friends: send / accept / decline requests, a friends list with a green online dot, challenge, view profile and message.
 * Everything is stored on the server (SQL file 17). Shown on Home (a short list) and on the Friends page.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const N = () => LP.onlineApi;
  const enabled = () => !!(N() && N().url && N().url());
  const pid = () => (LP.global && LP.global.pid ? LP.global.pid() : '');
  const named = () => !!(LP.profile && LP.profile.name());

  let F = { friends: [], incoming: [], outgoing: [], count: 0, online: 0, unread: 0 }, loaded = false, busy = false, tab = 'friends', prevIn = -1;
  const av = (src, name, on) => `<span class="fr-av">${src ? `<span class="gl-av" style="background-image:url(${src})"></span>` : `<span class="gl-av">${esc((name || '?').charAt(0).toUpperCase())}</span>`}<span class="pl-dot ${on ? 'on' : 'off'} fr-dot" aria-label="${on ? 'Online' : 'Offline'}"></span></span>`;
  const status = (f) => (f.on ? (LP.players && LP.players.statusText ? LP.players.statusText(f.pl) : 'Online') : 'Offline');

  async function load() {
    if (!enabled() || !pid() || !named() || busy) return F;
    busy = true;
    const r = await N().post({ a: 'flist', pid: pid() }, 1);
    busy = false;
    if (r && !r.error && r.friends) {
      F = r; loaded = true;
      if (prevIn >= 0 && r.incoming.length > prevIn && LP.chessOnline && LP.chessOnline.toast) LP.chessOnline.toast('New friend request');
      prevIn = r.incoming.length;
      drawHome(); drawPage(); badge();
    }
    return F;
  }
  const rel = (id) => (F.friends.some((f) => f.id === id) ? 'friends' : F.outgoing.some((f) => f.id === id) ? 'sent' : F.incoming.some((f) => f.id === id) ? 'incoming' : '');
  async function act(a, body) {
    const r = await N().post(Object.assign({ a, pid: pid() }, body), 2);
    await load();
    return r;
  }

  /* ------------------------------------------------------------------ Home section */
  function badge() {
    const n = F.incoming.length + (F.unread || 0);
    $$('.m2-si[data-p="home"]').forEach((b) => b.classList.toggle('has-dot', n > 0));
  }
  function drawHome() {
    const box = $('#m2-fr');
    if (!box) return;
    if (!enabled() || !named()) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const top = F.friends.slice(0, 8);
    box.innerHTML = `<div class="m2-sh"><h3>Friends <b>${F.count} · ${F.online} online</b></h3><button class="m2-link" id="fr-open" type="button">${F.incoming.length ? 'Requests (' + F.incoming.length + ') · ' : ''}Open</button></div>` +
      (top.length ? `<div class="fr-chips">${top.map((f) => `<button class="fr-chip" type="button" data-id="${esc(f.id)}" title="${esc(status(f))}">${av(f.pfp, f.name, f.on)}<span>${esc(f.name)}</span>${f.unread ? `<i class="fr-un">${f.unread}</i>` : ''}</button>`).join('')}</div>`
        : '<p class="m2-empty">No friends yet. Open anyone’s profile (Online Now, a leaderboard, a comment or Game History) and tap Add friend.</p>');
    $('#fr-open').onclick = () => show(F.incoming.length ? 'requests' : 'friends');
    $$('.fr-chip', box).forEach((b) => { b.onclick = () => LP.players && LP.players.open(b.dataset.id); });
  }

  /* ------------------------------------------------------------------ Friends page */
  function build() {
    const app = $('#app');
    if (!app || $('#fr-page')) return;
    const s = document.createElement('section');
    s.id = 'fr-page'; s.className = 'page';
    s.innerHTML = '<header class="game-header"><button id="fr-back" class="text-btn" aria-label="Back">&larr; Back</button><span class="mode-title">Friends</span><span class="header-spacer"></span></header><div class="lb-wrap"><div id="fr-tabs" class="seg dc-tabs"></div><div id="fr-body"></div></div>';
    app.insertBefore(s, $('#sheet-bg'));
    $('#fr-back').onclick = () => LP.showPage('menu');
  }
  function show(t) {
    tab = t || 'friends';
    LP.showPage('fr-page');
    drawPage();
    load();
  }
  function drawPage() {
    const pg = $('#fr-page');
    if (!pg || !pg.classList.contains('active')) return;
    $('#fr-tabs').innerHTML = `<button type="button" class="lb-chip${tab === 'friends' ? ' on' : ''}" data-t="friends">Friends (${F.count})</button><button type="button" class="lb-chip${tab === 'requests' ? ' on' : ''}" data-t="requests">Requests${F.incoming.length ? ' (' + F.incoming.length + ')' : ''}</button>`;
    $$('#fr-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.t; drawPage(); }; });
    const body = $('#fr-body');
    if (!loaded) { body.innerHTML = '<p class="lb-hint">Loading…</p>'; return; }
    if (tab === 'friends') {
      body.innerHTML = `<p class="lb-hint">${F.count} friend${F.count === 1 ? '' : 's'} · ${F.online} online now</p>` + (F.friends.length ? '<ol class="lb-list fr-list">' + F.friends.map((f) => `<li class="lb-row fr-row" data-id="${esc(f.id)}">
        <button class="fr-main" type="button" data-p="${esc(f.id)}">${av(f.pfp, f.name, f.on)}<span class="lb-who"><b>${esc(f.name)}</b><small class="pl-st${f.pl ? ' busy' : ''}">${esc(status(f))}</small></span></button>
        <span class="fr-acts"><button class="btn fr-b" type="button" data-c="${esc(f.id)}" title="${f.on ? 'Challenge this friend' : 'Offline: they will see it when they are back, and you must keep the app open'}">Challenge</button><button class="btn fr-b" type="button" data-m="${esc(f.id)}">Message${f.unread ? ` <i class="fr-un">${f.unread}</i>` : ''}</button><button class="fr-x" type="button" data-x="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">&times;</button></span></li>`).join('') + '</ol>'
        : '<div class="lb-empty"><p>No friends yet. Open a player’s profile and tap Add friend.</p></div>');
    } else {
      const row = (f, btns) => `<li class="lb-row fr-row">${'<button class="fr-main" type="button" data-p="' + esc(f.id) + '">'}${av(f.pfp, f.name, false)}<span class="lb-who"><b>${esc(f.name)}</b><small>Elo ${f.elo || '—'}</small></span></button><span class="fr-acts">${btns}</span></li>`;
      body.innerHTML = '<h3 class="m2-sub">Received</h3>' + (F.incoming.length ? '<ol class="lb-list fr-list">' + F.incoming.map((f) => row(f, `<button class="btn primary fr-b" type="button" data-a="${esc(f.id)}">Accept</button><button class="btn fr-b" type="button" data-d="${esc(f.id)}">Decline</button>`)).join('') + '</ol>' : '<p class="lb-hint">No requests waiting.</p>')
        + '<h3 class="m2-sub">Sent</h3>' + (F.outgoing.length ? '<ol class="lb-list fr-list">' + F.outgoing.map((f) => row(f, `<button class="btn fr-b" type="button" data-x="${esc(f.id)}">Cancel</button>`)).join('') + '</ol>' : '<p class="lb-hint">Nothing sent.</p>');
    }
    $$('[data-p]', body).forEach((b) => { b.onclick = () => LP.players && LP.players.open(b.dataset.p); });
    $$('[data-c]', body).forEach((b) => { b.onclick = () => { const f = F.friends.find((x) => x.id === b.dataset.c); if (f && LP.challenge) LP.challenge.ask(f.id, f.name); }; });
    $$('[data-m]', body).forEach((b) => { b.onclick = () => { const f = F.friends.find((x) => x.id === b.dataset.m); if (f) message(f.id, f.name); }; });
    $$('[data-a]', body).forEach((b) => { b.onclick = () => { b.disabled = true; act('fans', { from: b.dataset.a, ok: 1 }); }; });
    $$('[data-d]', body).forEach((b) => { b.onclick = () => { b.disabled = true; act('fans', { from: b.dataset.d, ok: 0 }); }; });
    $$('[data-x]', body).forEach((b) => {
      b.onclick = () => {
        const f = F.friends.concat(F.outgoing).find((x) => x.id === b.dataset.x);
        if (F.friends.some((x) => x.id === b.dataset.x) && !confirm('Remove ' + (f ? f.name : 'this friend') + ' from your friends?')) return;
        b.disabled = true; act('fdel', { id: b.dataset.x });
      };
    });
  }

  /* ------------------------------------------------------------------ messages */
  function message(id, name) {
    LP.openSheet(`<h2>${esc(name)}<span class="sub">Messages with your friend</span></h2>
      <div class="fr-dm" id="fr-dm" aria-live="polite"><p class="lb-hint">Loading…</p></div>
      <div class="fr-dm-in"><input id="fr-dm-t" class="text-in" type="text" maxlength="300" placeholder="Write a message" autocomplete="off" enterkeyhint="send"><button class="btn primary" id="fr-dm-s" type="button">Send</button></div>
      <p class="fb-err hidden" id="fr-dm-e" role="alert"></p>
      <div class="row"><button class="btn" id="fr-dm-x" type="button">Close</button></div>`, true);
    let last = 0, stop = false, first = true;
    const box = $('#fr-dm');
    const err = (t) => { const e = $('#fr-dm-e'); e.textContent = t || ''; e.classList.toggle('hidden', !t); };
    async function pull() {
      if (stop || !box.isConnected) { stop = true; return; }
      const r = await N().post({ a: 'dmget', pid: pid(), with: id, after: last || '' }, 1);
      if (!box.isConnected) { stop = true; return; }
      if (r && r.msgs) {
        if (first) { box.innerHTML = ''; first = false; }
        if (!r.msgs.length && !box.children.length) box.innerHTML = '<p class="lb-hint">No messages yet. Say hi!</p>';
        if (r.msgs.length) { const hint = $('.lb-hint', box); if (hint) hint.remove(); }
        r.msgs.forEach((m) => {
          const d = document.createElement('div');
          d.className = 'fr-msg' + (m.me ? ' me' : '');
          d.textContent = m.text;
          box.appendChild(d); last = Math.max(last, m.id);
        });
        if (r.msgs.length) box.scrollTop = box.scrollHeight;
      } else if (first && r && r.error) { box.innerHTML = '<p class="lb-hint">' + esc(r.error) + '</p>'; first = false; }
    }
    const send = async () => {
      const t = $('#fr-dm-t').value.trim();
      if (!t) return;
      $('#fr-dm-s').disabled = true;
      const r = await N().post({ a: 'dmsend', pid: pid(), to: id, text: t }, 2);
      $('#fr-dm-s').disabled = false;
      if (!r || !r.ok) { err((r && r.error) || 'Could not send. Check your connection.'); return; }
      err(''); $('#fr-dm-t').value = ''; pull();
    };
    $('#fr-dm-s').onclick = send;
    $('#fr-dm-t').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    $('#fr-dm-x').onclick = () => { stop = true; LP.closeSheet(); load(); };
    pull();
    const t = setInterval(() => { if (stop) { clearInterval(t); load(); } else pull(); }, 4000);
  }

  /* ------------------------------------------------------------------ the Add friend button on a profile */
  function mountBtn(box, id, name, fc) {
    if (!box || !enabled() || id === pid()) { if (box && fc != null) box.innerHTML = `<span class="pf-fc">${fc} friend${fc === 1 ? '' : 's'}</span>`; return; }
    const draw = () => {
      const r = rel(id);
      const label = r === 'friends' ? 'Friends ✓' : r === 'sent' ? 'Request sent' : r === 'incoming' ? 'Accept friend request' : 'Add friend';
      box.innerHTML = `<div class="pf-fr-row">${fc != null ? `<span class="pf-fc">${fc} friend${fc === 1 ? '' : 's'}</span>` : ''}<button class="btn${r === '' || r === 'incoming' ? ' primary' : ''}" type="button" id="pf-fr-b">${label}</button>${r === 'friends' ? '<button class="btn" type="button" id="pf-fr-m">Message</button>' : ''}${r === 'incoming' ? '<button class="btn" type="button" id="pf-fr-d">Decline</button>' : ''}</div><p class="fb-err hidden" id="pf-fr-e" role="alert"></p>`;
      const err = (t) => { const e = $('#pf-fr-e', box); e.textContent = t; e.classList.remove('hidden'); };
      $('#pf-fr-b', box).onclick = async () => {
        if (!named()) { if (N().profileName) N().profileName(() => { load().then(draw); }); return; }
        if (r === 'friends') { if (confirm('Remove ' + name + ' from your friends?')) { await act('fdel', { id }); draw(); } return; }
        if (r === 'sent') { await act('fdel', { id }); draw(); return; }
        $('#pf-fr-b', box).disabled = true;
        const x = r === 'incoming' ? await act('fans', { from: id, ok: 1 }) : await act('fsend', { to: id });
        if (x && x.error) err(x.error);
        draw();
      };
      const m = $('#pf-fr-m', box); if (m) m.onclick = () => message(id, name);
      const d = $('#pf-fr-d', box); if (d) d.onclick = async () => { await act('fans', { from: id, ok: 0 }); draw(); };
    };
    draw();
    load().then(draw);
  }

  build();
  LP.friends = { load, rel, show, message, mountBtn, count: () => F.count, online: () => F.online };
  setTimeout(load, 1800);
  setInterval(() => { if (!document.hidden) load(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
