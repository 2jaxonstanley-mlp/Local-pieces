/**
 * Daily reward + day streak.
 * - 10 minutes of active play in a calendar day (your own day) makes that day's reward claimable. It stays claimable for 3 days
 *   and each day can be claimed once. It pays tokens (more with a longer streak) and sometimes a free crate.
 * - Day streak: consecutive days with at least one finished game. Missing a whole day resets it. Shown on Home, your profile and a leaderboard.
 * - The server (SQL file 18) keeps the numbers when the online server is set up; without it everything is kept on this device.
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
  const KEY = 'localPieces.dayplay';
  const NEED = 600;
  const PLAY_PAGES = ['game', 'rush', 'hockey', 'puzzle', 'solo', 'popular'];

  const dayStr = (d) => { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const shift = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); return dayStr(new Date(y, m - 1, d + n)); };

  let L = { days: {}, streak: { cur: 0, best: 0, last: '' }, pend: { secs: 0, games: 0 } };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.days) L = Object.assign(L, s); } catch (e) { /* ignore */ }
  const save = () => {
    const keep = Object.keys(L.days).sort().slice(-8);
    Object.keys(L.days).forEach((k) => { if (!keep.includes(k)) delete L.days[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* ignore */ }
  };
  const today = () => dayStr();
  const dayRec = (d) => (L.days[d] = L.days[d] || { secs: 0, games: 0, claimed: false });

  let SS = null;   // the server's answer (when the online server is on)

  /* ------------------------------------------------------------------ what counts as playing */
  let lastInput = Date.now();
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => document.addEventListener(e, () => { lastInput = Date.now(); }, { passive: true }));
  const playing = () => {
    if (document.hidden || Date.now() - lastInput > 60000) return false;
    const pg = $('.page.active');
    return !!pg && PLAY_PAGES.includes(pg.id);
  };
  setInterval(() => {
    if (!playing()) return;
    dayRec(today()).secs += 5; L.pend.secs += 5;
    if (SS) SS.secs = (SS.secs || 0) + 5;
    save();
    if (L.pend.secs >= 60) flush();
  }, 5000);

  function game() {
    const t = today(), r = dayRec(t);
    r.games++; L.pend.games++;
    const s = L.streak;
    if (s.last !== t) { s.cur = s.last === shift(t, -1) ? s.cur + 1 : 1; s.best = Math.max(s.best, s.cur); s.last = t; }
    save();
    flush();
  }

  /* ------------------------------------------------------------------ server sync */
  let sending = false;
  async function flush() {
    if (!enabled() || !pid() || sending) return;
    sending = true;
    const secs = Math.min(180, L.pend.secs), games = Math.min(5, L.pend.games);
    const r = await N().post({ a: 'dply', pid: pid(), day: today(), secs, games }, 2);
    sending = false;
    if (r && !r.error && typeof r.secs === 'number') {
      L.pend.secs -= secs; L.pend.games -= games; save();
      SS = r; draw(); dot();
    }
  }
  async function pull() {
    if (!enabled() || !pid()) return;
    const r = await N().post({ a: 'dget', pid: pid(), day: today() }, 1);
    if (r && !r.error && typeof r.secs === 'number') { SS = r; draw(); dot(); }
  }

  /* ------------------------------------------------------------------ state for the screen */
  function state() {
    if (SS) return { secs: SS.secs, claimable: !!SS.claimable, claimed: !!SS.claimed, streak: SS.streak, best: SS.best, done: !!SS.done };
    const t = today(), tr = dayRec(t);
    let pend = '';
    [shift(t, -3), shift(t, -2), shift(t, -1), t].forEach((d) => { const x = L.days[d]; if (!pend && x && x.secs >= NEED && !x.claimed) pend = d; });
    const alive = L.streak.last && L.streak.last >= shift(t, -1);
    return { secs: tr.secs, claimable: !!pend, claimed: tr.claimed, streak: alive ? L.streak.cur : 0, best: L.streak.best, done: L.streak.last === t };
  }

  /* ------------------------------------------------------------------ claim */
  async function claim() {
    let res = null;
    if (SS && enabled() && pid()) {
      await flush();
      res = await N().post({ a: 'dclaim', pid: pid(), day: today() }, 2);
      if (!res || !res.ok) { if (res && res.state) { SS = res.state; } draw(); dot(); popup('Could not claim: ' + ((res && res.error) || 'check your connection')); return; }
      SS = res.state;
    } else {
      const t = today();
      const d = [shift(t, -3), shift(t, -2), shift(t, -1), t].find((x) => L.days[x] && L.days[x].secs >= NEED && !L.days[x].claimed);
      if (!d) return;
      L.days[d].claimed = true; save();
      const st = state();
      res = { ok: true, tokens: 20 + Math.floor(Math.random() * 21) + Math.min(st.streak, 10) * 2, crate: Math.random() < 0.12 };
    }
    if (LP.rewards) LP.rewards.addTokens(res.tokens);
    draw(); dot();
    const st = state();
    LP.openSheet(`<h2>Daily reward<span class="sub">Thanks for playing today!</span></h2>
      <div class="dy-got"><span class="coin" aria-hidden="true"><i></i></span><b>+${res.tokens}</b><span>tokens</span></div>
      ${st.streak > 1 ? `<p class="note">Day streak ${st.streak}: a longer streak pays a little more each day.</p>` : ''}
      ${res.crate ? '<p class="dy-crate">Bonus: you also won a <b>free crate</b>!</p>' : ''}
      <div class="row"><button class="btn primary" id="dy-ok" type="button" style="flex:1">${res.crate ? 'Open free crate' : 'Done'}</button></div>`, true);
    $('#dy-ok').onclick = () => { LP.closeSheet(); if (res.crate && LP.rewards && LP.rewards.freeCrate) setTimeout(() => LP.rewards.freeCrate(), 200); };
  }
  function popup(t) { if (LP.chessOnline && LP.chessOnline.toast) LP.chessOnline.toast(t); }

  /* ------------------------------------------------------------------ Home card + indicator */
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function draw() {
    const box = $('#m2-daily');
    if (!box) return;
    const s = state(), pct = Math.min(100, Math.round((s.secs / NEED) * 100));
    const ready = s.claimable;
    box.innerHTML = `<div class="dy-card${ready ? ' ready' : ''}">
      <div class="dy-l"><b>${ready ? 'Daily Reward available' : 'Daily Reward'}</b>
        <span>${ready ? 'Tap to claim your tokens (and maybe a free crate).' : s.claimed ? 'Claimed for today. Come back tomorrow!' : s.secs >= NEED ? 'Done for today.' : 'Play 10 minutes today to earn it: ' + fmt(Math.min(s.secs, NEED)) + ' / 10:00'}</span>
        <i class="dy-bar" aria-hidden="true"><i style="width:${ready || s.claimed ? 100 : pct}%"></i></i></div>
      <div class="dy-r">${ready ? '<button class="btn primary" id="dy-claim" type="button">Claim</button>' : ''}<span class="dy-streak" title="Consecutive days with a finished game. Miss a day and it resets.">\u{1F525} <b>${s.streak}</b><small>day streak</small></span></div></div>`;
    const b = $('#dy-claim'); if (b) b.onclick = claim;
  }
  function dot() {
    const s = state();
    document.querySelectorAll('.m2-si[data-p="currency"]').forEach((b) => b.classList.toggle('has-dot', s.claimable));
    document.querySelectorAll('.m2-si[data-p="home"]').forEach((b) => b.classList.toggle('has-gold', s.claimable));
  }

  /* ------------------------------------------------------------------ prompt on app open / return to the menu */
  let prompted = '';
  function maybePrompt() {
    const s = state();
    const key = today() + ':' + (s.claimable ? 1 : 0);
    if (!s.claimable || prompted === key) return;
    if ($('.tut') || ($('#sheet-bg') && !$('#sheet-bg').classList.contains('hidden'))) return;   // do not cover the tutorial or another popup
    prompted = key;
    LP.openSheet(`<h2>Daily Reward available<span class="sub">You played enough today to earn a reward.</span></h2>
      <div class="row"><button class="btn" id="dy-later" type="button">Later</button><button class="btn primary" id="dy-now" type="button">Claim</button></div>`, true);
    $('#dy-later').onclick = LP.closeSheet;
    $('#dy-now').onclick = () => { LP.closeSheet(); setTimeout(claim, 150); };
  }
  const menu = $('#menu');
  if (menu) new MutationObserver(() => { if (menu.classList.contains('active')) { draw(); pull().then(maybePrompt); setTimeout(maybePrompt, 400); } }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else if (menu && menu.classList.contains('active')) pull().then(maybePrompt); });

  draw(); dot();
  setTimeout(() => { pull().then(() => { flush(); maybePrompt(); }); if (!enabled()) maybePrompt(); }, 2500);
  setInterval(() => { if (!document.hidden && L.pend.secs > 0) flush(); }, 60000);
  LP.daily = { game, playing, state, claim, flush, today, streak: () => state().streak };
})();
