/**
 * Puzzle of the Day: one of the Popular puzzles, the same for everyone (chosen by the UTC date). Shown on Home under the daily reward.
 *  - Solving it (against the Insane computer, like any Popular puzzle) earns 10 tokens once that day and adds to a day streak.
 *  - With the online server on, the card also shows how many players solved it today and the streak is kept on the server.
 *  - Saved in localStorage 'localPieces.dpz': { day, solved, streak, last }.  Server actions: dpget / dpsolve (supabase-19).
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP || !LP.popular) return;
  const $ = (s) => document.querySelector(s);
  const KEY = 'localPieces.dpz';
  const TOKENS = 10;
  const N = () => LP.onlineApi;
  const online = () => !!(N() && N().url && N().url() && LP.global && LP.global.pid && LP.global.pid());
  const dayStr = (t) => new Date(t == null ? Date.now() : t).toISOString().slice(0, 10);
  const today = () => dayStr();
  const yesterday = () => dayStr(Date.now() - 864e5);

  let S = { day: '', solved: false, streak: 0, last: '' };
  try { const x = JSON.parse(localStorage.getItem(KEY)); if (x) S = Object.assign(S, x); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  let srv = null;   // the server's answer: { n, me, streak }

  /** Today's puzzle: the list is walked one entry per day. */
  const pick = () => {
    const list = LP.popular.list, d = Math.floor(Date.parse(today() + 'T00:00:00Z') / 864e5);
    return list[((d % list.length) + list.length) % list.length];
  };
  const solvedToday = () => (S.day === today() && S.solved) || !!(srv && srv.me);
  const streak = () => {
    const local = S.last === today() || S.last === yesterday() ? S.streak : 0;
    return Math.max(local, srv ? srv.streak || 0 : 0);
  };

  async function pull() {
    if (!online()) return;
    try {
      const r = await N().post({ a: 'dpget', pid: LP.global.pid(), day: today() }, 1);
      if (r && !r.error) { srv = r; draw(); }
    } catch (e) { /* offline is fine */ }
  }

  function draw() {
    const box = $('#m2-dpz');
    if (!box) return;
    const p = pick(), done = solvedToday(), st = streak();
    const white = p.fen.split(' ')[1] !== 'b';
    box.innerHTML = `<div class="dpz${done ? ' done' : ''}">
        <span class="dpz-mb mb">${LP.popular.mini(p.fen)}</span>
        <div class="dpz-t"><small>Puzzle of the Day${done ? ' · solved ✓' : ''}</small><b>${LP.esc(p.name)}</b>
          <span class="dpz-tags"><em>${LP.esc(p.goal)}</em><em>${white ? 'White' : 'Black'} to start</em></span>
          <span class="dpz-meta"><img src="lp-streak.png" alt=""> ${st} day${st === 1 ? '' : 's'}${srv && srv.n != null ? ` &middot; ${srv.n} solved today` : ''}</span>
          <button class="btn ${done ? '' : 'primary'}" id="dpz-go" type="button">${done ? 'Play again' : 'Play'}</button></div></div>`;
    $('#dpz-go').onclick = () => LP.saves && LP.saves.guard ? LP.saves.guard(() => LP.playPopular(p)) : LP.playPopular(p);
  }

  /** Called when any Popular puzzle is solved: if it is today's, count it. */
  function solved(id) {
    const p = pick();
    if (id !== p.id || solvedToday()) return;
    S.last === yesterday() ? S.streak++ : (S.streak = S.last === today() ? S.streak : 1);
    S.day = today(); S.solved = true; S.last = today(); save();
    try { if (LP.rewards) LP.rewards.addTokens(TOKENS); } catch (e) { /* ignore */ }
    if (LP.chessOnline && LP.chessOnline.toast) LP.chessOnline.toast('Puzzle of the Day solved! +' + TOKENS + ' tokens');
    draw();
    if (online()) N().post({ a: 'dpsolve', pid: LP.global.pid(), day: today() }, 2).then((r) => { if (r && !r.error) { srv = r; draw(); } }).catch(() => {});
  }
  const orig = LP.popular.done;
  LP.popular.done = function (id) { const r = orig.apply(this, arguments); try { solved(id); } catch (e) { /* ignore */ } return r; };

  const menu = $('#menu');
  if (menu) new MutationObserver(() => { if (menu.classList.contains('active')) { draw(); pull(); } }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  draw();
  setTimeout(pull, 3000);
  LP.dailyPuzzle = { pick, solved: solvedToday, streak };
})();
