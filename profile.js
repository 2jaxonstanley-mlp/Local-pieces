/**
 * Your local profile: the main username (top right of the menu) and one Elo rating each for Classic, Bullet and Rapid.
 * Ratings only move in online games against real players (see recordOnline). Classic keeps its old rating, Bullet and Rapid start at 1000.
 * Profile picture and game settings (hints, move strength, auto-flip) are saved on this device.
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const KEY = 'localPieces.profile';
  const SETTINGS_KEY = 'localPieces.settings';
  const START = 800, FLOOR = 100;
  const START_OF = { basic: 800, bullet: 1000, rapid: 1000 };   // Classic keeps the rating people already had
  const BOT = { dumb: 10, easy: 150, medium: 600, hard: 1100, godly: 1800, insane: 2200, brilliant: 3000, patricia: 3200, stockfish: 3300, stockfishfull: 3500, copycat: 2500 };
  const MODES = { basic: 'Classic', bullet: 'Bullet', rapid: 'Rapid' };
  const blank = () => ({ w: 0, l: 0, d: 0 });
  const DEFAULT_SETTINGS = { hints: true, ratings: true, autoFlip: true };
  let P = { name: '', elo: { basic: START, bullet: 1000, rapid: 1000 }, rec: { basic: blank() }, on: { basic: blank(), bullet: blank(), rapid: blank() }, pfp: '' };
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) P = Object.assign(P, s, { elo: Object.assign(P.elo, s.elo || {}), rec: { basic: Object.assign(blank(), (s.rec || {}).basic) }, on: { basic: Object.assign(blank(), (s.on || {}).basic), bullet: Object.assign(blank(), (s.on || {}).bullet), rapid: Object.assign(blank(), (s.on || {}).rapid) }, pfp: s.pfp || '' });
    delete P.elo.secret;   // Secret Queen no longer has a rating
  } catch (e) { /* ignore */ }
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s && typeof s === 'object') settings = Object.assign({}, DEFAULT_SETTINGS, s);
  } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* ignore */ } };
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  const elo = (mode) => (P.elo[mode] != null ? P.elo[mode] : (START_OF[mode] || START));
  const games = (mode) => P.on[mode].w + P.on[mode].l + P.on[mode].d;
  /** The average of the Classic, Bullet and Rapid ratings: the number shown on your profile and on the Elo leaderboard. */
  const avg = () => Math.round(Object.keys(MODES).reduce((a, m) => a + elo(m), 0) / Object.keys(MODES).length);
  const played = () => Object.keys(MODES).reduce((a, m) => a + games(m), 0);

  /** An online game against a real player. score: 1 win, 0.5 draw, 0 loss. oppElo = their rating in the same mode.
   *  Returns { before, after, delta, opp } and has already saved it. */
  function recordOnline(mode, oppElo, score) {
    if (!MODES[mode]) return null;
    const before = elo(mode), opp = oppElo > 0 ? oppElo : (START_OF[mode] || START);
    const expected = 1 / (1 + Math.pow(10, (opp - before) / 400));
    const k = games(mode) < 10 ? 40 : 28;                       // new players settle faster
    const after = Math.max(FLOOR, Math.round(before + k * (score - expected)));
    P.elo[mode] = after;
    P.on[mode][score === 1 ? 'w' : score === 0 ? 'l' : 'd']++;
    save(); render();
    return { before, after, delta: after - before, opp };
  }

  function setName(n) { P.name = String(n || '').trim().slice(0, 16); save(); render(); }
  function setPfp(dataUrl) { P.pfp = dataUrl || ''; save(); render(); }

  function avHtml(sizeCls) {
    if (P.pfp) return '<span class="acct-av ' + (sizeCls || '') + '" style="background-image:url(' + P.pfp + ');background-size:cover;background-position:center"></span>';
    const letter = P.name ? P.name[0].toUpperCase() : '?';
    return '<span class="acct-av ' + (sizeCls || '') + '">' + esc(letter) + '</span>';
  }

  function render() {
    const nm = P.name;
    const av = $('#acct-av');
    if (P.pfp) {
      av.textContent = '';
      av.style.backgroundImage = 'url(' + P.pfp + ')';
      av.style.backgroundSize = 'cover';
      av.style.backgroundPosition = 'center';
      av.classList.add('has-pfp');
    } else {
      av.textContent = nm ? nm[0].toUpperCase() : '?';
      av.style.backgroundImage = '';
      av.classList.remove('has-pfp');
    }
    $('#acct-name').textContent = nm || 'Set name';
    $('#acct-elo').textContent = nm ? 'Elo ' + avg() : 'Tap to set up';
  }

  function resizeImage(file, maxSize, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const scale = Math.min(1, maxSize / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const isPng = (file.type || '').indexOf('png') >= 0;
        let data = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85);
        if (data.length > 160000) data = canvas.toDataURL('image/jpeg', 0.7);
        if (data.length > 160000) data = canvas.toDataURL('image/jpeg', 0.55);
        cb(data);
      };
      img.onerror = () => cb(null);
      img.src = reader.result;
    };
    reader.onerror = () => cb(null);
    reader.readAsDataURL(file);
  }

  function sheet() {
    const card = (m) => { const r = P.on[m]; return '<div class="pf-card"><small>' + MODES[m] + '</small><b>' + elo(m) + '</b><span>' + r.w + 'W &middot; ' + r.l + 'L &middot; ' + r.d + 'D</span></div>'; };
    LP.openSheet('<h2>Your profile<span class="sub">Your name, picture and ratings are saved on this device.</span></h2>' +
      '<div class="pf-av-row">' +
        '<div class="pf-av-preview" id="pf-av-preview">' + avHtml('pf-av-lg') + '</div>' +
        '<div class="pf-av-actions">' +
          '<label class="btn" for="pf-file">Add photo</label>' +
          '<input id="pf-file" type="file" accept="image/*" class="hidden" aria-hidden="true">' +
          '<button class="btn" id="pf-clear"' + (P.pfp ? '' : ' disabled') + '>Remove</button>' +
        '</div>' +
      '</div>' +
      '<label for="pf-name">Username</label>' +
      '<input id="pf-name" type="text" maxlength="16" autocomplete="off" autocapitalize="words" placeholder="Player" enterkeyhint="done">' +
      '<div class="pf-cards">' + card('basic') + card('bullet') + card('rapid') + '</div>' +
      '<p class="note">Average Elo: <b>' + avg() + '</b>. Ratings only change in online games against real players: Classic (no clock), Bullet (1 and 3 minute games) and Rapid (5 and 10 minute games).</p>' +
      '<button class="btn wide" id="pf-tour" style="margin-top:.8rem">Replay tutorial</button>' +
      '<div class="row" style="margin-top:.6rem"><button class="btn" id="pf-x">Close</button><button class="btn primary" id="pf-ok">Save</button></div>', true);
    const tour = $('#pf-tour');
    if (tour) tour.onclick = () => { setName($('#pf-name').value); if (LP.tutorial) LP.tutorial.replay(); };
    $('#pf-name').value = P.name;
    const preview = $('#pf-av-preview');
    const clearBtn = $('#pf-clear');
    const refreshPreview = () => {
      preview.innerHTML = avHtml('pf-av-lg');
      clearBtn.disabled = !P.pfp;
    };
    $('#pf-file').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      resizeImage(f, 256, (data) => {
        if (data) { setPfp(data); refreshPreview(); }
        e.target.value = '';
      });
    };
    clearBtn.onclick = () => { setPfp(''); refreshPreview(); };
    const ok = () => { setName($('#pf-name').value); LP.closeSheet(); };
    $('#pf-ok').onclick = ok;
    $('#pf-x').onclick = LP.closeSheet;
    $('#pf-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  function settingsSheet() {
    const row = (id, label, sub, on) => '<label class="set-row" for="' + id + '">' +
        '<span class="set-tx"><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></span>' +
        '<input type="checkbox" id="' + id + '" class="set-check"' + (on ? ' checked' : '') + '>' +
      '</label>';
    LP.openSheet('<h2>Settings<span class="sub">Defaults for new games. Change them any time.</span></h2>' +
      '<input type="search" id="set-q" class="text-in set-search" placeholder="Search settings" autocomplete="off">' +
      '<div class="set-list"><div class="set-gen">' +
        row('set-hints', 'Legal move hints', 'Show dots where the selected piece can move.', settings.hints) +
        row('set-ratings', 'Opening book labels', 'Mark book moves and show the opening name while you play. Full move ratings are in Analyze game.', settings.ratings) +
        row('set-flip', 'Auto-flip board', 'In two-player games, turn the board toward the player to move.', settings.autoFlip) +
        '</div>' + (LP.prefs ? LP.prefs.rows() : '') +
      '</div>' +
      '<p class="note">These apply automatically when you start a game — no more prompts each time.</p>' +
      '<div class="row"><button class="btn primary" id="set-ok" style="flex:1">Done</button></div>', true);
    const sync = () => {
      settings.hints = $('#set-hints').checked;
      settings.ratings = $('#set-ratings').checked;
      settings.autoFlip = $('#set-flip').checked;
      saveSettings();
      if (LP.applySettings) LP.applySettings(settings);
    };
    ['set-hints', 'set-ratings', 'set-flip'].forEach((id) => { $('#' + id).onchange = sync; });
    if (LP.prefs) LP.prefs.bind();
    $('#set-ok').onclick = () => { sync(); LP.closeSheet(); };
  }

  LP.openSettings = () => { LP.closeSheet(); setTimeout(settingsSheet, 60); };
  $('#acct').addEventListener('click', sheet);
  const gear = $('#settings-btn');
  if (gear) gear.addEventListener('click', settingsSheet);

  LP.profile = {
    name: () => P.name,
    rec: (m) => Object.assign(blank(), P.on[m]),
    avg,
    played,
    on: (m) => Object.assign(blank(), P.on[m]),
    setName,
    elo,
    recordOnline,
    botRating: (l) => BOT[l],
    MODES,
    pfp: () => P.pfp,
    settings: () => Object.assign({}, settings),
    openSettings: settingsSheet,
  };
  render();
})();
