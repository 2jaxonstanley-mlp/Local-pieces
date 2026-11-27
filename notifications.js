/**
 * Notifications: a bell next to Settings on the main menu with an unread badge, and a page listing what happened.
 * - Kept on this device only (last 50). Other files add one with LP.notify.add({ key, k, text, act }).
 * - Sources: challenges you receive, daily/weekly/endless quests you complete, and new comments on your profile.
 * - Tap one to mark it read and jump to it. "Mark all read" and "Clear all" are at the top of the page.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const KEY = 'localPieces.notifs', SEEN = 'localPieces.pcSeen', MAXN = 50;
  const ICON = { challenge: '&#9876;', quest: '&#127942;', comment: '&#128172;', info: '&#128276;' };
  const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked: the list just will not be kept */ } };
  let list = rd(KEY, []);
  if (!Array.isArray(list)) list = [];

  const unread = () => list.filter((n) => !n.read).length;
  const save = () => { list = list.slice(0, MAXN); wr(KEY, list); badge(); if ($('#nt-page') && $('#nt-page').classList.contains('active')) render(); };
  function badge() {
    const b = $('#nt-badge'), n = unread();
    if (!b) return;
    b.textContent = n > 9 ? '9+' : String(n);
    b.classList.toggle('hidden', !n);
    const btn = $('#nt-btn');
    if (btn) btn.setAttribute('aria-label', n ? 'Notifications, ' + n + ' unread' : 'Notifications');
  }
  /** n: { key (optional, never added twice), k: 'challenge' | 'quest' | 'comment' | 'info', text (plain text), act (optional string the page understands) } */
  function add(n) {
    if (!n || !n.text) return;
    if (n.key && list.some((x) => x.key === n.key)) return;
    list.unshift({ id: Date.now() + '' + Math.floor(Math.random() * 1000), key: n.key || '', k: n.k || 'info', text: String(n.text).slice(0, 160), act: n.act || '', data: n.data || null, done: '', t: Date.now(), read: false });
    save();
  }

  /* ------------------------------------------------------------------ what a tap does */
  function act(n) {
    if (n.act === 'challenge' && LP.challenge && LP.challenge.open) LP.challenge.open();
    else if (n.act === 'comments' && LP.players) { const p = LP.global && LP.global.pid ? LP.global.pid() : ''; if (p) LP.players.open(p, 'comments'); }
    else if (n.act === 'shop') { const b = document.querySelector('.mode[data-mode="shop"]'); if (b) b.click(); }
  }
  const ago = (t) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    const d = Math.round(h / 24); return d < 30 ? d + ' d ago' : new Date(t).toLocaleDateString();
  };

  /* ------------------------------------------------------------------ the page */
  /** Challenge notifications carry their own buttons: Accept, Decline, Challenge back. */
  function actions(x) {
    if (x.k !== 'challenge' || !x.data) return '';
    if (x.done) return `<div class="nt-acts"><small class="nt-done">${esc(x.done)}</small><button class="btn" type="button" data-cb="${esc(x.id)}">Challenge back</button></div>`;
    return `<div class="nt-acts"><button class="btn primary" type="button" data-ac="${esc(x.id)}">Accept</button><button class="btn" type="button" data-de="${esc(x.id)}">Decline</button><button class="btn" type="button" data-cb="${esc(x.id)}">Challenge back</button></div>`;
  }
  function render() {
    const box = $('#nt-body');
    if (!box) return;
    const n = unread();
    box.innerHTML = `<div class="nt-bar"><button class="btn" id="nt-read" type="button"${n ? '' : ' disabled'}>Mark all read</button><button class="btn" id="nt-clear" type="button"${list.length ? '' : ' disabled'}>Clear all</button></div>`
      + (list.length ? `<ul class="nt-list">${list.map((x) => `<li class="nt-item"><button class="nt-row${x.read ? '' : ' new'}" type="button" data-n="${esc(x.id)}"><span class="nt-ic" aria-hidden="true">${ICON[x.k] || ICON.info}</span><span class="nt-tx"><b>${esc(x.text)}</b><small>${ago(x.t)}</small></span>${x.read ? '' : '<span class="nt-dot" aria-label="Unread"></span>'}</button>${actions(x)}</li>`).join('')}</ul>`
        : '<div class="lb-empty"><p>Nothing yet. Challenges, quest rewards and comments on your profile show up here.</p></div>');
    $('#nt-read').onclick = () => { list.forEach((x) => { x.read = true; }); save(); };
    $('#nt-clear').onclick = () => { list = []; save(); };
    const find = (id) => list.find((y) => y.id === id);
    box.querySelectorAll('[data-ac]').forEach((b) => { b.onclick = () => { const x = find(b.dataset.ac); if (!x) return; x.read = true; x.done = LP.challenge.respond(x.data.cid, 'accept') ? 'Accepting\u2026' : 'Expired'; save(); }; });
    box.querySelectorAll('[data-de]').forEach((b) => { b.onclick = () => { const x = find(b.dataset.de); if (!x) return; x.read = true; x.done = LP.challenge.respond(x.data.cid, 'decline') ? 'Declined' : 'Expired'; save(); }; });
    box.querySelectorAll('[data-cb]').forEach((b) => { b.onclick = () => { const x = find(b.dataset.cb); if (!x) return; x.read = true; save(); LP.challenge.ask(x.data.from, x.data.name); }; });
    box.querySelectorAll('[data-n]').forEach((b) => {
      b.onclick = () => { const x = list.find((y) => y.id === b.dataset.n); if (!x) return; x.read = true; save(); act(x); };
    });
  }
  function open() {
    render();
    LP.showPage('nt-page');
    // opening the page counts as seeing the list: the badge clears when you leave it
  }
  function build() {
    const app = $('#app'), menuTop = $('.menu-top'), settings = $('#settings-btn');
    if (!app || !menuTop) return;
    const s = document.createElement('section');
    s.id = 'nt-page'; s.className = 'page';
    s.innerHTML = '<header class="game-header"><button id="nt-back" class="text-btn" aria-label="Back">&larr; Back</button><span class="mode-title">Notifications</span><span class="header-spacer"></span></header><div class="lb-wrap"><div id="nt-body"></div></div>';
    app.insertBefore(s, $('#sheet-bg'));
    $('#nt-back').onclick = () => LP.showPage('menu');
    const b = document.createElement('button');
    b.id = 'nt-btn'; b.className = 'icon-btn nt-btn'; b.title = 'Notifications'; b.setAttribute('aria-label', 'Notifications');
    b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span id="nt-badge" class="nt-badge hidden"></span>';
    settings ? settings.after(b) : menuTop.prepend(b);
    b.onclick = open;
    badge();
  }

  /* ------------------------------------------------------------------ comments on your profile */
  const pid = () => (LP.global && LP.global.pid ? LP.global.pid() : '');
  let checking = false;
  async function checkComments() {
    const N = LP.onlineApi, me = pid();
    if (checking || !me || !N || !N.url || !N.url() || document.hidden) return;
    checking = true;
    try {
      const r = await N.get({ a: 'pclist', id: me });
      if (!r || r.error || !Array.isArray(r.comments)) return;
      const seen = rd(SEEN, null), top = r.comments.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
      if (seen == null) { wr(SEEN, top); return; }                 // the first look only sets the starting point
      const fresh = r.comments.filter((c) => Number(c.id) > seen && c.from !== me).reverse();
      fresh.forEach((c) => add({ key: 'pc' + c.id, k: 'comment', text: c.name + ' commented on your profile: ' + c.text, act: 'comments' }));
      if (top > seen) wr(SEEN, top);
    } finally { checking = false; }
  }
  const menu = $('#menu');
  build();
  if (menu) {
    let was = menu.classList.contains('active');
    new MutationObserver(() => { const now = menu.classList.contains('active'); if (now && !was) { badge(); checkComments(); } was = now; }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  }
  setTimeout(checkComments, 4000);
  setInterval(checkComments, 120000);

  LP.notify = { add, open, unread, check: checkComments };
})();
