/**
 * Community puzzles: positions made by players in the position editor and shared through the online server.
 * Tap the + card to build one (Move tool, Test, Publish). A puzzle can only be published after its author solved it against the
 * Insane computer, and any change to the position or category makes them solve it again. Everyone online sees the list, can filter by
 * category, sort by likes or plays, like a puzzle and play it (against the Insane computer, like Popular puzzles).
 * To add a category: one line in CATS here and one in CM_CATS in online-server.gs.
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
  const DONE = 'localPieces.communityDone';
  const PREF = 'localPieces.communityView';

  const CATS = [1, 2, 3, 4, 5].map((n) => ({ id: 'mate' + n, label: 'Mate in ' + n, n }))
    .concat([['fork', 'Fork'], ['pin', 'Pin'], ['skewer', 'Skewer'], ['hanging', 'Hanging piece'], ['trapped', 'Trapped piece'], ['backrank', 'Back-rank mate'], ['scholar', "Scholar's mate"], ['underpromo', 'Under-promotion'], ['endgame', 'Endgame'], ['sacrifice', 'Sacrifice'], ['other', 'Other (win)']].map(([id, label]) => ({ id, label, n: 0 })));
  const catOf = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

  const done = () => { try { return JSON.parse(localStorage.getItem(DONE)) || {}; } catch (e) { return {}; } };
  const markDone = (id) => { const d = done(); d[String(id).replace(/^c-/, '')] = 1; try { localStorage.setItem(DONE, JSON.stringify(d)); } catch (e) { /* ignore */ } };
  let view = { cat: '', sort: 'new' };
  try { view = Object.assign(view, JSON.parse(localStorage.getItem(PREF)) || {}); } catch (e) { /* ignore */ }
  let list = [], token = 0;

  function build() {
    const app = $('#app');
    if (!app || $('#community')) return;
    const s = document.createElement('section');
    s.id = 'community'; s.className = 'page';
    s.innerHTML = `<header class="game-header"><button id="cm-back" class="text-btn" aria-label="Back to menu">&larr; Menu</button><span class="mode-title">Community puzzles</span><span class="header-spacer"></span></header>
      <div class="pp-wrap">
        <p class="pp-lead">Puzzles made by players. You play the side to move against the Insane computer.</p>
        <div class="cm-bar"><select id="cm-cat" class="text-in" aria-label="Category"></select><select id="cm-sort" class="text-in" aria-label="Sort"><option value="new">Newest</option><option value="likes">Most liked</option><option value="plays">Most played</option></select></div>
        <div id="cm-list" class="pp-list"></div>
      </div>`;
    app.insertBefore(s, $('#sheet-bg'));
    $('#cm-cat').innerHTML = '<option value="">All categories</option>' + CATS.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    $('#cm-cat').value = view.cat; $('#cm-sort').value = view.sort;
    $('#cm-cat').onchange = (e) => { view.cat = e.target.value; keep(); load(); };
    $('#cm-sort').onchange = (e) => { view.sort = e.target.value; keep(); load(); };
    $('#cm-back').onclick = () => LP.showPage('menu');
  }
  const keep = () => { try { localStorage.setItem(PREF, JSON.stringify(view)); } catch (e) { /* ignore */ } };

  function draw(msg) {
    const box = $('#cm-list');
    if (!box) return;
    const d = done(), mini = LP.popular && LP.popular.mini ? LP.popular.mini : () => '';
    const plus = `<button class="pp-b cm-new" id="cm-new"><span class="cm-plus" aria-hidden="true">+</span><span class="pp-t"><b class="pp-n">Create a puzzle</b><span class="pp-lead cm-sub">Set up a position, test it against the Insane computer, then publish it for everyone.</span></span></button>`;
    const cards = list.map((p) => {
      const white = p.fen.split(' ')[1] !== 'b', c = catOf(p.cat);
      return `<div class="pp-b cm-card" role="button" tabindex="0" data-id="${esc(p.id)}">
        <span class="pp-mb mb">${mini(p.fen)}</span>
        <span class="pp-t"><b class="pp-n">${esc(p.title)}</b>
          <span class="pp-tags"><em class="pp-goal">${esc(c.label)}</em><em class="pp-side ${white ? 'w' : 'b'}">${white ? 'White' : 'Black'} to start</em></span>
          <span class="cm-by">by ${esc(p.author)}${p.mine ? ' (you)' : ''}</span>
          <span class="cm-stats">${d[p.id] ? '<span class="pp-done">Solved &#10003;</span>' : ''}<button class="cm-like${p.liked ? ' on' : ''}" data-like="${esc(p.id)}" aria-label="Like" aria-pressed="${p.liked ? 'true' : 'false'}">&#9829; <b>${p.likes}</b></button><span class="cm-plays" title="Times played">&#9654; ${p.plays}</span>${p.mine ? `<button class="cm-del" data-del="${esc(p.id)}" aria-label="Delete your puzzle">Delete</button>` : ''}</span>
        </span></div>`;
    }).join('');
    box.innerHTML = plus + (msg ? `<p class="lb-hint">${esc(msg)}</p>` : '') + cards;
    $('#cm-new').onclick = create;
    box.querySelectorAll('.cm-card').forEach((el) => {
      const go = () => play(list.find((p) => p.id === el.dataset.id));
      el.onclick = go;
      el.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
    box.querySelectorAll('[data-like]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); like(b.dataset.like); }; });
    box.querySelectorAll('[data-del]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); confirmDelete(b.dataset.del); }; });
  }
  async function load() {
    const my = ++token;
    if (!enabled()) { draw('The community needs the online server. Set it up in supabase-config.js.'); return; }
    if (!list.length) draw('Loading…');
    const r = await N().get({ a: 'cmlist', pid: pid(), cat: view.cat, sort: view.sort });
    if (my !== token) return;
    if (!r || r.error || !r.puzzles) { draw('Could not load the puzzles. Check your connection.'); return; }
    list = r.puzzles;
    draw(list.length ? '' : (view.cat ? 'No puzzles in this category yet.' : 'No puzzles yet. Be the first: tap the + card.'));
  }
  function open() {
    build();
    list = [];
    LP.showPage('community');
    draw(enabled() ? 'Loading…' : '');
    load();
  }
  function create() {
    if (!enabled()) { LP.openSheet('<h2>Online is not set up yet</h2><p class="note">The Supabase settings are missing in supabase-config.js.</p><button class="btn wide" id="cm-x">Close</button>', true); $('#cm-x').onclick = LP.closeSheet; return; }
    if (LP.editor) LP.editor.show({ create: true });
  }
  function play(p) {
    if (!p) return;
    const c = catOf(p.cat);
    N().post({ a: 'cmplay', pid: pid(), id: p.id }, 1);
    LP.playPopular({ id: 'c-' + p.id, name: p.title, goal: c.n ? 'Mate in ' + c.n : 'Win', fen: p.fen, n: c.n, src: 'community' });
  }
  async function like(id) {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    p.liked = p.liked ? 0 : 1; p.likes += p.liked ? 1 : -1;      // show it at once, the server confirms
    draw();
    const r = await N().post({ a: 'cmlike', pid: pid(), id }, 2);
    if (r && !r.error) { p.likes = r.likes; p.liked = r.liked; draw(); }
  }
  function confirmDelete(id) {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    LP.openSheet(`<h2>Delete this puzzle?<span class="sub">${esc(p.title)}</span></h2><p class="note">It disappears for everyone, along with its likes.</p>
      <div class="row"><button class="btn" id="cm-dn">Keep</button><button class="btn primary" id="cm-dy">Delete</button></div>`, true);
    $('#cm-dn').onclick = LP.closeSheet;
    $('#cm-dy').onclick = async () => {
      LP.closeSheet();
      list = list.filter((x) => x.id !== id); draw();
      await N().post({ a: 'cmdel', pid: pid(), id }, 2);
      load();
    };
  }
  /** The editor published one: show the list, newest first. */
  function published() {
    view.cat = ''; view.sort = 'new'; keep();
    build();
    $('#cm-cat').value = ''; $('#cm-sort').value = 'new';
    open();
    if (LP.chessOnline && LP.chessOnline.toast) LP.chessOnline.toast('Published! Everyone can play it now.');
  }

  // two entry points: Play online and Puzzles
  document.querySelectorAll('.mode[data-mode="community"]').forEach((card) => card.addEventListener('click', () => (LP.saves ? LP.saves.guard(open) : open())));
  /** A small "N new" badge: puzzles by other players from the last 7 days. Looked up when Play online or Puzzles is opened, at most every 30 minutes. */
  let badgeAt = 0;
  async function badge() {
    if (!enabled() || Date.now() - badgeAt < 1800000) return;
    badgeAt = Date.now();
    const r = await N().get({ a: 'cmlist', pid: pid(), cat: '', sort: 'new' });
    if (!r || r.error || !r.puzzles) { badgeAt = 0; return; }
    const week = Date.now() - 7 * 86400000, n = r.puzzles.filter((p) => !p.mine && p.created > week).length;
    document.querySelectorAll('.mode[data-mode="community"] .mode-name').forEach((el) => {
      let b = el.querySelector('.mode-new');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('em'); b.className = 'mode-new'; el.appendChild(b); }
      b.textContent = n > 99 ? '99+ new' : n + ' new';
    });
  }
  document.querySelectorAll('.mgrp[data-g="global"] .mgrp-h, .mgrp[data-g="puzzles"] .mgrp-h').forEach((h) => h.addEventListener('click', () => { setTimeout(badge, 0); }));
  const markDoneQ = (id) => { const first = !done()[String(id).replace(/^c-/, '')]; markDone(id); if (!first) return; try { if (window.LP.rewards) window.LP.rewards.event('community'); } catch (e) { /* ignore */ } };
  LP.community = { open, cats: CATS, done: markDoneQ, published, show: open };
})();
