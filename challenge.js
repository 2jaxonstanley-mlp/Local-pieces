/**
 * Challenges: send one to any online player (from their profile or the player list), pick the game and your colour.
 * - The other player gets a popup the next time they are on the main menu: "X challenged you to ...". Accept or Decline.
 * - A challenge stays open until it is accepted, declined or cancelled. It can only be accepted while the challenger's app is
 *   open (it asks the server every few seconds), and then both players count down 3 seconds and are taken into the game.
 * - Game types are listed in GAMES, so a new online mode only needs one more line there (and server support).
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
  const KEY = 'localPieces.challenges';
  const WAIT_MS = 2500;

  /** Online game types you can challenge someone to. kind: chess | pbattle (matches the server). */
  const GAMES = () => [{ id: 'u', kind: 'chess', mode: 'unlimited', base: 0, inc: 0, name: 'Classic', sub: 'No clock' }]
    .concat(N().TIMES.map((t, i) => ({ id: 't' + i, kind: 'chess', mode: 'timed', base: t[0], inc: t[1], name: t[2], sub: t[0] <= 180 ? 'Bullet' : 'Rapid' })))
    .concat([{ id: 'pb', kind: 'pbattle', mode: 'pbattle', base: 180, inc: 0, name: 'Puzzle Battle', sub: '3 minutes on the same puzzles' }]);
  const gameName = (c) => (c.kind === 'pbattle' ? 'Puzzle Battle' : c.mode === 'timed' ? N().label('timed', c.base, c.inc) + ' chess' : 'Classic chess (no clock)');

  let colour = 'r';
  let out = [];                 // my challenges that are still open: { cid, to, name }
  try { out = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(out)) out = []; } catch (e) { out = []; }
  const saveOut = () => { try { localStorage.setItem(KEY, JSON.stringify(out.slice(-10))); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------------ sending */
  function ask(toId, toName) {
    if (!enabled()) { LP.openSheet('<h2>Online is not set up yet</h2><p class="note">The Supabase settings are missing in supabase-config.js.</p><button class="btn wide" id="ch-x">Close</button>', true); $('#ch-x').onclick = LP.closeSheet; return; }
    if (!toId || toId === pid()) return;
    N().profileName(() => pick(toId, toName));
  }
  const LAST = 'localPieces.chLast';
  function pick(toId, toName) {
    const games = GAMES();
    let last = null;
    try { last = JSON.parse(localStorage.getItem(LAST)); } catch (e) { last = null; }
    const lg = last && games.find((g) => g.id === last.g);
    if (lg && last.c) colour = last.c;
    LP.openSheet(`<h2>Challenge ${esc(toName)}<span class="sub">Pick the game. They will see it next time they are on the main menu.</span></h2>
      ${lg ? `<button class="btn primary wide" id="ch-last" type="button">Same as last time: ${esc(lg.name)}</button>` : ''}
      <div class="ch-col" role="group" aria-label="Your colour"><small>Your colour</small>
        ${[['w', 'White'], ['r', 'Random'], ['b', 'Black']].map(([k, n]) => `<button class="chip${colour === k ? ' on' : ''}" data-c="${k}">${n}</button>`).join('')}</div>
      <div class="stack ch-games">
        ${games.map((g) => `<button class="btn big" data-g="${g.id}"><b>${esc(g.name)}</b><small>${esc(g.sub)}</small></button>`).join('')}
        <button class="btn" id="ch-x">Cancel</button>
      </div>`, true);
    document.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { colour = b.dataset.c; document.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }; });
    document.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => send(toId, toName, games.find((g) => g.id === b.dataset.g)); });
    if ($('#ch-last')) $('#ch-last').onclick = () => send(toId, toName, lg);
    $('#ch-x').onclick = LP.closeSheet;
  }
  async function send(toId, toName, g) {
    try { localStorage.setItem(LAST, JSON.stringify({ g: g.id, c: colour })); } catch (e) { /* ignore */ }
    LP.openSheet('<h2>Sending…</h2>');
    const r = await N().post({ a: 'chsend', pid: pid(), to: toId, name: LP.profile.name(), kind: g.kind, mode: g.mode, base: g.base, inc: g.inc, side: colour, info: await N().myInfo() }, 2);
    if (!r || r.error || !r.cid) {
      LP.openSheet(`<h2>Could not send</h2><p class="note">${esc((r && r.error) || 'Something went wrong.')}</p><button class="btn wide" id="ch-x">Close</button>`, true);
      $('#ch-x').onclick = LP.closeSheet;
      return;
    }
    out = out.filter((o) => o.to !== toId);
    out.push({ cid: r.cid, to: toId, name: toName });
    saveOut();
    waitSheet(r.cid, toName, g, r.toOn);
    poll();
  }
  function waitSheet(cid, toName, g, on) {
    LP.openSheet(`<h2>Challenge sent<span class="sub">${esc(toName)} · ${esc(gameName(g))}</span></h2>
      <p class="note">${on ? esc(toName) + ' is online and will see it on their main menu.' : esc(toName) + ' is offline. They will see it when they next open the app.'}
      Keep the app open: they can only accept while you are here, and then you both go straight into the game.</p>
      <div class="row"><button class="btn" id="ch-c">Cancel challenge</button><button class="btn primary" id="ch-k">Keep waiting</button></div>`, false);
    $('#ch-c').onclick = () => { cancel(cid); LP.closeSheet(); LP.chessOnline && LP.chessOnline.toast('Challenge cancelled'); };
    $('#ch-k').onclick = LP.closeSheet;
  }
  function cancel(cid) {
    out = out.filter((o) => o.cid !== cid); saveOut();
    N().post({ a: 'chno', cid, pid: pid() }, 2);
  }

  /* ------------------------------------------------------------------ watching my challenges */
  let polling = false;
  const busy = () => !!((LP.onlineNet && LP.onlineNet.active && LP.onlineNet.active()) || (LP.puzzleRush && LP.puzzleRush.active && LP.puzzleRush.active()) || counting);
  let counting = false;
  async function poll() {
    if (polling) return;
    polling = true;
    while (out.length && enabled()) {
      if (!document.hidden && !busy()) {
        for (const o of out.slice()) {
          const t0 = Date.now();
          const r = await N().get({ a: 'chwait', pid: pid(), cid: o.cid });
          if (!r || r.error) continue;
          if (r.st === 'open') continue;
          out = out.filter((x) => x.cid !== o.cid); saveOut();
          if (r.st === 'declined') toast(o.name + ' declined your challenge');
          else if (r.st === 'accepted' && r.id) { go(r, o.name, true, t0); break; }
        }
      }
      await N().sleep(WAIT_MS);
    }
    polling = false;
  }
  const toast = (m) => { if (LP.chessOnline && LP.chessOnline.toast) LP.chessOnline.toast(m); };

  /** Both players: 3 second countdown, then into the game. r: { id, tok, at, now, kind } */
  function go(r, who, mine, t0) {
    counting = true;
    const off = r.now - (t0 + Date.now()) / 2;
    const done = () => { counting = false; };
    N().countdown({
      id: r.id, tok: r.tok, at: r.at, off, mine: true, title: 'Challenge', sub: 'You vs ' + who + ' · ' + gameName(r) + '. Starting together.', what: 'challenge',
      go: (s) => { done(); if (r.kind === 'pbattle') LP.puzzleRush.begin(r.id, r.tok, s); else LP.onlineNet.begin(r.id, r.tok, s); },
      gone: done,
    });
  }

  /* ------------------------------------------------------------------ receiving */
  let incoming = [];            // challenges waiting for me (from the server)
  const snoozed = new Set();    // "Later" on the popup: not asked again until you come back to the menu
  let shown = '';               // the challenge the popup is showing right now
  const onMenu = () => { const m = $('#menu'); return !!(m && m.classList.contains('active')); };
  const sheetOpen = () => { const b = $('#sheet-bg'); return b && !b.classList.contains('hidden'); };

  function receive(list) {
    incoming = Array.isArray(list) ? list : [];
    if (LP.notify) incoming.forEach((c) => LP.notify.add({ key: 'ch' + c.cid, k: 'challenge', text: c.name + ' challenged you to ' + gameName(c), act: 'challenge', data: { cid: c.cid, from: c.from, name: c.name } }));
    popup();
  }
  /** From the notification list: show the waiting challenge again (it may have expired by now). */
  function open() {
    snoozed.clear();
    if (!incoming.length) { toast('That challenge has expired'); return; }
    LP.showPage('menu');
    setTimeout(popup, 250);
  }
  /** From a notification's buttons: 'accept' or 'decline' a waiting challenge. Returns false when it is gone (expired or already answered). */
  function respond(cid, what) {
    const c = incoming.find((x) => x.cid === cid);
    if (!c) { toast('That challenge has expired'); return false; }
    if (what === 'accept') accept(c);
    else { incoming = incoming.filter((x) => x.cid !== cid); N().post({ a: 'chno', cid, pid: pid() }, 2); toast('Challenge declined'); }
    return true;
  }
  function popup() {
    if (!incoming.length || !onMenu() || sheetOpen() || busy()) return;
    const c = incoming.find((x) => !snoozed.has(x.cid));
    if (!c) return;
    shown = c.cid;
    const more = incoming.length > 1 ? `<p class="note">${incoming.length - 1} more waiting.</p>` : '';
    LP.openSheet(`<h2>New challenge<span class="sub">You received a challenge from <b>${esc(c.name)}</b> to play <b>${esc(gameName(c))}</b>.</span></h2>
      <p class="note">${c.kind === 'chess' ? (c.side === 'r' ? 'Colours are random.' : 'You play ' + (c.side === 'w' ? 'Black.' : 'White.')) : 'Both of you race the same puzzles.'}</p>${more}
      <div class="stack"><button class="btn big primary" id="ch-a">Accept</button><div class="row"><button class="btn" id="ch-d">Decline</button><button class="btn" id="ch-l">Later</button></div></div>`, false);
    $('#ch-a').onclick = () => accept(c);
    $('#ch-d').onclick = () => { incoming = incoming.filter((x) => x.cid !== c.cid); N().post({ a: 'chno', cid: c.cid, pid: pid() }, 2); LP.closeSheet(); setTimeout(popup, 300); };
    $('#ch-l').onclick = () => { snoozed.add(c.cid); LP.closeSheet(); setTimeout(popup, 300); };
  }
  async function accept(c) {
    LP.openSheet('<h2>Accepting…</h2>');
    const t0 = Date.now();
    const r = await N().post({ a: 'chacc', cid: c.cid, pid: pid(), name: LP.profile.name() || 'Player', info: await N().myInfo() }, 2);
    incoming = incoming.filter((x) => x.cid !== c.cid);
    if (!r || r.error || !r.id) {
      if (r && r.away) snoozed.add(c.cid), incoming.push(c);
      LP.openSheet(`<h2>Could not accept</h2><p class="note">${esc((r && r.error) || 'Something went wrong.')}</p><button class="btn wide" id="ch-x">Close</button>`, true);
      $('#ch-x').onclick = LP.closeSheet;
      return;
    }
    go(r, c.name, true, t0);
  }

  // the popup is for the main menu: show it when you land there, and look for new ones straight away
  const menu = $('#menu');
  if (menu) {
    let was = onMenu();
    new MutationObserver(() => {
      const now = onMenu();
      if (now && !was) { snoozed.clear(); if (LP.players && LP.players.beat) LP.players.beat(); setTimeout(popup, 350); }
      was = now;
    }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  }
  if (out.length) setTimeout(poll, 2000);
  LP.challenge = { ask, receive, popup, open, respond, mine: () => out.slice() };
})();
