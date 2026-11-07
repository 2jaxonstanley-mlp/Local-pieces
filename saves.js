/**
 * Saved games ("Continue playing"): up to 5 games in progress at once, from any mode.
 * The menu button continues the most recent one and shows who is playing whom; "Saved games" opens the list where every save can be
 * resumed, viewed (a picture of the position and how far it got), renamed or deleted.
 * Also asks before a new game would replace the oldest save when all slots are taken (Settings > Warn before replacing a save).
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP || !LP.session) return;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const S = LP.session;
  const GLYPH = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };
  const RG = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ------------------------------------------------------------------ describing a save */
  function stamp(t) {
    const d = new Date(t || Date.now());
    let h = d.getHours();
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  }
  function ago(t) {
    const m = Math.round((Date.now() - (t || 0)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  const modeOf = (s) => (s.kind === 'chess' ? (s.pz ? 'Popular puzzle' : s.fen && s.mode !== 'guess' ? 'Custom position' : LP.MODE_LABEL[s.mode] || 'Chess') : s.kind === 'rush' ? 'Capture Rush' : 'Puzzles');
  function names(s) {
    if (s.kind === 'chess') return { w: (s.names && s.names[8]) || 'White', b: (s.names && s.names[16]) || 'Black' };
    if (s.kind === 'rush') return { w: (s.cfg && s.cfg.names && s.cfg.names.w) || 'White', b: (s.cfg && s.cfg.names && s.cfg.names.b) || 'Black' };
    return null;
  }
  /** "Alice vs Computer (Hard)" */
  function who(s) {
    const n = names(s);
    if (n) return n.w + ' vs ' + n.b;
    const nm = LP.profile && LP.profile.name && LP.profile.name();
    return (nm || 'You') + ' · puzzles';
  }
  const title = (s) => s.name || who(s);
  function progress(s) {
    try {
      if (s.kind === 'chess') {
        const n = s.moves.length, n2 = names(s);
        let blackFirst = false;
        if (s.fen) blackFirst = / b /.test(s.fen);
        const whiteMoves = ((n % 2 === 0) !== blackFirst);
        return Math.ceil(n / 2) + (Math.ceil(n / 2) === 1 ? ' move' : ' moves') + ' · ' + (whiteMoves ? n2.w : n2.b) + ' to move';
      }
      if (s.kind === 'rush') return s.g.score + (Math.abs(s.g.score) === 1 ? ' point' : ' points') + ' · ' + (window.Rush && window.Rush.describe ? window.Rush.describe(s).replace(/^Capture Rush · /, '') : '');
      if (s.kind === 'puzzle' && window.Puzzle) return window.Puzzle.describe(s);
    } catch (e) { /* fall through */ }
    return '';
  }
  const sub = (s) => modeOf(s) + ' · ' + progress(s) + ' · ' + ago(s.date);

  /* ------------------------------------------------------------------ the menu buttons */
  function render() {
    const list = S.all();
    const b = $('#continue-btn'), all = $('#saves-btn');
    if (!b) return;
    const top = list[0];
    b.classList.toggle('hidden', !top);
    if (top) {
      $('#continue-name').textContent = 'Continue playing';
      $('#continue-desc').textContent = title(top) + ' · ' + modeOf(top);
      $('#continue-prog').textContent = progress(top) + ' · ' + ago(top.date);
    }
    if (all) {
      all.classList.toggle('hidden', !list.length);
      $('#saves-desc').textContent = list.length + ' of ' + S.MAX + ' slots used. Resume, view, rename or delete.';
    }
  }

  function resume(s) {
    LP.closeSheet();
    if (s.kind === 'chess') LP.resumeChess(s);
    else if (s.kind === 'rush' && window.Rush) window.Rush.resume(s);
    else if (s.kind === 'puzzle' && window.Puzzle) window.Puzzle.resume(s);
  }

  /* ------------------------------------------------------------------ the list */
  function open() {
    const list = S.all();
    if (!list.length) { LP.closeSheet(); render(); return; }
    LP.openSheet(`<h2>Saved games<span class="sub">${list.length} of ${S.MAX} slots used. The newest is first.</span></h2>
      <div class="sv-list">${list.map((s) => `<div class="sv-card" data-id="${esc(s.id)}">
        <div class="sv-top"><b class="sv-title">${esc(title(s))}</b><span class="sv-kind">${esc(modeOf(s))}</span></div>
        ${s.name ? `<div class="sv-who">${esc(who(s))}</div>` : ''}
        <div class="sv-sub">${esc(progress(s))} · ${esc(ago(s.date))}</div>
        <div class="sv-btns"><button class="btn primary sv-resume">Resume</button><button class="btn sv-view">View</button><button class="btn sv-rename">Rename</button><button class="btn sv-del" aria-label="Delete">Delete</button></div>
      </div>`).join('')}</div>
      <button class="btn wide" id="sv-close">Close</button>`, true);
    $('#sv-close').onclick = LP.closeSheet;
    document.querySelectorAll('.sv-card').forEach((c) => {
      const id = c.dataset.id;
      c.querySelector('.sv-resume').onclick = () => { const s = S.find(id); if (s) resume(s); };
      c.querySelector('.sv-view').onclick = () => view(id);
      c.querySelector('.sv-rename').onclick = () => rename(id);
      c.querySelector('.sv-del').onclick = () => del(id);
    });
  }

  function rename(id) {
    const s = S.find(id);
    if (!s) return open();
    LP.openSheet(`<h2>Rename this save<span class="sub">${esc(who(s))} · ${esc(modeOf(s))}</span></h2>
      <input id="sv-name" type="text" maxlength="24" placeholder="${esc(who(s))}" autocomplete="off" enterkeyhint="done">
      <div class="row"><button class="btn" id="sv-rx">Back</button><button class="btn primary" id="sv-rok">Save</button></div>
      <p class="note">Leave it empty to go back to the players' names.</p>`);
    const inp = $('#sv-name');
    inp.value = s.name || '';
    const ok = () => { S.rename(id, inp.value); render(); open(); };
    $('#sv-rok').onclick = ok;
    $('#sv-rx').onclick = open;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  function del(id) {
    const s = S.find(id);
    if (!s) return open();
    LP.openSheet(`<h2>Delete this save?<span class="sub">${esc(title(s))} · ${esc(modeOf(s))}. This cannot be undone.</span></h2>
      <div class="row"><button class="btn" id="sv-dn">Keep it</button><button class="btn primary" id="sv-dy">Delete</button></div>`);
    $('#sv-dn').onclick = open;
    $('#sv-dy').onclick = () => { S.remove(id); render(); if (LP.renderSavedList) LP.renderSavedList(); if (S.count()) open(); else LP.closeSheet(); };
  }

  /* ------------------------------------------------------------------ view progress */
  /** The saved position as 64 squares: [{ t: 1..6, w: bool }|null] from a8 to h1. */
  function squares(s) {
    const out = [];
    if (s.kind === 'chess') {
      const g = new Chess();
      g.mode = s.mode === 'secret' ? 'secret' : s.mode === 'snail' ? 'snail' : s.mode === 'gamble' ? 'gamble' : s.mode === 'guess' ? 'guess' : s.mode === 'royale' ? 'royale' : 'basic';
      g.reset();
      if (s.fen) g.loadFen(s.fen);
      if (s.secrets) g.secretQueen = { [WHITE]: s.secrets[WHITE], [BLACK]: s.secrets[BLACK] };
      const upTo = Math.min(s.moves.length, s.viewPly != null ? s.viewPly : s.moves.length);
      for (let i = 0; i < upTo; i++) { try { g.makeMove(s.moves[i]); } catch (e) { break; } }
      for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) { const p = g.board[sq(f, r)]; out.push(p ? { t: p & 7, w: (p & 24) === 8 } : null); }
    } else if (s.kind === 'rush') {
      for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) { const c = s.g.cells[r * 8 + f]; out.push(c ? { t: RG[c.t], w: c.c === 'w' } : null); }
    } else if (s.kind === 'puzzle' && window.PuzzleGen) {
      const g = window.PuzzleGen.fromPos(s.P.pos);
      for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) { const p = g.board[sq(f, r)]; out.push(p ? { t: p & 7, w: (p & 24) === 8 } : null); }
    }
    return out;
  }
  function mini(s) {
    let sqs = [];
    try { sqs = squares(s); } catch (e) { sqs = []; }
    if (sqs.length !== 64) return '';
    return '<div class="mb" aria-hidden="true">' + sqs.map((p, i) => `<i class="${(((i >> 3) + (i & 7)) % 2 === 0) ? 'l' : 'd'}">${p ? `<b class="${p.w ? 'w' : 'b'}">${GLYPH[p.t]}︎</b>` : ''}</i>`).join('') + '</div>';
  }
  function facts(s) {
    const rows = [['Mode', modeOf(s)], ['Players', who(s)]];
    try {
      if (s.kind === 'chess') {
        const n2 = names(s);
        rows.push(['Moves played', Math.ceil(s.moves.length / 2) + ' (' + s.moves.length + ' plies)']);
        if (s.ai) rows.push(['Computer', (LP.LEVEL_LABEL[s.ai.level] || s.ai.level) + ', plays ' + (s.ai.color === 8 ? 'White' : 'Black')]);
        if (s.clock) { const f = (ms) => { const t = Math.ceil(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }; rows.push(['Clocks', n2.w + ' ' + f(s.clock.w) + ' · ' + n2.b + ' ' + f(s.clock.b)]); }
        const last = s.sans && s.sans.length ? LP.fmt(s.sans[s.sans.length - 1]) : '';
        if (last) rows.push(['Last move', last]);
      } else if (s.kind === 'rush') {
        rows.push(['Score', s.g.score + ' points (' + s.g.caps.length + ' captured, ' + s.g.taken + ' lost)']);
        rows.push(['Round', window.Rush && window.Rush.describe ? window.Rush.describe(s).replace(/^Capture Rush · /, '') : '']);
      } else rows.push(['Progress', progress(s)]);
    } catch (e) { /* show what we have */ }
    rows.push(['Last played', stamp(s.date)]);
    return rows.map((r) => `<div class="sv-fact"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('');
  }
  function view(id) {
    const s = S.find(id);
    if (!s) return open();
    LP.openSheet(`<h2>${esc(title(s))}<span class="sub">${esc(modeOf(s))} · saved ${esc(ago(s.date))}</span></h2>
      ${mini(s)}<div class="sv-facts">${facts(s)}</div>
      <div class="row"><button class="btn" id="sv-vb">Back</button><button class="btn primary" id="sv-vr">Resume</button></div>`);
    $('#sv-vb').onclick = open;
    $('#sv-vr').onclick = () => resume(s);
  }

  /* ------------------------------------------------------------------ before a new game replaces a save */
  /** Calls next() to carry on. When every slot is taken and the setting is on, asks first. */
  function guard(next) {
    const warn = !LP.prefs || LP.prefs.get('warn');
    if (!warn || !S.full()) { next(); return; }
    const old = S.oldest();
    LP.openSheet(`<h2>Your saves are full<span class="sub">All ${S.MAX} slots are in use. Once you make your first move, this new game replaces the oldest save${old ? ': ' + esc(title(old)) + ' (' + esc(modeOf(old)) + ', ' + esc(ago(old.date)) + ')' : ''}.</span></h2>
      <div class="stack"><button class="btn primary big" id="sg-go">Start anyway</button><button class="btn big" id="sg-mg">Manage my saves</button><button class="btn" id="sg-x">Cancel</button></div>`, true);
    $('#sg-go').onclick = () => { LP.closeSheet(); next(); };
    $('#sg-mg').onclick = open;
    $('#sg-x').onclick = LP.closeSheet;
  }

  const cb = $('#continue-btn');
  if (cb) cb.addEventListener('click', () => { const s = S.all()[0]; if (s) resume(s); });
  const sb = $('#saves-btn');
  if (sb) sb.addEventListener('click', open);
  LP.saves = { render, open, guard, view, rename, title, who, modeOf, progress, ago, stamp };
  render();
})();
