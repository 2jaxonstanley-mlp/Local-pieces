/**
 * Chat: Global Chat (its own page) and In-Game Chat (a "Chat" tab beside Moves in online games and when spectating them).
 * - Messages last 5 minutes (the server hides and deletes older ones). The newest 50 are shown. One message every ~3.5 seconds.
 * - Piece stickers: 12 (6 pieces x 2 colours) sent as :wk: ... :bp: and drawn with the current board colours. Quick messages in games.
 * - The room refreshes every 6 seconds while it is open (no Realtime needed).
 *   LP.chat.mount(host, room, opts) -> { stop, refresh, seen, unread }
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const N = () => LP.onlineApi;
  const enabled = () => !!(N() && N().url && N().url());
  const pid = () => (LP.global && LP.global.pid ? LP.global.pid() : '');
  const EVERY = 6000, LIFE = 300000, COOL = 3500, MAXLEN = 200;
  const STK = ['wk', 'wq', 'wr', 'wb', 'wn', 'wp', 'bk', 'bq', 'br', 'bb', 'bn', 'bp'];
  const GLY = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const QUICK = ['Good luck', 'Good game', 'ggs', 'Dang nice move', 'Oops', 'Please undo', 'Finger slipped', 'Thinking…', 'Move!', 'Rematch?', 'Thanks'];

  const sticker = (c) => `<span class="cs-st"><span class="piece ${c[0]}">${GLY[c[1]]}︎</span></span>`;
  /** Escape the text, then turn :wk: style tokens into stickers. A message of only stickers is drawn bigger. */
  function fmt(text) {
    const only = /^(\s*:[wb][kqrbnp]:\s*)+$/.test(text);
    const h = esc(text).replace(/:([wb][kqrbnp]):/g, (m, c) => sticker(c));
    return only ? `<span class="cs-big">${h}</span>` : h;
  }
  const av = (src, name) => (src ? `<span class="gl-av" style="background-image:url(${src})"></span>` : `<span class="gl-av">${esc((name || '?').charAt(0).toUpperCase())}</span>`);
  const ago = (s) => (s < 45 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h');

  function mount(host, room, o) {
    o = o || {};
    if (!enabled()) { host.innerHTML = '<div class="lb-empty"><p>Chat needs the online server.</p></div>'; return { stop() {}, refresh() {}, seen() {}, unread: () => 0 }; }
    let msgs = [], people = {}, after = 0, off = 0, dead = false, busy = false, cool = 0, coolT = 0, seenId = null, first = true;
    host.innerHTML = `<div class="cs-wrap"><ul class="cs-list" id="cs-list" aria-live="polite"></ul><p class="cs-empty" id="cs-empty">Loading…</p>
      ${o.quick ? `<div class="cs-quick">${QUICK.map((q) => `<button type="button" class="cs-q" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
      <div class="cs-stk hidden" id="cs-stk">${STK.map((c) => `<button type="button" class="cs-sb" data-s="${c}" aria-label="Sticker ${c}">${sticker(c)}</button>`).join('')}</div>
      <form class="cs-bar" id="cs-form" autocomplete="off"><button type="button" class="btn cs-sbtn" id="cs-sbtn" aria-label="Piece stickers">&#9822;&#xFE0E;</button>
        <input id="cs-in" maxlength="${MAXLEN}" placeholder="Message…" aria-label="Message" enterkeyhint="send"><button class="btn primary" id="cs-send" type="submit">Send</button></form>
      <p class="fb-err hidden" id="cs-err" role="alert"></p></div>`;
    const list = $('#cs-list', host), inp = $('#cs-in', host), sendBtn = $('#cs-send', host);
    const err = (t) => { const e = $('#cs-err', host); if (e) { e.textContent = t || ''; e.classList.toggle('hidden', !t); } };
    const me = () => pid();
    const unread = () => (seenId == null ? 0 : msgs.filter((m) => m.id > seenId && m.pid !== me()).length);
    const notify = () => { if (o.onUnread) o.onUnread(unread()); };

    function draw(stick) {
      const nowS = Date.now() + off;
      msgs = msgs.filter((m) => nowS - m.t < LIFE).slice(-50);
      list.innerHTML = msgs.map((m) => {
        const who = people[m.pid] || { name: 'Player', pfp: '' }, mine = m.pid === me();
        return `<li class="cs-m${mine ? ' me' : ''}">${o.profile && !mine ? `<button class="cs-who" type="button" data-p="${esc(m.pid)}" aria-label="Open ${esc(who.name)}'s profile">${av(who.pfp, who.name)}</button>` : ''}<div class="cs-b"><div class="cs-h"><b>${esc(mine ? 'You' : who.name)}</b><small>${ago(Math.max(0, (nowS - m.t) / 1000))}</small></div><p>${fmt(m.text)}</p></div></li>`;
      }).join('');
      $('#cs-empty', host).textContent = msgs.length ? '' : 'No messages yet. Say hi!';
      list.querySelectorAll('.cs-who').forEach((b) => { b.onclick = () => { if (LP.players && LP.players.open) LP.players.open(b.dataset.p); }; });
      if (stick) list.scrollTop = list.scrollHeight;
    }
    async function refresh(stick) {
      if (dead || busy || !host.isConnected) return;
      busy = true;
      const r = await N().get({ a: 'msgs', room, after: after || '' });
      busy = false;
      if (dead) return;
      if (!r || r.error || !Array.isArray(r.msgs)) { if (first) $('#cs-empty', host).textContent = 'Could not load messages. Check your connection.'; return; }
      off = (r.now || Date.now()) - Date.now();
      Object.assign(people, r.people || {});
      const near = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
      r.msgs.forEach((m) => { if (!msgs.some((x) => x.id === m.id)) msgs.push(m); after = Math.max(after, m.id); });
      if (seenId == null) seenId = o.startSeen ? 0 : after;     // the first load is not "new": only what arrives later counts as unread
      draw(first || stick || near);
      first = false;
      notify();
    }
    function cooldown() {
      cool = Date.now() + COOL;
      clearInterval(coolT);
      const tick = () => {
        const left = Math.ceil((cool - Date.now()) / 1000);
        if (left <= 0 || !host.isConnected) { clearInterval(coolT); sendBtn.disabled = false; sendBtn.textContent = 'Send'; return; }
        sendBtn.disabled = true; sendBtn.textContent = left + 's';
      };
      tick(); coolT = setInterval(tick, 400);
    }
    function send(text) {
      text = String(text || '').trim();
      if (!text) return;
      if (Date.now() < cool) { err('Slow down a little'); return; }
      const go = async () => {
        err('');
        cooldown();
        const r = await N().post({ a: 'msend', pid: me(), room, text }, 2);
        if (!r || r.error || !r.ok) {
          clearInterval(coolT); sendBtn.disabled = false; sendBtn.textContent = 'Send'; cool = 0;
          err((r && r.error && r.error !== 'No connection') ? r.error : 'Could not send. Check your connection.');
          return;
        }
        inp.value = '';
        $('#cs-stk', host).classList.add('hidden');
        refresh(true);
      };
      if (N().profileName) N().profileName(go); else go();   // asks for an online name the first time
    }
    $('#cs-form', host).onsubmit = (e) => { e.preventDefault(); send(inp.value); };
    $('#cs-sbtn', host).onclick = () => $('#cs-stk', host).classList.toggle('hidden');
    host.querySelectorAll('.cs-sb').forEach((b) => { b.onclick = () => send(':' + b.dataset.s + ':'); });
    host.querySelectorAll('.cs-q').forEach((b) => { b.onclick = () => send(b.dataset.q); });
    inp.oninput = () => err('');

    refresh(true);
    const iv = setInterval(() => { if (dead || !host.isConnected) { clearInterval(iv); return; } if (!document.hidden) refresh(); }, EVERY);
    return {
      stop() { dead = true; clearInterval(iv); clearInterval(coolT); },
      refresh: () => refresh(true),
      seen() { seenId = after; notify(); },
      unread,
    };
  }

  /* ------------------------------------------------------------------ Global Chat page */
  let gc = null;
  function buildGlobal() {
    const app = $('#app'); if (!app || $('#gc-page')) return;
    const s = document.createElement('section');
    s.id = 'gc-page'; s.className = 'page';
    s.innerHTML = '<header class="game-header"><button id="gc-back" class="text-btn" aria-label="Back to menu">&larr; Menu</button><span class="mode-title">Global Chat</span><span class="header-spacer"></span></header><div class="lb-wrap"><p class="lb-hint">Chat with everyone online. Messages disappear after 5 minutes. Be kind.</p><div id="gc-host" class="gc-host"></div></div>';
    app.insertBefore(s, $('#sheet-bg'));
    if (LP.discussionTabs) LP.discussionTabs(s, 'chat');
    $('#gc-back').onclick = () => LP.showPage('menu');
    new MutationObserver(() => { if (!s.classList.contains('active') && gc) { gc.stop(); gc = null; } }).observe(s, { attributes: true, attributeFilter: ['class'] });
  }
  function openGlobal() {
    buildGlobal();
    if (gc) gc.stop();
    LP.showPage('gc-page');
    gc = mount($('#gc-host'), 'global', { profile: true });
  }
  document.querySelectorAll('.mode[data-mode="gchat"]').forEach((c) => c.addEventListener('click', openGlobal));

  /* ------------------------------------------------------------------ In-Game Chat: a Chat tab next to Moves */
  const game = $('#game'), side = $('#game .side'), scroll = $('#moves-scroll');
  let cur = null, tab = 'moves';
  if (game && side && scroll) {
    const tabs = document.createElement('div');
    tabs.id = 'gm-tabs'; tabs.className = 'gm-tabs hidden';
    tabs.innerHTML = '<button type="button" data-t="moves" class="on">Moves</button><button type="button" data-t="chat">Chat<i class="cs-dot hidden" id="gm-dot"></i></button>';
    side.insertBefore(tabs, side.firstChild);
    const pane = document.createElement('div');
    pane.id = 'gm-chat'; pane.className = 'gm-chat hidden';
    side.appendChild(pane);
    const show = (t) => {
      tab = t;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      pane.classList.toggle('hidden', t !== 'chat');
      scroll.classList.toggle('gm-off', t === 'chat');
      const h3 = side.querySelector('h3'); if (h3) h3.classList.toggle('gm-off', t === 'chat');
      if (t === 'chat' && cur) { cur.m.seen(); const i = pane.querySelector('#cs-list'); if (i) i.scrollTop = i.scrollHeight; }
    };
    tabs.querySelectorAll('button').forEach((b) => { b.onclick = () => show(b.dataset.t); });
    const leave = () => { if (cur) { cur.m.stop(); cur = null; } pane.innerHTML = ''; tabs.classList.add('hidden'); show('moves'); };
    const roomNow = () => {
      if (!game.classList.contains('active')) return '';
      const c = LP.gameCtx ? LP.gameCtx() : {};
      if (c.online && c.onlineId) return 'g:' + c.onlineId;
      const sp = LP.spectate && LP.spectate.cur ? LP.spectate.cur() : null;
      return sp && sp.k === 'game' ? 'g:' + sp.id : '';
    };
    setInterval(() => {
      const r = roomNow();
      if (!r) { if (cur) leave(); return; }
      if (cur && cur.room === r) return;
      if (cur) leave();
      tabs.classList.remove('hidden');
      cur = { room: r, m: mount(pane, r, { quick: true, profile: false, onUnread: (n) => { const d = $('#gm-dot'); if (d) d.classList.toggle('hidden', !(n > 0 && tab !== 'chat')); if (n > 0 && tab === 'chat' && cur) cur.m.seen(); } }) };
      show('moves');
    }, 1000);
  }

  LP.chat = { mount, open: openGlobal };
})();
