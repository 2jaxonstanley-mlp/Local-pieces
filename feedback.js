/**
 * Feedback: after every 2 or 3 finished games, the menu asks "Got any feedback?" once the player is back on it.
 * Give Feedback opens a form (name, message, one optional picture). Sending it pays 5 tokens and the popup never comes back.
 * "I don't want to give feedback" also stops it for good. Both choices are kept in localStorage.
 *   hasGivenFeedback = "1"  and  declinedFeedback = "1"   (the popup only shows while neither is set)
 * The message goes to the Supabase table "feedback" (action fb). The picture goes to the Storage bucket "feedback" first.
 * Needs the online server (supabase-config.js); without it the popup never shows, since the message could not be saved.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => (LP.esc ? LP.esc(String(t == null ? '' : t)) : String(t == null ? '' : t).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'));
  const REWARD = 5, MAX_PX = 1280, MAX_TEXT = 2000;
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const done = () => get('hasGivenFeedback') === 'true' || get('declinedFeedback') === 'true';
  const N = () => LP.onlineApi;
  const enabled = () => !!(N() && N().url && N().url() && N().client && N().client());
  const toast = (t) => { try { if (LP.chessOnline && LP.chessOnline.toast) LP.chessOnline.toast(t); } catch (e) { /* ignore */ } };

  let target = 0, pending = false, open = false;
  const nextTarget = () => 2 + Math.floor(Math.random() * 2);   // 2 or 3
  const count = () => parseInt(get('localPieces.fbMatches') || '0', 10) || 0;

  /** Called by the game each time a match finishes. */
  function matchDone() {
    if (done()) return;
    if (!target) target = parseInt(get('localPieces.fbTarget') || '0', 10) || nextTarget();
    put('localPieces.fbTarget', String(target));
    const n = count() + 1;
    put('localPieces.fbMatches', String(n));
    if (n >= target) pending = true;
  }

  /** Only on the menu, and only when no other sheet is open. */
  function maybeShow() {
    if (!pending || open || done() || !enabled()) return;
    const menu = $('#menu'), bg = $('#sheet-bg');
    if (!menu || !menu.classList.contains('active') || (bg && !bg.classList.contains('hidden'))) return;
    ask();
  }

  function closeBox() { const b = $('#fb-bg'); if (b) b.remove(); open = false; }
  function reschedule() {   // closed with a tap outside: ask again after the next 2 or 3 games
    pending = false; target = nextTarget(); put('localPieces.fbMatches', '0'); put('localPieces.fbTarget', String(target));
  }
  function box(inner) {
    let bg = $('#fb-bg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'fb-bg'; bg.className = 'sheet-bg fb-bg';
      bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true');
      bg.innerHTML = '<div class="sheet fb-sheet"></div>';
      document.body.appendChild(bg);
    }
    bg.firstChild.innerHTML = inner;
    return bg;
  }

  function ask() {
    open = true;
    const bg = box(`<h2>Got any feedback?<span class="sub">You'll get ${REWARD} tokens for sharing your thoughts.</span></h2>
      <div class="fb-btns"><button class="btn primary" id="fb-give">Give Feedback</button><button class="btn" id="fb-no">I don't want to give feedback</button></div>`);
    bg.onclick = (e) => { if (e.target === bg) { closeBox(); reschedule(); } };
    $('#fb-give').onclick = form;
    $('#fb-no').onclick = () => { put('declinedFeedback', 'true'); pending = false; closeBox(); };
  }

  /** The picture, scaled down and saved as JPEG so it stays small (the bucket allows 3 MB). */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, MAX_PX / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that picture'))), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture')); };
      img.src = url;
    });
  }
  async function upload(blob) {
    const c = N().client(), name = new Date().toISOString().slice(0, 10) + '/' + N().rnd() + N().rnd() + '.jpg';
    const r = await c.storage.from('feedback').upload(name, blob, { contentType: 'image/jpeg', upsert: false });
    if (r.error) throw new Error('The picture could not be uploaded');
    return N().url() + '/storage/v1/object/public/feedback/' + name;
  }

  function form() {
    const P = LP.profile, who = (P && P.name && P.name()) || (LP.board && LP.board.lastName && LP.board.lastName()) || '';
    let file = null, busy = false;
    const bg = box(`<h2>Your feedback<span class="sub">What do you like, what is broken, what should we add? You get ${REWARD} tokens for sending it.</span></h2>
      <label class="fb-l" for="fb-name">Name</label>
      <input id="fb-name" type="text" maxlength="24" autocomplete="off" autocapitalize="words" placeholder="Player">
      <label class="fb-l" for="fb-text">Feedback</label>
      <textarea id="fb-text" rows="5" maxlength="${MAX_TEXT}" placeholder="Type here…"></textarea>
      <div class="fb-pic"><label class="btn fb-pick" for="fb-file">Add a picture (optional)</label><input id="fb-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><span id="fb-fn" class="fb-fn"></span><button class="text-btn hidden" id="fb-rm" type="button">Remove</button></div>
      <p class="fb-err hidden" id="fb-err" role="alert"></p>
      <div class="row"><button class="btn" id="fb-cancel">Cancel</button><button class="btn primary" id="fb-send">Send</button></div>`);
    $('#fb-name').value = who;
    bg.onclick = null;
    const err = (t) => { const e = $('#fb-err'); e.textContent = t || ''; e.classList.toggle('hidden', !t); };
    const setFile = (f) => { file = f; $('#fb-fn').textContent = f ? f.name : ''; $('#fb-rm').classList.toggle('hidden', !f); };
    $('#fb-file').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f && !/^image\//.test(f.type)) { err('Please choose a picture'); e.target.value = ''; return; }
      err(''); setFile(f || null);
    };
    $('#fb-rm').onclick = () => { $('#fb-file').value = ''; setFile(null); };
    $('#fb-cancel').onclick = () => { if (busy) return; closeBox(); reschedule(); };
    $('#fb-send').onclick = async () => {
      if (busy) return;
      const text = $('#fb-text').value.trim(), name = $('#fb-name').value.trim() || 'Player';
      if (!text) { err('Write something first'); return; }
      busy = true; err(''); $('#fb-send').textContent = 'Sending…'; $('#fb-send').disabled = true;
      try {
        let img = '';
        if (file) img = await upload(await shrink(file));
        const r = await N().post({ a: 'fb', pid: LP.global && LP.global.pid ? LP.global.pid() : '', name, text, img }, 1, 'fb');
        if (!r || r.error || !r.ok) throw new Error((r && r.error) || 'Could not send. Check your connection.');
      } catch (e) {
        busy = false; $('#fb-send').textContent = 'Send'; $('#fb-send').disabled = false;
        err(e && e.message ? e.message : 'Could not send. Try again.');
        return;
      }
      put('hasGivenFeedback', 'true'); pending = false;   // only now: it was saved, so the reward is paid and the popup never returns
      try { if (LP.rewards && LP.rewards.addTokens) LP.rewards.addTokens(REWARD); } catch (e) { /* ignore */ }
      closeBox();
      toast('Thanks! You got ' + REWARD + ' tokens');
    };
    setTimeout(() => { try { $('#fb-text').focus(); } catch (e) { /* ignore */ } }, 50);
  }

  /* ---- the Suggestions page: same message + optional screenshot, saved to the same table with type 'suggestion' ---- */
  const SG_REWARD = 3, SG_KEY = 'localPieces.sgRewardDay';
  function suggestions() {
    if (!$('#sg-send')) return;
    let file = null, busy = false;
    const err = (t) => { const e = $('#sg-err'); e.textContent = t || ''; e.classList.toggle('hidden', !t); };
    const setFile = (f) => { file = f; $('#sg-fn').textContent = f ? f.name : ''; $('#sg-rm').classList.toggle('hidden', !f); };
    $('#sg-file').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f && !/^image\//.test(f.type)) { err('Please choose a picture'); e.target.value = ''; return; }
      err(''); setFile(f || null);
    };
    $('#sg-rm').onclick = () => { $('#sg-file').value = ''; setFile(null); };
    $('#sg-send').onclick = async () => {
      if (busy) return;
      const text = $('#sg-text').value.trim();
      if (!text) { err('Write your suggestion first'); return; }
      if (!enabled()) { err('Sending needs the online server. It is not set up yet.'); return; }
      const P = LP.profile, name = (P && P.name && P.name()) || (LP.board && LP.board.lastName && LP.board.lastName()) || 'Player';
      busy = true; err(''); $('#sg-send').textContent = 'Sending…'; $('#sg-send').disabled = true;
      try {
        let img = '';
        if (file) img = await upload(await shrink(file));
        const r = await N().post({ a: 'fb', type: 'suggestion', pid: LP.global && LP.global.pid ? LP.global.pid() : '', name, text, img }, 1, 'fb');
        if (!r || r.error || !r.ok) throw new Error((r && r.error) || 'Could not send. Check your connection.');
      } catch (e) {
        busy = false; $('#sg-send').textContent = 'Send suggestion'; $('#sg-send').disabled = false;
        err(e && e.message ? e.message : 'Could not send. Try again.');
        return;
      }
      busy = false; $('#sg-send').textContent = 'Send suggestion'; $('#sg-send').disabled = false;
      $('#sg-text').value = ''; $('#sg-file').value = ''; setFile(null);
      const today = new Date().toISOString().slice(0, 10), paid = get(SG_KEY) === today;
      if (!paid) { put(SG_KEY, today); try { if (LP.rewards && LP.rewards.addTokens) LP.rewards.addTokens(SG_REWARD); } catch (e) { /* ignore */ } }
      toast(paid ? 'Thanks! Suggestion sent' : 'Thanks! You got ' + SG_REWARD + ' tokens');
      setTimeout(() => LP.showPage('menu'), 600);
    };
  }
  suggestions();

  // show the popup as soon as the menu is on screen again
  const menu = $('#menu');
  if (menu) new MutationObserver(() => setTimeout(maybeShow, 700)).observe(menu, { attributes: true, attributeFilter: ['class'] });
  LP.feedback = { matchDone, ask: () => { if (!open && enabled()) ask(); } };
})();
