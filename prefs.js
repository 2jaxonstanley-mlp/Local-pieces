/**
 * Preferences: sound, animations, board colours, warnings, quick rematch, keyboard shortcuts and the choices you made last time.
 * Everything is saved on this device and loaded before the first screen. Settings has the switches (profile.js calls LP.prefs.rows / bind).
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const KEY = 'localPieces.prefs';
  const DEF = { sound: true, volume: 0.6, anim: true, warn: true, quick: true, shortcuts: true, premove: true, spectate: true, light: '', dark: '', haptic: false, autoq: false, input: 'both', newsPopup: true, preGhost: true, annot: true, nolast: false, nocoords: false, notation: 'san', engine: 'lite', depth: 'normal', cb: false, hc: false, big: false, last: {} };
  let P = Object.assign({}, DEF, { last: {} });
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') P = Object.assign(P, s, { last: Object.assign({}, s.last || {}) }); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* ignore */ } };

  const prefs = {
    get: (k) => P[k],
    set(k, v) { P[k] = v; save(); },
    all: () => Object.assign({}, P),
    /** Remember what you picked last time (computer level, clock, players...). */
    remember(k, v) { P.last[k] = v; save(); },
    last: (k) => P.last[k],
    /** Custom board colours replace whatever board is equipped. */
    look() {
      const r = document.documentElement.style;
      if (!P.light && !P.dark) return;
      if (P.light) r.setProperty('--light-sq', P.light);
      if (P.dark) r.setProperty('--dark-sq', P.dark);
      r.setProperty('--light-img', 'none');
      r.setProperty('--dark-img', 'none');
      document.body.dataset.bd = '';
    },
  };
  LP.prefs = prefs;

  /* ------------------------------------------------------------------ sound (small synthesised tones, no files) */
  let ctx = null;
  const TONES = {
    move: [[520, 0.05, 'triangle']],
    capture: [[300, 0.07, 'square'], [190, 0.09, 'square']],
    castle: [[440, 0.05, 'triangle'], [660, 0.07, 'triangle']],
    check: [[880, 0.07, 'sine'], [880, 0.07, 'sine']],
    win: [[523, 0.1, 'triangle'], [659, 0.1, 'triangle'], [784, 0.1, 'triangle'], [1047, 0.2, 'triangle']],
    lose: [[392, 0.14, 'sine'], [330, 0.14, 'sine'], [262, 0.26, 'sine']],
    draw: [[440, 0.12, 'sine'], [440, 0.18, 'sine']],
    goal: [[660, 0.08, 'square'], [880, 0.14, 'square']],
  };
  function play(name) {
    buzz(name);
    if (!P.sound || !TONES[name]) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      let t = ctx.currentTime;
      TONES[name].forEach(([f, d, type]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = f;
        const v = Math.max(0, Math.min(1, P.volume)) * 0.25;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + d + 0.02);
        t += d * 0.9;
      });
    } catch (e) { /* sound is optional */ }
  }
  LP.fx = { play };

  /* ------------------------------------------------------------------ animations */
  function animClass() { document.documentElement.classList.toggle('no-anim', !P.anim); }
  animClass();

  /* ------------------------------------------------------------------ display options, accessibility, engine, notation, haptics */
  const root = document.documentElement;
  function look2() {
    root.classList.toggle('pf-nolast', !!P.nolast);
    root.classList.toggle('pf-nocoords', !!P.nocoords);
    root.classList.toggle('pf-cb', !!P.cb);
    root.classList.toggle('pf-hc', !!P.hc);
    root.classList.toggle('pf-big', !!P.big);
    root.classList.toggle('pf-tap', P.input === 'tap');
    figurine();
  }
  /** Notation: Nf3 or ♘f3 in the move lists (the original text is kept, so it can be switched back). */
  const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
  let figBusy = false;
  function figurine() {
    if (figBusy) return;
    figBusy = true;
    try {
      document.querySelectorAll('#moves-scroll .move').forEach((b) => {
        b.childNodes.forEach((n) => {
          if (n.nodeType !== 3) return;
          if (n._o === undefined) n._o = n.nodeValue;
          const o = n._o, v = P.notation === 'fig' ? o.replace(/^([KQRBN])(?=[a-hx1-8])/, (m, c) => FIG[c]) : o;
          if (n.nodeValue !== v) n.nodeValue = v;
        });
      });
    } finally { figBusy = false; }
  }
  const ms = $('#moves-scroll');
  if (ms) new MutationObserver(() => { if (P.notation === 'fig') figurine(); }).observe(ms, { childList: true, subtree: true });
  /** The engine used by Analyze and the Sandbox hint, and how long it thinks. */
  LP.analysisEngine = () => (P.engine === 'full' && LP.StockfishFull && !LP.StockfishFull.failed() ? LP.StockfishFull : LP.Stockfish);
  LP.depthScale = () => ({ fast: 0.5, normal: 1, deep: 2.2 })[P.depth] || 1;
  const buzz = (n) => { if (P.haptic && navigator.vibrate) { try { navigator.vibrate(({ move: 8, capture: 18, castle: 12, check: [20, 40, 20], win: [30, 50, 30, 50, 60], lose: 80, goal: 25 })[n] || 0); } catch (e) { /* not supported */ } } };

  /* ------------------------------------------------------------------ Settings rows (profile.js puts these in its sheet) */
  const row = (id, label, sub, on) => '<label class="set-row" for="' + id + '"><span class="set-tx"><b>' + label + '</b><small>' + sub + '</small></span><input type="checkbox" id="' + id + '" class="set-check"' + (on ? ' checked' : '') + '></label>';
  const seg = (key, label, sub, opts) => '<div class="set-row col"><span class="set-tx"><b>' + label + '</b><small>' + sub + '</small></span><div class="seg" data-seg="' + key + '">' + opts.map((o) => '<button type="button" data-v="' + o[0] + '"' + (String(P[key]) === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('') + '</div></div>';
  const PRESETS = [['Classic', '#eeeed2', '#769656'], ['Night', '#8d9db3', '#3b4a63'], ['Mint', '#e3f2e9', '#5fae8a'], ['Sand', '#f0e1c5', '#b58863'], ['Rose', '#f6e3e8', '#c4768c'], ['Ice', '#e8f1f7', '#6f9bbd']];
  /** Which saved values each group resets to default. */
  const GROUPS = {
    sound: { t: 'Sound and motion', keys: ['sound', 'volume', 'anim', 'haptic'], open: true },
    board: { t: 'Board colours', keys: ['light', 'dark'], open: true },
    games: { t: 'Games', keys: ['warn', 'spectate', 'premove', 'preGhost', 'annot', 'quick', 'shortcuts', 'input', 'autoq', 'newsPopup'], open: true },
    moves: { t: 'Move display', keys: ['nolast', 'nocoords', 'notation'], open: false },
    engine: { t: 'Engine and analysis', keys: ['engine', 'depth'], open: false },
    access: { t: 'Accessibility', keys: ['cb', 'hc', 'big'], open: false },
    data: { t: 'Help and data', keys: [], open: false },
  };
  const grp = (id, body) => '<details class="set-grp" data-g="' + id + '"' + (GROUPS[id].open ? ' open' : '') + '><summary><span class="set-h">' + GROUPS[id].t + '</span>' + (GROUPS[id].keys.length ? '<button type="button" class="set-reset" data-reset="' + id + '">Reset</button>' : '') + '</summary>' + body + '</details>';
  prefs.rows = () =>
    grp('sound',
      row('pf-sound', 'Sound effects', 'Moves, captures, check, goals and the end of a game.', P.sound) +
      '<label class="set-row col"><span class="set-tx"><b>Volume</b></span><input type="range" id="pf-vol" min="0" max="100" value="' + Math.round(P.volume * 100) + '" class="set-range"></label>' +
      row('pf-anim', 'Animations', 'Pieces slide and menus fade. Turn off for instant moves.', P.anim) +
      row('pf-haptic', 'Vibration', 'A small buzz on moves, captures and check (phones that support it).', P.haptic)) +
    grp('board',
      '<div class="set-preview" id="pf-prev" aria-hidden="true">' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => '<i class="' + (i % 2 ? 'd' : 'l') + '"></i>').join('') + '</div>' +
      '<div class="set-colors"><label>Light squares <input type="color" id="pf-light" value="' + (P.light || '#eeeed2') + '"></label><label>Dark squares <input type="color" id="pf-dark" value="' + (P.dark || '#769656') + '"></label><button class="btn" id="pf-creset" type="button">Use equipped board</button></div>' +
      '<div class="seg presets">' + PRESETS.map((p, i) => '<button type="button" data-pre="' + i + '"><i style="background:linear-gradient(90deg,' + p[1] + ' 50%,' + p[2] + ' 50%)"></i>' + p[0] + '</button>').join('') + '</div>') +
    grp('games',
      row('pf-warn', 'Warn before replacing a saved game', 'When all 5 save slots are full, ask before the oldest is replaced.', P.warn) +
      row('pf-spectate', 'Allow spectators', 'Other players can watch your games from the player list (online games and games against the computer). Turn this off to keep them private.', P.spectate) +
      row('pf-premove', 'Premoves', 'Queue moves while it is your opponent\'s turn in Classic, Bullet, Rapid and Online. Tap anywhere else to cancel them.', P.premove) +
      row('pf-ghost', 'Show premove pieces', 'Show a see-through copy of each piece where your queued premoves will put it.', P.preGhost) +
      row('pf-annot', 'Draw arrows and highlights', 'Right-click or Shift+click to draw on the board, and a pencil button for touch. Turn off if you click by accident.', P.annot) +
      row('pf-quick', 'Quick rematch', 'Show a Rematch button as soon as a game ends.', P.quick) +
      row('pf-keys', 'Keyboard shortcuts', 'N new game, R rematch, U undo, Y redo, F flip, H hint, P pause, M mute, ? help.', P.shortcuts) +
      row('pf-autoq', 'Always promote to a queen', 'Skip the piece choice when a pawn reaches the end.', P.autoq) +
      seg('input', 'Moving pieces', 'Tap a piece then a square, or also drag it.', [['both', 'Tap and drag'], ['tap', 'Tap only']]) +
      row('pf-news', 'Show what\'s new after an update', 'A small card with the highlights the first time you open the game after an update.', P.newsPopup)) +
    grp('moves',
      row('pf-nolast', 'Hide last move highlight', 'Do not colour the squares of the move just played.', P.nolast) +
      row('pf-nocoords', 'Hide board coordinates', 'Remove the letters and numbers on the edge of the board.', P.nocoords) +
      seg('notation', 'Notation', 'How moves are written in the move list.', [['san', 'Nf3'], ['fig', '♘f3']])) +
    grp('engine',
      seg('engine', 'Analysis engine', 'Used by Analyze and the Sandbox hint. Full is stronger, but needs the one-time 99 MB download.', [['lite', 'Stockfish Lite'], ['full', 'Stockfish']]) +
      seg('depth', 'Thinking time', 'Longer makes Analyze slower and its ratings more careful.', [['fast', 'Fast'], ['normal', 'Normal'], ['deep', 'Deep']])) +
    grp('access',
      row('pf-cb', 'Colour-blind friendly highlights', 'Blue and orange instead of green and red for highlights and check.', P.cb) +
      row('pf-hc', 'High contrast', 'Stronger borders, brighter text and clearer squares.', P.hc) +
      row('pf-big', 'Larger text', 'Make text and buttons about 15% bigger.', P.big)) +
    grp('data',
      '<div class="set-btns"><button class="btn" type="button" id="pf-lesson">Replay the chess lesson</button><button class="btn" type="button" id="pf-log">Open the update log</button>' +
      '<button class="btn" type="button" id="pf-export">Back up my data</button><button class="btn" type="button" id="pf-import">Restore from a backup</button><button class="btn" type="button" id="pf-reset-all">Reset all settings</button></div><input type="file" id="pf-file" accept="application/json,.json" class="hidden">' +
      '<p class="note">A backup is one file with your saves, stats, shop and settings. Restore it on another phone to carry on.</p>');
  prefs.bind = () => {
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onchange = fn; };
    const flag = (id, k, extra) => on(id, (e) => { prefs.set(k, e.target.checked); look2(); if (extra) extra(e.target.checked); });
    on('pf-sound', (e) => { prefs.set('sound', e.target.checked); if (e.target.checked) play('move'); });
    const v = $('#pf-vol'); if (v) { v.oninput = () => prefs.set('volume', v.value / 100); v.onchange = () => play('capture'); }
    on('pf-anim', (e) => { prefs.set('anim', e.target.checked); animClass(); });
    flag('pf-haptic', 'haptic', (x) => { if (x) buzz('check'); });
    on('pf-warn', (e) => prefs.set('warn', e.target.checked));
    on('pf-quick', (e) => prefs.set('quick', e.target.checked));
    on('pf-premove', (e) => prefs.set('premove', e.target.checked));
    on('pf-spectate', (e) => { prefs.set('spectate', e.target.checked); if (LP.players && LP.players.beat) LP.players.beat(); });
    on('pf-keys', (e) => prefs.set('shortcuts', e.target.checked));
    on('pf-autoq', (e) => prefs.set('autoq', e.target.checked));
    on('pf-ghost', (e) => prefs.set('preGhost', e.target.checked));
    on('pf-annot', (e) => prefs.set('annot', e.target.checked));
    on('pf-news', (e) => prefs.set('newsPopup', e.target.checked));
    flag('pf-nolast', 'nolast'); flag('pf-nocoords', 'nocoords'); flag('pf-cb', 'cb'); flag('pf-hc', 'hc'); flag('pf-big', 'big');
    // colours, with a live preview and presets
    const paintPrev = () => { const p = $('#pf-prev'); if (p) { p.style.setProperty('--pl', P.light || '#eeeed2'); p.style.setProperty('--pd', P.dark || '#769656'); } };
    paintPrev();
    const col = (id, k) => { const e = $('#' + id); if (e) e.oninput = () => { prefs.set(k, e.value); if (LP.applyLook) LP.applyLook(); paintPrev(); }; };
    col('pf-light', 'light'); col('pf-dark', 'dark');
    const rs = $('#pf-creset');
    if (rs) rs.onclick = () => { prefs.set('light', ''); prefs.set('dark', ''); $('#pf-light').value = '#eeeed2'; $('#pf-dark').value = '#769656'; if (LP.applyLook) LP.applyLook(); paintPrev(); };
    document.querySelectorAll('[data-pre]').forEach((b) => { b.onclick = () => { const p = PRESETS[+b.dataset.pre]; prefs.set('light', p[1]); prefs.set('dark', p[2]); $('#pf-light').value = p[1]; $('#pf-dark').value = p[2]; if (LP.applyLook) LP.applyLook(); paintPrev(); }; });
    // segmented choices
    document.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { prefs.set(g.dataset.seg, b.dataset.v); g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); look2(); };
    }));
    // reset one group
    document.querySelectorAll('[data-reset]').forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        GROUPS[b.dataset.reset].keys.forEach((k) => { P[k] = DEF[k]; });
        save(); look2(); animClass(); if (LP.applyLook) LP.applyLook();
        if (LP.openSettings) LP.openSettings();
      };
    });
    // search: hides rows that do not match and opens the groups that have a match
    const q = $('#set-q');
    if (q) q.oninput = () => {
      const t = q.value.trim().toLowerCase();
      document.querySelectorAll('.set-grp').forEach((g) => {
        let any = false;
        g.querySelectorAll('.set-row, .set-colors, .set-preview, .seg.presets, .set-btns, .note').forEach((r) => { const hit = !t || r.textContent.toLowerCase().includes(t) || (/colou?r|board|light|dark|preset/.test(t) && g.dataset.g === 'board'); r.classList.toggle('hidden', !hit); if (hit) any = true; });
        g.classList.toggle('hidden', !any);
        if (t && any) g.open = true;
      });
      document.querySelectorAll('.set-gen .set-row').forEach((r) => r.classList.toggle('hidden', !!t && !r.textContent.toLowerCase().includes(t)));
    };
    // help and data
    const bt = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
    bt('pf-lesson', () => { if (LP.lesson) LP.lesson.start(); });
    bt('pf-log', () => { LP.closeSheet(); setTimeout(() => LP.updateLog && LP.updateLog.open(), 80); });
    bt('pf-export', () => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('localPieces') === 0) out[k] = localStorage.getItem(k); }
      const blob = new Blob([JSON.stringify({ app: 'local-pieces', saved: Date.now(), data: out })], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'local-pieces-backup.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    bt('pf-import', () => $('#pf-file').click());
    on('pf-file', (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const j = JSON.parse(r.result);
          if (!j || j.app !== 'local-pieces' || !j.data) throw new Error('not a backup');
          if (!confirm('Replace the data on this device with this backup?')) return;
          Object.keys(j.data).forEach((k) => { if (k.indexOf('localPieces') === 0) localStorage.setItem(k, j.data[k]); });
          location.reload();
        } catch (x) { alert('That file is not a Local Pieces backup.'); }
      };
      r.readAsText(f);
    });
    bt('pf-reset-all', () => { if (!confirm('Reset every setting to its default? Your games and stats are kept.')) return; const l = P.last; P = Object.assign({}, DEF, { last: l }); save(); look2(); animClass(); if (LP.applyLook) LP.applyLook(); if (LP.openSettings) LP.openSettings(); });
  };
  look2();

  /* ------------------------------------------------------------------ keyboard shortcuts */
  const visible = (el) => el && !el.disabled && !el.classList.contains('hidden') && el.offsetParent !== null;
  const click = (sel) => { const e = $(sel); if (visible(e)) { e.click(); return true; } return false; };
  const sheetOpen = () => { const b = $('#sheet-bg'); return b && !b.classList.contains('hidden'); };
  function help() {
    LP.openSheet('<h2>Keyboard shortcuts</h2><div class="keys">' + [
      ['N', 'New game'], ['R', 'Rematch'], ['U / ←', 'Undo (or step back)'], ['Y / →', 'Redo (or step forward)'], ['F', 'Flip the board'],
      ['H', 'Hint'], ['P / Space', 'Pause'], ['M', 'Mute or unmute'], ['Esc', 'Close or go back'], ['?', 'This list'],
    ].map((k) => '<div><kbd>' + k[0] + '</kbd><span>' + k[1] + '</span></div>').join('') + '</div><button class="btn wide" id="kb-ok">Done</button>', true);
    $('#kb-ok').onclick = LP.closeSheet;
  }
  document.addEventListener('keydown', (e) => {
    if (!P.shortcuts || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const k = e.key;
    if (k === 'Escape') {
      if (sheetOpen()) { const bg = $('#sheet-bg'); if (bg.dataset.dismiss) LP.closeSheet(); return; }
      const pg = document.querySelector('.page.active');
      if (pg && pg.id !== 'menu') { const back = pg.querySelector('[id$="back"], #back-btn, .text-btn'); if (back) back.click(); }
      return;
    }
    if (sheetOpen()) return;
    const pg = document.querySelector('.page.active');
    const id = pg ? pg.id : '';
    let hit = false;
    if (k === '?') { help(); hit = true; }
    else if (k === 'm' || k === 'M') { prefs.set('sound', !P.sound); const m = $('#toast') ; if (id === 'game' && m) { m.textContent = P.sound ? 'Sound on' : 'Sound off'; m.classList.add('show'); setTimeout(() => m.classList.remove('show'), 900); } hit = true; }
    else if (id === 'game') {
      if (k === 'n' || k === 'N') hit = click('#reset-btn') || click('#st-opts');
      else if (k === 'r' || k === 'R') hit = click('#st-again');
      else if (k === 'u' || k === 'U' || k === 'ArrowLeft') hit = click('#undo-btn');
      else if (k === 'y' || k === 'Y' || k === 'ArrowRight') hit = click('#redo-btn');
      else if (k === 'f' || k === 'F') hit = click('#flip-btn');
      else if (k === 'h' || k === 'H') hit = click('#hint-btn');
      else if (k === 'p' || k === 'P' || k === ' ') hit = click('#pause-btn') || click('#rp-play');
    } else if (id === 'hockey') {
      if (k === 'p' || k === 'P' || k === ' ') hit = click('#hk-rp-play') || click('#hk-pause');
      else if (k === 'n' || k === 'N' || k === 'r' || k === 'R') hit = click('#hk-reset');
    } else if (id === 'rush') {
      if (k === 'p' || k === 'P' || k === ' ') hit = click('#rs-pause') || click('#rp-play');
    }
    if (hit) e.preventDefault();
  });
})();
