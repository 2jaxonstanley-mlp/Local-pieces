/**
 * Profile comments: a "Comments" tab on every player profile (the stats tabs call LP.comments.mount).
 * - Anyone with an online name can write on someone else's profile (280 characters). Newest first, 10 at a time.
 * - The profile's owner can delete any comment on it. Writers can delete their own.
 * - Saved on the server (file 11 of the SQL). The server limits the rate: one comment every few seconds.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const N = () => LP.onlineApi;
  const enabled = () => !!(N() && N().url && N().url());
  const pid = () => (LP.global && LP.global.pid ? LP.global.pid() : '');
  const MAX = 280;

  const av = (src, name) => (src ? `<span class="gl-av" style="background-image:url(${src})"></span>` : `<span class="gl-av">${esc((name || '?').charAt(0).toUpperCase())}</span>`);
  const ago = (t) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    const d = Math.round(h / 24); return d < 30 ? d + ' d ago' : new Date(t).toLocaleDateString();
  };

  /** Fill `body` with the comments of player `ownerId`. mine: this is your own profile (you cannot write, but you can delete). */
  function mount(body, ownerId, mine) {
    if (!enabled()) { body.innerHTML = '<div class="lb-empty"><p>Comments need the online server.</p></div>'; return; }
    let last = 0, busy = false;
    body.innerHTML = `<div class="cm-wrap">
      ${mine ? '<p class="lb-hint">Comments other players leave on your profile show up here. You can delete any of them.</p>' : `<div class="cm-new">
        <textarea id="cm-text" maxlength="${MAX}" rows="2" placeholder="Write a comment…" aria-label="Write a comment"></textarea>
        <div class="cm-bar"><small id="cm-n">0/${MAX}</small><button class="btn primary" id="cm-post" type="button">Post</button></div>
        <p class="fb-err hidden" id="cm-err" role="alert"></p></div>`}
      <ul class="cm-list" id="cm-list"></ul>
      <p class="lb-hint" id="cm-empty">Loading…</p>
      <button class="btn wide hidden" id="cm-more" type="button">Load more</button></div>`;
    const $ = (s) => body.querySelector(s);
    const err = (t) => { const e = $('#cm-err'); if (e) { e.textContent = t || ''; e.classList.toggle('hidden', !t); } };

    const row = (c) => {
      const can = mine || c.from === pid();
      return `<li class="cm-row" data-id="${c.id}"><button class="cm-who" type="button" data-p="${esc(c.from)}" aria-label="Open ${esc(c.name)}'s profile">${av(c.pfp, c.name)}</button>
        <div class="cm-main"><div class="cm-head"><b>${esc(c.name)}</b><small>${ago(c.t)}</small>${can ? `<button class="cm-del" type="button" data-d="${c.id}" aria-label="Delete this comment">&times;</button>` : ''}</div><p>${esc(c.text)}</p></div></li>`;
    };
    const bind = (root) => {
      root.querySelectorAll('.cm-who').forEach((b) => { b.onclick = () => { if (b.dataset.p && LP.players) LP.players.open(b.dataset.p); }; });
      root.querySelectorAll('.cm-del').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          const r = await N().post({ a: 'pcdel', pid: pid(), cid: b.dataset.d }, 2);
          if (r && r.ok) { const li = b.closest('.cm-row'); if (li) li.remove(); if (!$('#cm-list').children.length) $('#cm-empty').textContent = 'No comments yet.'; }
          else b.disabled = false;
        };
      });
    };
    async function load(more) {
      if (busy) return;
      busy = true;
      const r = await N().get({ a: 'pclist', id: ownerId, before: more ? last : '' });
      busy = false;
      if (!body.isConnected) return;
      if (!r || r.error) { $('#cm-empty').textContent = 'Could not load comments. Check your connection.'; return; }
      if (r.off) { const nw = $('.cm-new'); if (nw) nw.remove(); $('#cm-empty').textContent = 'This player has turned comments off.'; return; }
      const list = r.comments || [];
      if (!more) $('#cm-list').innerHTML = '';
      const tmp = document.createElement('ul');
      tmp.innerHTML = list.map(row).join('');
      bind(tmp);
      [...tmp.children].forEach((li) => $('#cm-list').appendChild(li));
      if (list.length) last = list[list.length - 1].id;
      $('#cm-empty').textContent = $('#cm-list').children.length ? '' : 'No comments yet. Be the first!';
      $('#cm-more').classList.toggle('hidden', !r.more);
    }
    $('#cm-more').onclick = () => load(true);
    if (!mine) {
      const t = $('#cm-text');
      t.oninput = () => { $('#cm-n').textContent = t.value.length + '/' + MAX; err(''); };
      $('#cm-post').onclick = () => {
        const text = t.value.trim();
        if (!text) { err('Write something first'); return; }
        const send = async () => {
          $('#cm-post').disabled = true;
          const r = await N().post({ a: 'pcadd', pid: pid(), id: ownerId, text }, 2);
          $('#cm-post').disabled = false;
          if (!r || r.error || !r.ok) { err((r && r.error) || 'Could not post. Check your connection.'); return; }
          t.value = ''; $('#cm-n').textContent = '0/' + MAX; err('');
          load(false);
        };
        if (N().profileName) N().profileName(send); else send();   // asks for an online name the first time
      };
    }
    load(false);
  }

  LP.comments = { mount };
})();
