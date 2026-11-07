/**
 * Match history: every finished match (Classic, Secret Queen, Sandbox, Bullet, Rapid, Capture Rush and Chess x Air Hockey, but not
 * puzzles) is recorded with the date and time it finished. The last 50 are kept. Tap Watch to replay one:
 *   - untimed chess replays move by move
 *   - timed games (Bullet, Rapid, Capture Rush, Air Hockey) replay on a timeline you can scrub and speed up
 * Replays take room on the device, so if storage runs low the oldest ones lose their replay but keep their line in the list.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const KEY = 'localPieces.history';
  const MAX = 50, BUDGET = 2400000;          // entries kept, and roughly how many characters of replays to keep
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let mem = [];
  let filter = 'all';

  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return v; } catch (e) { /* use memory */ } return mem; };
  function write(list) {
    mem = list;
    for (let tries = 0; tries < 6; tries++) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); return; } catch (e) {
        // storage is full: strip the replay from the oldest entry that still has one and try again
        let k = -1;
        for (let i = list.length - 1; i >= 0; i--) if (list[i].payload) { k = i; break; }
        if (k < 0) return;
        list[k].payload = null; list[k].noReplay = true;
      }
    }
  }
  function prune(list) {
    list = list.slice(0, MAX);
    let total = 0;
    list.forEach((e) => { e._n = e.payload ? JSON.stringify(e.payload).length : 0; total += e._n; });
    for (let i = list.length - 1; i >= 0 && total > BUDGET; i--) {
      if (list[i].payload) { total -= list[i]._n; list[i].payload = null; list[i].noReplay = true; }
    }
    list.forEach((e) => { delete e._n; });
    return list;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function stamp(t) {
    const d = new Date(t || Date.now());
    let h = d.getHours();
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  }
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  /** Record a finished match. e = { kind, id, mode, modeLabel, names:{w,b}, result, winner, dur (s), moves, payload, ... } */
  function add(e) {
    if (!e || !e.id || !e.payload) return;
    e.date = Date.now();
    const list = read().filter((x) => x.id !== e.id);
    list.unshift(e);
    write(prune(list));
    refreshMenu();
  }
  const list = () => read();
  const find = (id) => read().find((x) => x.id === id);
  function del(id) { write(read().filter((x) => x.id !== id)); refreshMenu(); }

  /* ------------------------------------------------------------------ list screen */
  const KINDS = { all: 'All', chess: 'Chess', rush: 'Capture Rush', hockey: 'Air Hockey' };
  function who(e) { const n = e.names || {}; return esc((n.w || 'White') + ' vs ' + (n.b || 'Black')); }
  function opp(e) {
    if (e.bots) return 'computers';
    if (e.level) return 'vs ' + (LP.LEVEL_LABEL[e.level] || e.level) + ' computer';
    return '2 players';
  }
  function meta(e) {
    const bits = [];
    if (e.dur) bits.push(mmss(e.dur));
    if (e.kind === 'chess') bits.push(plural(e.moves || 0, 'move'));
    else if (e.kind === 'rush') bits.push(plural(e.moves || 0, 'move'));
    else if (e.kind === 'hockey') bits.push(plural(e.moves || 0, 'goal'));
    bits.push(opp(e));
    return bits.join(' · ');
  }

  function render() {
    const box = $('#hs-list');
    if (!box) return;
    const all = list();
    const shown = all.filter((e) => filter === 'all' || e.kind === filter);
    $('#hs-chips').innerHTML = Object.keys(KINDS).map((k) => `<button class="lb-tab${k === filter ? ' on' : ''}" data-k="${k}">${KINDS[k]}${k === 'all' ? ' (' + all.length + ')' : ''}</button>`).join('');
    $('#hs-chips').querySelectorAll('button').forEach((b) => { b.onclick = () => { filter = b.dataset.k; render(); }; });
    $('#hs-clear').classList.toggle('hidden', !all.length);
    if (!shown.length) {
      box.innerHTML = `<div class="an-empty"><b>${all.length ? 'Nothing in this filter' : 'No matches yet'}</b><span>${all.length ? 'Pick another filter above.' : 'Finish a game (anything except a puzzle) and it appears here, with the date and time it finished.'}</span></div>`;
      return;
    }
    box.innerHTML = shown.map((e) => {
      const canExport = e.kind === 'chess' && e.payload && LP.exporter && LP.exporter.canExport(e.payload);
      const canAnalyze = e.payload && (e.kind === 'rush' || (e.kind === 'chess' && !e.payload.tas && !['snail', 'gamble', 'guess', 'royale'].includes(e.payload.mode2 || e.payload.mode))) && LP.analyze;
      return `<div class="an-card hs-card" data-id="${esc(e.id)}">
        <div class="an-top"><b class="an-mode">${esc(e.modeLabel || e.mode || '')}${e.modded && e.modded.length ? ' <span class="hs-mod">Modded</span>' : ''}</b><span class="an-date">${esc(stamp(e.date))}</span></div>
        <div class="an-who">${who(e)}</div>
        <div class="an-res">${esc(e.result || '')}</div>
        <div class="hs-meta">${esc(meta(e))}</div>
        ${e.modded && e.modded.length ? '<div class="hs-meta hs-mods">Mods used: ' + esc(e.modded.join(', ')) + '</div>' : ''}
        ${e.payload ? '' : '<div class="hs-meta hs-gone">The replay was removed to save space on this device.</div>'}
        <div class="an-btns"><button class="btn primary hs-watch"${e.payload ? '' : ' disabled'}>Watch replay</button>${canAnalyze ? '<button class="btn hs-an">Analyze</button>' : ''}${canExport ? '<button class="btn hs-ex">Export</button>' : ''}<button class="btn an-del hs-del" aria-label="Delete">Delete</button></div>
      </div>`;
    }).join('');
    box.querySelectorAll('.hs-card').forEach((c) => {
      const id = c.dataset.id;
      c.querySelector('.hs-watch').onclick = () => watch(id);
      const an = c.querySelector('.hs-an');
      if (an) an.onclick = () => analyse(id);
      const ex = c.querySelector('.hs-ex');
      if (ex) ex.onclick = () => { const x = find(id); if (x && x.payload) LP.exporter.matchSheet(x.payload); };
      c.querySelector('.hs-del').onclick = () => {
        LP.openSheet('<h2>Delete this match?<span class="sub">It is removed from your history and its replay is lost.</span></h2><div class="row"><button class="btn" id="d-no">Keep it</button><button class="btn primary" id="d-yes">Delete</button></div>', true);
        $('#d-no').onclick = LP.closeSheet;
        $('#d-yes').onclick = () => { del(id); LP.closeSheet(); render(); };
      };
    });
  }

  function watch(id) {
    const e = find(id);
    if (!e || !e.payload) return;
    if (e.kind === 'chess') LP.startReplay(e.payload, 'history');
    else if (e.kind === 'rush' && window.Rush) window.Rush.watch(e.payload, 'history');
    else if (e.kind === 'hockey' && window.Hockey) window.Hockey.watch(e.payload, 'history');
  }

  /** Open the match in Analyze (it is saved there too, like "Analyze game" after a match). */
  function analyse(id) {
    const e = find(id);
    if (!e || !e.payload || !LP.analyze) return;
    const saved = LP.store.get();
    if (!saved.some((x) => x.id === e.payload.id)) { saved.unshift(e.payload); LP.store.set(saved.slice(0, 40)); }
    LP.analyze.begin(e.payload.id);
  }

  function show() { render(); LP.showPage('history'); }
  function refreshMenu() {
    const d = $('#history-desc');
    if (!d) return;
    const l = list();
    d.textContent = l.length ? plural(l.length, 'match') + ' · last finished ' + stamp(l[0].date) : 'Every finished match, with replays.';
  }

  /* ------------------------------------------------------------------ wiring */
  function build() {
    const app = $('#app');
    const sec = document.createElement('section');
    sec.id = 'history'; sec.className = 'page';
    sec.innerHTML = `<header class="game-header">
        <button id="hs-back" class="text-btn" aria-label="Back to menu">&larr; Menu</button>
        <span class="pz-head"><span class="mode-title">History</span></span>
        <span class="header-spacer"></span>
      </header>
      <div class="lb-wrap"><p class="sg-lead">Your last ${MAX} finished matches (puzzles are not included). Untimed chess replays move by move. Timed games (Bullet, Rapid, Capture Rush, Air Hockey) replay on a timeline you can scrub and speed up.</p>
        <div id="hs-chips" class="lb-tabs hs-chips"></div><div id="hs-list"></div>
        <button id="hs-clear" class="btn wide lb-reset hidden">Clear history</button></div>`;
    app.insertBefore(sec, $('#sheet-bg'));
    $('#hs-back').onclick = () => LP.showPage('menu');
    $('#hs-clear').onclick = () => {
      LP.openSheet('<h2>Clear your history?<span class="sub">All saved matches and replays are removed from this device.</span></h2><div class="row"><button class="btn" id="d-no">Cancel</button><button class="btn primary" id="d-yes">Clear it</button></div>', true);
      $('#d-no').onclick = LP.closeSheet;
      $('#d-yes').onclick = () => { write([]); LP.closeSheet(); refreshMenu(); render(); };
    };
    const m = document.querySelector('.mode[data-mode="history"]');
    if (m) m.addEventListener('click', show);
  }
  build();
  refreshMenu();
  LP.history = { add, list, find, del, show, refreshMenu, stamp, watch };
})();
