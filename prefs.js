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
  const DEF = { sound: true, volume: 0.6, anim: true, warn: true, quick: true, shortcuts: true, light: '', dark: '', last: {} };
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

  /* ------------------------------------------------------------------ Settings rows (profile.js puts these in its sheet) */
  const row = (id, label, sub, on) => '<label class="set-row" for="' + id + '"><span class="set-tx"><b>' + label + '</b><small>' + sub + '</small></span><input type="checkbox" id="' + id + '" class="set-check"' + (on ? ' checked' : '') + '></label>';
  prefs.rows = () =>
    '<h3 class="set-h">Sound and motion</h3>' +
    row('pf-sound', 'Sound effects', 'Moves, captures, check, goals and the end of a game.', P.sound) +
    '<label class="set-row"><span class="set-tx"><b>Volume</b></span><input type="range" id="pf-vol" min="0" max="100" value="' + Math.round(P.volume * 100) + '" class="set-range"></label>' +
    row('pf-anim', 'Animations', 'Pieces slide and menus fade. Turn off for instant moves.', P.anim) +
    '<h3 class="set-h">Board colours</h3>' +
    '<div class="set-colors"><label>Light squares <input type="color" id="pf-light" value="' + (P.light || '#eeeed2') + '"></label><label>Dark squares <input type="color" id="pf-dark" value="' + (P.dark || '#769656') + '"></label><button class="btn" id="pf-creset" type="button">Use equipped board</button></div>' +
    '<h3 class="set-h">Games</h3>' +
    row('pf-warn', 'Warn before replacing a saved game', 'When all 5 save slots are full, ask before the oldest is replaced.', P.warn) +
    row('pf-quick', 'Quick rematch', 'Show a Rematch button as soon as a game ends.', P.quick) +
    row('pf-keys', 'Keyboard shortcuts', 'N new game, R rematch, U undo, Y redo, F flip, H hint, P pause, M mute, ? help.', P.shortcuts);
  prefs.bind = () => {
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onchange = fn; };
    on('pf-sound', (e) => { prefs.set('sound', e.target.checked); if (e.target.checked) play('move'); });
    const v = $('#pf-vol'); if (v) { v.oninput = () => prefs.set('volume', v.value / 100); v.onchange = () => play('capture'); }
    on('pf-anim', (e) => { prefs.set('anim', e.target.checked); animClass(); });
    on('pf-warn', (e) => prefs.set('warn', e.target.checked));
    on('pf-quick', (e) => prefs.set('quick', e.target.checked));
    on('pf-keys', (e) => prefs.set('shortcuts', e.target.checked));
    const col = (id, k) => { const e = $('#' + id); if (e) e.oninput = () => { prefs.set(k, e.value); if (LP.applyLook) LP.applyLook(); }; };
    col('pf-light', 'light'); col('pf-dark', 'dark');
    const rs = $('#pf-creset');
    if (rs) rs.onclick = () => { prefs.set('light', ''); prefs.set('dark', ''); $('#pf-light').value = '#eeeed2'; $('#pf-dark').value = '#769656'; if (LP.applyLook) LP.applyLook(); };
  };

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
