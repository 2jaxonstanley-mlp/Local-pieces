/**
 * Daily tasks and the shop. Tasks pay out tokens, tokens buy crates, crates hold cosmetic items
 * (board colours, piece colours and little accessories for the kings). Everything is saved on this device.
 * Other files report what happened with LP.rewards.event(name, payload).
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const SKEY = 'localPieces.shop', DKEY = 'localPieces.daily';
  const COST = 5;
  const RARITY = {
    common:    { name: 'Common',    w: 60, c: '#b3b3b3', refund: 1 },
    rare:      { name: 'Rare',      w: 28, c: '#4f9cf5', refund: 2 },
    epic:      { name: 'Epic',      w: 10, c: '#b066f0', refund: 3 },
    legendary: { name: 'Legendary', w: 2,  c: '#f5b82e', refund: 5 },
  };

  /* ------------------------------------------------------------------ items */
  const BOARDS = [
    ['walnut', 'Walnut', '#e8d3b0', '#a67c52', 'common'], ['ocean', 'Ocean', '#dfe9ee', '#5f8fa8', 'common'],
    ['slate', 'Slate', '#5f6c75', '#42535d', 'common'],
    ['sand', 'Sand', '#f3e6c8', '#c9a66b', 'common'], ['rose', 'Rose', '#f6e3e3', '#c78a93', 'common'],
    ['forest', 'Forest', '#d8e2c4', '#3f6b45', 'rare'],
    ['amethyst', 'Amethyst', '#e6dcef', '#7c5ea8', 'rare'], ['coral', 'Coral', '#fbe4d8', '#e0795a', 'rare'],
  ].map(([id, name, l, d, r]) => ({ id, name, l, d, r }));
  BOARDS.push({ id: 'grass', name: 'Grass & Dirt', l: '#0e7a06', d: '#70420a', li: 'url(board-grass.png)', di: 'url(board-dirt.png)', r: 'epic' });
  BOARDS.push({ id: 'wood', name: 'Wooden', l: '#ecd0a0', d: '#9e6a3e', li: 'url(board-wood-light.png)', di: 'url(board-wood-dark.png)', wood: true, r: 'epic' });
  BOARDS.push({ id: 'marble', name: 'Marble', l: '#efece6', d: '#25262c', li: 'url(board-marble-light.png)', di: 'url(board-marble-dark.png)', smooth: true, r: 'epic' });
  BOARDS.push({ id: 'realism', name: 'Realism', l: '#cfcbc4', d: '#5b3a1c', li: 'url(board-real-light.png)', di: 'url(board-real-dark.png)', tile: true, r: 'epic' });
  BOARDS.push({ id: 'cosmic', name: 'Cosmic', l: '#dedcea', d: '#3a1c7a', li: 'url(board-cosmic-light.png)', di: 'url(board-cosmic-dark.png)', smooth: true, r: 'legendary' });
  BOARDS.push({ id: 'doodle', name: 'Doodle', l: '#f3f1da', d: '#7ea35a', doodle: true, r: 'rare' });   // Classic colours, drawn by hand
  BOARDS.push({ id: 'metal', name: 'Metal', l: '#cccccc', d: '#787878', li: 'url(board-metal-light.png)', di: 'url(board-metal-dark.png)', flat: true, r: 'epic' });
  BOARDS.push({ id: 'stone', name: 'Stone', l: '#ada9a3', d: '#4f4e4b', li: 'url(board-stone-light.png)', di: 'url(board-stone-dark.png)', flat: true, r: 'rare' });
  BOARDS.push({ id: 'newspaper', name: 'Newspaper', l: '#cac8c0', d: '#a3a29b', li: 'url(board-newspaper-light.png)', di: 'url(board-newspaper-dark.png)', flat: true, r: 'epic' });
  BOARDS.push({ id: 'neonboard', name: 'Neon Grid', l: '#1b1550', d: '#09071f', neon: true, r: 'legendary' });
  const PIECES = [];
  /* picture packs: one sprite sheet each (white P B Q K N R, then black P B Q K N R), and the CSS-drawn neon pack */
  PIECES.push({ id: 'realism', name: 'Realism', pk: 'sheet', sheet: 'pk-realism-hd.png', r: 'common' });
  PIECES.push({ id: 'pixel', name: 'Pixel', pk: 'sheet', sheet: 'pk-pixel-hd.png', px: 1, r: 'rare' });
  PIECES.push({ id: 'pixelduo', name: 'Blue & Gold', pk: 'sheet', sheet: 'pk-pixelduo-hd.png', px: 1, r: 'epic' });
  PIECES.push({ id: 'wood', name: 'Wooden', pk: 'sheet', sheet: 'pk-wood-hd.png', r: 'epic' });
  PIECES.push({ id: 'sandy', name: 'Sandy', pk: 'sheet', sheet: 'pk-sandy-hd.png', r: 'legendary' });
  PIECES.push({ id: 'silvergold', name: 'Silver & Gold', pk: 'sheet', sheet: 'pk-silvergold-hd.png', r: 'epic' });
  PIECES.push({ id: 'stickman', name: 'Stickman', pk: 'sheet', sheet: 'pk-stickman-hd.png', r: 'rare' });
  PIECES.push({ id: 'condal', name: 'Condal', pk: 'sheet', sheet: 'pk-condal-hd.png', r: 'epic' });
  PIECES.push({ id: 'light', name: 'Light', pk: 'sheet', sheet: 'pk-light-hd.png', r: 'rare' });
  PIECES.push({ id: 'space', name: 'Space', pk: 'sheet', sheet: 'pk-space-hd.png', r: 'epic' });
  PIECES.push({ id: 'neon', name: 'Neon', pk: 'neon', r: 'legendary' });
  const HATS = [
    ['grad', 'Graduate', 'common'], ['sun', 'Sun Hat', 'common'], ['hard', 'Hard Hat', 'common'], ['party', 'Party Hat', 'common'],
    ['top', 'Top Hat', 'rare'], ['helm', 'Helmet', 'rare'], ['cowboy', 'Cowboy Hat', 'rare'], ['antlers', 'Antlers', 'rare'],
    ['crown', 'Crown', 'rare'], ['halo', 'Halo', 'rare'],
    ['wizard', 'Wizard Hat', 'epic'], ['bunny', 'Bunny Hat', 'epic'], ['pirate', 'Pirate Hat', 'epic'], ['horns', 'Horns', 'epic'], ['pawnhat', 'Pawn Hat', 'epic'],
    ['mini', 'Mini Me', 'legendary'],
  ].map(([id, name, r]) => ({ id, name, r }));
  /* app backgrounds: plain colours, and one legendary where you insert your own picture (kept on this device) */
  const BGS = [
    { id: 'green', name: 'Green', bg: '#12351f', panel: '#1b4a2c', panel2: '#255a38', line: '#2f6b46', acc: '#5fd38a', r: 'common' },
  ];
  /* the other colour themes are made from one colour: the panels and lines are that colour a little lighter, and acc tints highlights */
  const lift = (hex, t) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(v + (255 - v) * t); return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join(''); };
  [['blue', 'Blue', '#10233d', '#4f9cf5', 'common'], ['teal', 'Teal', '#0f302f', '#2fd4c0', 'common'], ['purple', 'Purple', '#21143a', '#b066f0', 'rare'],
   ['crimson', 'Crimson', '#38141a', '#ff6b6b', 'rare'], ['gold', 'Gold', '#2f2510', '#f5b82e', 'epic'], ['pink', 'Pink', '#3a1530', '#ff7ac8', 'epic']]
    .forEach(([id, name, bg, acc, r]) => BGS.push({ id, name, bg, panel: lift(bg, .08), panel2: lift(bg, .14), line: lift(bg, .24), acc, r }));
  /* two legendary backgrounds that move slowly (still, if the device asks for less motion) */
  BGS.push({ id: 'aurora', name: 'Aurora', bg: '#0a1a28', panel: '#13293b', panel2: '#1b3a50', line: '#2a5470', acc: '#4ade80', anim: 'aurora', r: 'legendary' });
  BGS.push({ id: 'stars', name: 'Starfield', bg: '#080a1c', panel: '#12152d', panel2: '#1a1e3d', line: '#2b3160', acc: '#8fb4ff', anim: 'stars', r: 'legendary' });
  BGS.push({ id: 'custom', name: 'Your Image', custom: true, r: 'legendary' });
  const IMGKEY = 'localPieces.customBg';
  const RETRO = { id: '', name: 'Retro', pk: 'sheet', sheet: 'pk-retro-hd.png' };   // the main skin everyone starts with
  const CRATES = {
    board: { name: 'Board Crate', slot: 'board', items: BOARDS, color: '#7cb342', badge: '▦' },
    piece: { name: 'Piece Crate', slot: 'piece', items: PIECES, color: '#f08c3a', badge: '<i class="ic-sp" style="--i:2;width:100%;height:100%"></i>' },
    hat:   { name: 'Accessory Crate', slot: 'hat', items: HATS, color: '#e8587a', badge: '★' },
    bg:    { name: 'Background Crate', slot: 'bg', items: BGS, color: '#2fa58a', badge: '▣' },
  };

  /* ------------------------------------------------------------------ saved state */
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  let S = Object.assign({ tokens: null, owned: {}, equipped: { board: '', piece: '', hat: '', bg: '' } }, read(SKEY, {}));
  /* Each player has their own piece set and accessory: slots.p1 is you (Player 1), slots.p2 is the opponent (the computer or a guest).
     hatOn is the list of piece types (k q r b n p) that wear the accessory. */
  if (!S.slots) {
    const old = S.equipped || {}, tm = S.skinTeam || 'wb', on = S.hatOn || 'k';
    S.slots = {
      p1: { piece: tm.indexOf('w') >= 0 ? old.piece || '' : '', hat: old.hat || '', hatOn: on },
      p2: { piece: tm.indexOf('b') >= 0 ? old.piece || '' : '', hat: old.hat || '', hatOn: on },
    };
  }
  ['p1', 'p2'].forEach((k) => { S.slots[k] = Object.assign({ piece: '', hat: '', hatOn: 'k' }, S.slots[k] || {}); });
  const slotOf = (isBlack) => { const m = (LP.sides && LP.sides()) || { w: 'p1', b: 'p2' }; return S.slots[m[isBlack ? 'b' : 'w']] || S.slots.p1; };
  if (S.tokens == null) S.tokens = 5;                  // a welcome gift, enough for the first crate
  const saveS = () => write(SKEY, S);
  // boards that were taken out of the shop: owners get the price of a crate back for each one
  const REMOVED = { 'board:sage': 'Sage board', 'board:dusk': 'Dusk board', 'hat:cap': 'Cap', 'hat:blossom': 'Blossom', 'hat:clover': 'Clover' };
  const refunded = [];
  Object.keys(REMOVED).forEach((k) => { if (S.owned[k]) { delete S.owned[k]; S.tokens += COST; refunded.push(REMOVED[k]); } });
  ['p1', 'p2'].forEach((w) => { if (S.slots[w].hat && !(HATS.some((h) => h.id === S.slots[w].hat))) { S.slots[w].hat = ''; S.slots[w].hatOn = 'k'; } });
  // anything equipped that no longer exists (removed items) falls back to the default look
  const stillThere = (slot, id) => !id || (CRATES[slot] && CRATES[slot].items.some((x) => x.id === id));
  S.equipped.bg = S.equipped.bg || '';
  ['board', 'piece', 'hat', 'bg'].forEach((k) => { if (!stillThere(k, S.equipped[k])) S.equipped[k] = ''; });
  saveS();
  if (refunded.length) setTimeout(() => popup('Removed: ' + refunded.join(', ') + '. Refunded <b>' + refunded.length * COST + '</b> tokens'), 1800);

  /* ------------------------------------------------------------------ cosmetics */
  const find = (slot, id) => CRATES[slot].items.find((x) => x.id === id);

  /* Doodle board: every square is a little pencil and crayon drawing, made once as an SVG picture. Six different light and six dark
     squares are handed out in turn, so no two neighbours look alike, and each one has crooked, overshooting outline strokes. */
  function doodleTile(dark, seed) {
    let a = (seed * 2654435761 + (dark ? 977 : 31)) >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const j = (n) => (rnd() - 0.5) * 2 * n, f = (n) => n.toFixed(1);
    const stroke = (x1, y1, x2, y2, w) => `<path d="M${f(x1)} ${f(y1)}Q${f((x1 + x2) / 2 + j(2.4))} ${f((y1 + y2) / 2 + j(2.4))} ${f(x2)} ${f(y2)}" stroke-width="${f(w)}"/>`;
    let fill = '', fill2 = '';
    if (dark) {
      const slope = 22 + rnd() * 16;
      for (let y = 2; y < 100 + slope; y += 5.6 + rnd() * 2) fill += stroke(-4 + j(3), y + j(2), 104 + j(3), y - slope + j(5), 3.4 + rnd() * 1.8);
      for (let y = 10; y < 100 + slope; y += 13 + rnd() * 6) fill2 += stroke(104 + j(3), y + j(2), -4 + j(3), y - slope * 0.7 + j(5), 2 + rnd());
    } else {
      for (let k = 0; k < 4; k++) fill += stroke(6 + j(8), 14 + k * 24 + j(6), 94 + j(8), 6 + k * 24 + j(8), 1.2 + rnd());
    }
    const m = 3.4;
    let edge = '';
    for (let pass = 0; pass < 2; pass++) {
      const w = pass ? 1.3 : 2;
      edge += stroke(m - 3 + j(2), m + j(1.4), 100 - m + 3 + j(2), m + j(1.4), w) + stroke(100 - m + j(1.4), m - 3 + j(2), 100 - m + j(1.4), 100 - m + 3 + j(2), w)
        + stroke(100 - m + 3 + j(2), 100 - m + j(1.4), m - 3 + j(2), 100 - m + j(1.4), w) + stroke(m + j(1.4), 100 - m + 3 + j(2), m + j(1.4), m - 3 + j(2), w);
    }
    const grain = (id, k, off) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${k}" numOctaves="2" seed="${seed * 7 + off}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 1.9" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs>${grain('g', 0.9, 1)}${grain('h', 0.55, 2)}</defs>`
      + `<rect width="100" height="100" fill="${dark ? '#eef0dc' : '#f6f4e0'}"/>`
      + (dark ? `<g fill="none" stroke="#7ea35a" stroke-linecap="round" opacity=".92" filter="url(#g)">${fill}</g><g fill="none" stroke="#557d3a" stroke-linecap="round" opacity=".55" filter="url(#g)">${fill2}</g>`
        : `<g fill="none" stroke="#9a9684" stroke-linecap="round" opacity=".28" filter="url(#g)">${fill}</g>`)
      + `<g fill="none" stroke="#2f2f33" stroke-linecap="round" opacity=".88" filter="url(#h)">${edge}</g></svg>`;
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  let doodleDone = false;
  function ensureDoodle() {
    if (doodleDone) return;
    doodleDone = true;
    const root = document.documentElement.style;
    for (let k = 0; k < 6; k++) { root.setProperty('--dd-l' + k, doodleTile(false, k + 1)); root.setProperty('--dd-d' + k, doodleTile(true, k + 1)); }
  }
  function apply() {
    const root = document.documentElement.style;
    const b = find('board', S.equipped.board), p = find('piece', S.slots.p1.piece) || RETRO;
    if (b && b.doodle) ensureDoodle();
    root.setProperty('--light-sq', b ? b.l : '#eeeed2');
    root.setProperty('--dark-sq', b ? b.d : '#769656');
    root.setProperty('--light-img', b && b.li ? b.li : 'none');
    root.setProperty('--dark-img', b && b.di ? b.di : 'none');
    root.setProperty('--pw', p && p.w ? p.w : '#ffffff');
    root.setProperty('--pb', p && p.b ? p.b : '#1a1a1a');
    root.setProperty('--sheet', p && p.sheet ? 'url(' + p.sheet + ')' : 'none');
    document.body.dataset.bd = b && b.neon ? 'neon' : b && b.doodle ? 'doodle' : b && (b.wood || b.smooth) ? 'wood' : b && b.tile ? 'tile' : b && b.flat ? 'flat' : '';
    const bgi = find('bg', S.equipped.bg), pic = bgi && bgi.custom ? customImg() : '';
    root.setProperty('--bg', bgi && bgi.bg ? bgi.bg : '#1f1f1f');
    root.setProperty('--panel', bgi && bgi.panel ? bgi.panel : '#2b2b2b');
    root.setProperty('--panel-2', bgi && bgi.panel2 ? bgi.panel2 : '#363636');
    root.setProperty('--line', bgi && bgi.line ? bgi.line : '#404040');
    root.setProperty('--bg-img', pic ? 'url(' + pic + ')' : 'none');
    root.setProperty('--acc', bgi && bgi.acc ? bgi.acc : '#ffffff');
    document.body.dataset.bgk = pic ? 'img' : bgi && bgi.anim ? bgi.anim : '';
    document.body.dataset.pack = '1';
    PK = p && p.pk ? p.pk : '';
    PX = p && p.px ? '1' : '';
    if (LP.prefs && LP.prefs.look) LP.prefs.look();     // custom board colours from Settings win over the equipped board
    tagKings();
  }
  let PK = '', PX = '';
  const KIND = { 0x265A: 'k', 0x265B: 'q', 0x265C: 'r', 0x265D: 'b', 0x265E: 'n', 0x265F: 'p' };
  const SHEET_AT = { p: 0, b: 1, q: 2, k: 3, n: 4, r: 5 };
  /* Where each piece set has its "head" (centre x and top y, as % of the picture), so accessories can sit on any piece of any set */
  const customImg = () => { try { return localStorage.getItem(IMGKEY) || ''; } catch (e) { return ''; } };
  const ANCH = {"silvergold":{"p":[50.0,34.8],"b":[49.0,17.6],"q":[49.6,16.0],"k":[50.0,2.7],"n":[52.7,23.0],"r":[49.6,25.0]},"sandy":{"p":[49.8,28.1],"b":[50.8,14.8],"q":[50.2,14.8],"k":[49.8,2.7],"n":[50.6,21.9],"r":[49.8,20.7]},"":{"p":[50.8,15.6],"b":[51.0,10.2],"q":[49.2,8.6],"k":[49.4,8.6],"n":[44.7,12.5],"r":[49.8,7.8]},"realism":{"p":[50.2,26.6],"b":[49.4,17.2],"q":[48.8,17.2],"k":[49.2,6.2],"n":[48.8,15.6],"r":[50.0,22.7]},"pixel":{"p":[49.8,23.4],"b":[49.4,6.2],"q":[49.4,7.0],"k":[49.8,6.2],"n":[52.3,7.0],"r":[49.4,13.3]},"pixelduo":{"p":[50.2,29.7],"b":[49.0,12.5],"q":[49.4,9.4],"k":[49.8,6.2],"n":[54.3,14.1],"r":[49.8,19.5]},"wood":{"p":[50.2,26.6],"b":[49.4,17.2],"q":[48.8,17.2],"k":[49.2,6.2],"n":[48.8,15.6],"r":[50.0,22.7]},"stickman":{"p":[53.1,18.0],"b":[47.3,12.7],"q":[46.4,8.2],"k":[46.9,15.4],"n":[46.9,14.5],"r":[50.0,20.7]},"condal":{"p":[44.5,23.4],"b":[40.2,16.9],"q":[46.0,22.6],"k":[47.8,16.9],"n":[38.4,22.6],"r":[52.8,22.6]},"light":{"p":[48.3,22.6],"b":[54.1,14.5],"q":[50.6,20.9],"k":[52.9,14.5],"n":[35.4,14.5],"r":[59.6,25.0]},"space":{"p":[46.3,19.9],"b":[47.0,11.1],"q":[47.2,16.7],"k":[46.9,16.7],"n":[51.9,11.9],"r":[53.0,20.7]},"neon":{"p":[50.0,14.0],"b":[50.0,8.0],"q":[50.0,8.0],"k":[50.0,4.0],"n":[41.0,12.0],"r":[50.0,12.0]}};
  const HAT_W = { k: 52, q: 52, b: 44, n: 50, r: 54, p: 46 };       // accessory width as % of the piece
  const SPRITE_HATS = { pawnhat: 1, mini: 1 };       // drawn from piece pictures rather than a flat SVG
  function hatPos(skinId, kind, hatId) {
    const a = (ANCH[skinId] || ANCH[''])[kind] || [50, 10];
    if (hatId === 'mini') return { x: 77, y: 57, w: 40 };                  // Mini Me stands in the bottom right corner of the square
    if (hatId === 'pawnhat') { const w = HAT_W[kind] * 0.62; return { x: a[0], y: Math.round((a[1] + (kind === 'k' ? 12 : 3) - 0.9 * w) * 10) / 10, w: Math.round(w * 10) / 10 }; }
    if (hatId === 'bunny') { const w = Math.round(HAT_W[kind] * 0.82 * 10) / 10; return { x: a[0], y: Math.round((a[1] + (kind === 'k' || kind === 'q' ? 7 : 2) - 0.6 * w) * 10) / 10, w }; }   // square picture: the face rests on top of the head, ears stick up, the flaps hang down the sides
    const w = HAT_W[kind];
    return { x: a[0], y: Math.round((a[1] + (kind === 'k' ? 12 : 3) - 0.5625 * w) * 10) / 10, w };
  }
  /* A picture-based piece set whose image file is missing would show empty squares, so check it loads and fall back to the Retro pieces if not */
  const sheetBad = {};
  function sheetOk(url) {
    if (!(url in sheetBad)) {
      sheetBad[url] = false;
      const im = new Image();
      im.onerror = () => { sheetBad[url] = true; try { tagKings(); } catch (e) { /* ignore */ } };
      im.src = url;
    }
    return !sheetBad[url];
  }
  const skinOf = (slot) => {
    const sk = find('piece', slot.piece) || RETRO;
    return sk.pk === 'sheet' && !sheetOk(sk.sheet) ? RETRO : sk;
  };
  /* pieces get their picture/neon look and the accessory: found by their glyph, so no other file has to know about it */
  function tagKings() {
    document.querySelectorAll('.piece:not([data-prev]), .cp').forEach((pe) => {
      const code = pe.textContent.charCodeAt(0), kind = KIND[code];
      const slot = slotOf(pe.classList.contains('b')), sk = skinOf(slot), pk = sk.pk || '', px = sk.px ? '1' : '';
      const h = find('hat', slot.hat), on = slot.hatOn || 'k';
      if (pk && kind) {
        if (pe.dataset.pk !== pk) pe.dataset.pk = pk;
        if (pe.dataset.k !== kind) pe.dataset.k = kind;
        if (px) { if (pe.dataset.px !== '1') pe.dataset.px = '1'; } else if (pe.dataset.px) delete pe.dataset.px;
        if (pk === 'sheet') {
          pe.style.setProperty('--px', ((SHEET_AT[kind] + (pe.classList.contains('b') ? 6 : 0)) / 11 * 100) + '%');
          const u = 'url(' + sk.sheet + ')';
          if (pe.style.getPropertyValue('--sheet') !== u) pe.style.setProperty('--sheet', u);
        } else pe.style.removeProperty('--sheet');
      } else if (pe.dataset.pk && !Number.isNaN(code)) { delete pe.dataset.pk; delete pe.dataset.k; delete pe.dataset.px; pe.style.removeProperty('--px'); pe.style.removeProperty('--sheet'); }
      if (pe.classList.contains('piece')) {
        if (h && kind && on.indexOf(kind) >= 0) {
          const key = h.id + kind + (sk.id || '_');
          if (pe.dataset.hatk !== key) {
            const hp = hatPos(sk.id || '', kind, h.id);
            pe.dataset.hat = h.id; pe.dataset.hatk = key;
            pe.style.setProperty('--hx', hp.x + '%'); pe.style.setProperty('--hy', hp.y + '%'); pe.style.setProperty('--hw', hp.w + '%');
          }
        } else if (pe.dataset.hat) { delete pe.dataset.hat; delete pe.dataset.hatk; pe.style.removeProperty('--hx'); pe.style.removeProperty('--hy'); pe.style.removeProperty('--hw'); }
      }
    });
  }
  let kt = 0;
  new MutationObserver(() => tagKings()).observe(document.getElementById('app'), { childList: true, subtree: true, characterData: true });

  /* ------------------------------------------------------------------ tokens + toast */
  let toastT = 0;
  function popup(text) {
    let t = $('#reward-toast');
    if (!t) { t = document.createElement('div'); t.id = 'reward-toast'; t.className = 'reward-toast'; document.body.appendChild(t); }
    t.innerHTML = text;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const coin = '<span class="coin" aria-hidden="true"><i></i></span>';
  function addTokens(n) { S.tokens = Math.max(0, S.tokens + n); saveS(); refresh(); }

  /* ------------------------------------------------------------------ daily + weekly tasks */
  const IC = (i) => '<i class="ic-sp" style="--i:' + i + '"></i>';
  const DEFS = {
    play:    { ev: 'play',    text: (n) => 'Play ' + n + ' games', opts: [[3, 1], [5, 1]], ic: IC(0), col: '#8fc15b' },
    win:     { ev: 'win',     text: (n) => 'Win ' + n + (n === 1 ? ' game' : ' games'), opts: [[1, 2], [2, 3]], ic: '\u{1F3C6}', col: '#f2c45a' },
    capture: { ev: 'capture', text: (n) => 'Capture ' + n + ' pieces', opts: [[25, 1], [50, 2]], ic: '⚔️', col: '#ef6a4c' },
    puzzle:  { ev: 'puzzle',  text: (n) => 'Solve ' + n + ' puzzles', opts: [[2, 1], [4, 2]], ic: '\u{1F9E9}', col: '#f58a2d' },
    rush:    { ev: 'rush',    text: (n) => 'Finish ' + n + (n === 1 ? ' Capture Rush round' : ' Capture Rush rounds'), opts: [[1, 1], [2, 2]], ic: '⏱️', col: '#ff9a4d' },
    secret:  { ev: 'secret',  text: (n) => 'Play ' + n + ' Secret Queen game', opts: [[1, 2]], ic: IC(2), col: '#b48cf2' },
  };
  /* weekly quests: bigger goals, each pays 5 to 8 tokens */
  const WDEFS = {
    play:    { ev: 'play',    text: (n) => 'Play ' + n + ' games', opts: [[12, 5], [18, 6]], ic: IC(0), col: '#8fc15b' },
    win:     { ev: 'win',     text: (n) => 'Win ' + n + ' games', opts: [[6, 6], [10, 8]], ic: '\u{1F3C6}', col: '#f2c45a' },
    capture: { ev: 'capture', text: (n) => 'Capture ' + n + ' pieces', opts: [[150, 5], [250, 7]], ic: '⚔️', col: '#ef6a4c' },
    puzzle:  { ev: 'puzzle',  text: (n) => 'Solve ' + n + ' puzzles', opts: [[12, 5], [20, 7]], ic: '\u{1F9E9}', col: '#f58a2d' },
    rush:    { ev: 'rush',    text: (n) => 'Finish ' + n + ' Capture Rush rounds', opts: [[4, 5], [6, 6]], ic: '⏱️', col: '#ff9a4d' },
    secret:  { ev: 'secret',  text: (n) => 'Play ' + n + ' Secret Queen games', opts: [[3, 6]], ic: IC(2), col: '#b48cf2' },
    hardwin: { ev: 'hardwin', text: (n) => 'Beat Hard or tougher ' + n + (n === 1 ? ' time' : ' times'), opts: [[2, 8], [3, 8]], ic: '\u{1F525}', col: '#ff6b6b' },
    streak:  { ev: 'cleanpuzzle', text: (n) => 'Solve ' + n + ' puzzles without a miss', opts: [[8, 7]], ic: '\u{1F3AF}', col: '#5ab0ff' },
  };
  const WKEY = 'localPieces.weekly';
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const monday = (d) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };   // weeks start on Monday
  const weekKey = () => { const m = monday(new Date()); return m.getFullYear() + '-' + pad2(m.getMonth() + 1) + '-' + pad2(m.getDate()); };
  const seed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const build = (defs, key, count) => {
    const r = rng(seed(key));
    return shuffle(Object.keys(defs), r).slice(0, count).map((k) => { const o = defs[k].opts[Math.floor(r() * defs[k].opts.length)]; return { k, n: o[0], r: o[1], p: 0, done: false }; });
  };
  let D = read(DKEY, null), W = read(WKEY, null);
  function ensureDay() {
    const k = dayKey();
    if (!D || D.day !== k || !D.list.every((t) => DEFS[t.k])) { D = { day: k, list: build(DEFS, k, 3) }; write(DKEY, D); }
    const w = weekKey();
    if (!W || W.week !== w || !W.list.every((t) => WDEFS[t.k])) { W = { week: w, list: build(WDEFS, 'w' + w, 4) }; write(WKEY, W); }
  }
  ensureDay();

  /* Endless goals. Each one has levels that never run out. Level k needs base x k (progress starts again at 0 on every level)
     and pays 1 + floor(k / 4) tokens, so the reward rises by 1 token every 4 levels (4 x the first goal).
       capture: base 5 pieces  -> 5, 10, 15 (1 token each), 20 (2 tokens) ... (counts every capture, Rush included)
       puzzles: base 5 puzzles -> same scaling as capture (counts puzzles solved on Normal or Hard)
       wins   : base 2 games   -> 2, 4, 6 (1 token each), 8 (2 tokens), 16 (3 tokens) ... (Classic or Secret Queen, beating Medium or tougher) */
  const EKEY = 'localPieces.endless';
  const ENDLESS = {
    capture: { base: 5, text: (n) => 'Capture ' + n + ' pieces', ic: '⚔️', col: '#ef6a4c', title: 'Pieces captured', rule: 'Counts every piece you capture, in Classic, Secret Queen, TAS and Capture Rush.' },
    puzzles: { base: 5, text: (n) => 'Solve ' + n + ' puzzles', ic: '\u{1F9E9}', col: '#f58a2d', title: 'Puzzles solved', rule: 'Counts every puzzle you solve on Normal or Hard.' },
    wins:    { base: 2, text: (n) => 'Win ' + n + (n === 1 ? ' game' : ' games'), ic: '\u{1F3C6}', col: '#f2c45a', title: 'Games won', rule: 'Win in Classic or Secret Queen against a Medium or tougher computer.' },
  };
  let E = read(EKEY, {});
  ['capture', 'wins', 'puzzles'].forEach((k) => { E[k] = Object.assign({ lv: 1, p: 0, done: 0 }, E[k] || {}); });
  const eTarget = (k, lv) => ENDLESS[k].base * lv;
  const eReward = (k, lv) => 1 + Math.floor(lv / 4);
  const MEDIUM_UP = { medium: 1, hard: 1, insane: 1, godly: 1 };
  function endlessTick(k, n) {
    const e = E[k];
    e.p += n;
    let got = 0, last = 0;
    while (e.p >= eTarget(k, e.lv)) {
      e.p -= eTarget(k, e.lv);
      got += eReward(k, e.lv);
      last = eTarget(k, e.lv);
      e.lv++; e.done++;
    }
    write(EKEY, E);
    if (got) { S.tokens += got; saveS(); popup(coin + ' Endless goal complete: ' + esc(ENDLESS[k].text(last)) + ' <b>+' + got + '</b>'); }
  }

  function tick(ev, amount) {
    ensureDay();
    [[D, DEFS, 'Daily'], [W, WDEFS, 'Weekly']].forEach(([box, defs, label]) => {
      box.list.forEach((t) => {
        if (t.done || defs[t.k].ev !== ev) return;
        t.p = Math.min(t.n, t.p + amount);
        if (t.p >= t.n) {
          t.done = true;
          S.tokens += t.r; saveS();
          popup(coin + ' ' + label + ' complete: ' + esc(defs[t.k].text(t.n)) + ' <b>+' + t.r + '</b>');
        }
      });
    });
    if (ev === 'capture') endlessTick('capture', amount);
    write(DKEY, D); write(WKEY, W);
    refresh();
  }

  const HARD = { hard: 1, godly: 1, insane: 1 };
  /** Called by the games: 'game' {mode, won, level...}, 'capture' n, 'puzzle', 'rush'. */
  function event(name, p) {
    if (LP.stats && LP.stats.event) LP.stats.event(name, p);
    if (name === 'game') {
      tick('play', 1);
      if (p && p.won) { tick('win', 1); if (HARD[p.level]) tick('hardwin', 1); if ((p.mode === 'basic' || p.mode === 'secret' || p.mode === 'bullet' || p.mode === 'rapid') && MEDIUM_UP[p.level]) { endlessTick('wins', 1); refresh(); } }
      if (p && p.mode === 'secret') tick('secret', 1);
    } else {
      tick(name, typeof p === 'number' ? p : 1);
      if (name === 'puzzle' && p && (p.diff === 'normal' || p.diff === 'hard' || p.diff === 'insane')) { endlessTick('puzzles', 1); refresh(); }   // Endless goal: puzzles solved on Normal or Hard
    }
  }

  const leftDay = () => { const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); return Math.max(0, m - n); };
  const leftWeek = () => { const n = new Date(), m = monday(n); m.setDate(m.getDate() + 7); return Math.max(0, m - n); };
  const fmtMs = (ms) => { const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? d + 'd ' + h + 'h' : h + 'h ' + (m % 60) + 'm'; };
  let tkTab = 'daily';

  function renderTasks() {
    ensureDay();
    $('#tk-tokens').textContent = S.tokens;
    const life = tkTab === 'life', weekly = tkTab === 'weekly';
    const box = weekly ? W : D, defs = weekly ? WDEFS : DEFS;
    const dn = D.list.filter((t) => t.done).length, wn = W.list.filter((t) => t.done).length;
    const on = (k) => (tkTab === k ? 'on' : '');
    $('#tk-tabs').innerHTML = `<button class="${on('daily')}" data-tk="daily">Daily <em>${dn}/${D.list.length}</em></button><button class="${on('weekly')}" data-tk="weekly">Weekly <em>${wn}/${W.list.length}</em></button><button class="${on('life')}" data-tk="life">Endless <em>${E.capture.done + E.wins.done + E.puzzles.done}</em></button>`;
    document.querySelectorAll('[data-tk]').forEach((b) => { b.onclick = () => { tkTab = b.dataset.tk; renderTasks(); }; });
    if (life) {
      const doneAll = E.capture.done + E.wins.done + E.puzzles.done;
      $('#tk-reset').innerHTML = 'Never resets. Every goal you finish makes the next one bigger. <span class="tk-hard">' + doneAll + ' finished</span>';
      const cur = (k) => { const e = E[k], d = ENDLESS[k], n = eTarget(k, e.lv), pct = Math.round(100 * e.p / n);
        return `<div class="tk-card wk"><div class="tk-top"><span class="tk-ic" style="color:${d.col}" aria-hidden="true">${d.ic}</span><b>${esc(d.text(n))}</b><span class="tk-rw">${coin}+${eReward(k, e.lv)}</span></div>
          <div class="tk-bar"><i style="width:${e.p ? Math.max(pct, 8) : 0}%"></i><span>${e.p} / ${n}</span></div></div>`; };
      const nxt = (k) => { const e = E[k], d = ENDLESS[k], n = eTarget(k, e.lv + 1);
        return `<div class="tk-card soon"><div class="tk-top"><span class="tk-ic" style="color:${d.col}" aria-hidden="true">${d.ic}</span><b><small class="tk-next">Next</small> ${esc(d.text(n))}</b><span class="tk-rw">${coin}+${eReward(k, e.lv + 1)}</span></div></div>`; };
      $('#tk-list').innerHTML = ['capture', 'puzzles', 'wins'].map((k) => `<h3 class="sh-sub">${ENDLESS[k].title} <em class="tk-lv">Level ${E[k].lv}</em></h3>${cur(k)}${nxt(k)}<p class="note">${ENDLESS[k].rule}</p>`).join('');
      return;
    }
    $('#tk-reset').innerHTML = (weekly ? 'New weekly quests in <b>' : 'New tasks in <b>') + fmtMs(weekly ? leftWeek() : leftDay()) + '</b>' + (weekly ? ' <span class="tk-hard">Harder goals, 5 to 8 tokens each</span>' : '');
    $('#tk-list').innerHTML = box.list.map((t) => {
      const d = defs[t.k], pct = Math.round(100 * t.p / t.n);
      return `<div class="tk-card${t.done ? ' done' : ''}${weekly ? ' wk' : ''}">
        <div class="tk-top"><span class="tk-ic" style="color:${d.col}" aria-hidden="true">${d.ic}</span><b>${esc(d.text(t.n))}</b>
          <span class="tk-rw">${t.done ? '<span class="tk-ok" aria-hidden="true">✓</span>' : coin + '+' + t.r}</span></div>
        <div class="tk-bar"><i style="width:${t.p ? Math.max(pct, 8) : 0}%"></i><span>${t.p} / ${t.n}</span></div>
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------------ shop */
  const openState = {};
  const rollOdds = (slot) => {
    const have = new Set(CRATES[slot].items.map((i) => i.r));
    const tot = [...have].reduce((a, r) => a + RARITY[r].w, 0);
    return Object.keys(RARITY).filter((r) => have.has(r)).map((r) => [r, Math.round(100 * RARITY[r].w / tot)]);
  };
  const PVSHAPES = 'pbqknr';
  /** An accessory drawn on one piece (kind k/q/r/b/n/p) of a player's piece set (default: Player 1's). show=false draws the piece alone. */
  function hatOn(it, kind, show, who) {
    const p = skinOf(S.slots[who || 'p1']), hp = hatPos(p.id || '', kind, it.id);
    let pic;
    if (p.pk === 'neon') pic = `<b class="piece w pvk-neon" data-pk="neon" data-k="${kind}"></b>`;
    else pic = `<i class="ic-sp"${p.px ? ' data-px="1"' : ''} style="--i:${SHEET_AT[kind]};background-image:url(${p.sheet})"></i>`;
    let em = '';
    if (show) {
      const pos = `left:${hp.x}%;top:${hp.y}%;width:${hp.w}%`;
      if (it.id === 'pawnhat') em = `<em class="hs" style="${pos};background-image:url(pk-realism-hd.png);background-position:${6 / 11 * 100}% 50%"></em>`;
      else if (it.id === 'mini') em = p.pk === 'neon' ? '' : `<em class="hs" style="${pos};background-image:url(${p.sheet});background-position:${SHEET_AT[kind] / 11 * 100}% 50%"></em>`;
      else em = `<em data-hat="${it.id}" style="${pos}"></em>`;
    }
    return `<span class="pv-hat"><span class="pvh">${em}${pic}</span></span>`;
  }
  function preview(slot, it) {
    if (slot === 'board') {
      const st = `--a:${it.l};--b:${it.d}` + (it.li ? `;--ai:${it.li};--bi:${it.di}` : '');
      if (it.doodle) ensureDoodle();
      return `<span class="pv-board${it.li ? ' tex' : ''}${it.doodle ? ' doodle' : ''}${it.neon ? ' neon' : ''}${it.wood || it.smooth ? ' smooth' : ''}${it.tile || it.flat ? ' tile' : ''}" style="${st}"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
    }
    if (slot === 'bg') {
      const pic = it.custom ? customImg() : '';
      return `<span class="pv-bg${it.custom ? ' cust' : ''}${it.anim ? ' anim-' + it.anim : ''}" ${it.anim ? '' : `style="background:${pic ? 'center / cover url(' + pic + ')' : it.bg || '#1f1f1f'}"`}>${it.custom && !pic ? '<b>＋</b>' : ''}</span>`;
    }
    if (slot === 'piece') {
      if (it.pk === 'sheet') return `<span class="pv-king pv-sheet" style="--sheet:url(${it.sheet})"><b data-pk="sheet" ${it.px ? 'data-px="1"' : ''} style="--px:${3 / 11 * 100}%"></b><b data-pk="sheet" ${it.px ? 'data-px="1"' : ''} style="--px:${9 / 11 * 100}%"></b></span>`;
      if (it.pk === 'neon') return `<span class="pv-king pv-neon"><b class="piece w" data-pk="neon" data-k="k"></b><b class="piece b" data-pk="neon" data-k="n"></b></span>`;
      return `<span class="pv-king"><b style="color:${it.w}">♚︎</b><b style="color:${it.b}">♚︎</b></span>`;
    }
    return hatOn(it, 'k', true);     // worn by the king of the piece set that is equipped now
  }
  const dflt = { bg: { id: '', name: 'Black', bg: '#1f1f1f' }, board: { id: '', name: 'Classic', l: '#eeeed2', d: '#769656' }, piece: RETRO, hat: { id: '', name: 'None', e: '' } };


  /* ------------------------------------------------------------------ equip choosers */
  const KNAMES = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
  const finishEquip = (msg) => { S.equipped.piece = S.slots.p1.piece; S.equipped.hat = S.slots.p1.hat; saveS(); apply(); LP.closeSheet(); renderShop(); popup(msg); };
  const WHO = { p1: 'Player 1', p2: 'Player 2', both: 'Both players' };
  const whoList = (w) => (w === 'both' ? ['p1', 'p2'] : [w]);
  /** Step 1 of equipping a piece set or accessory: who gets it. cb gets 'p1', 'p2' or 'both'. */
  function chooseWho(title, cb, preview) {
    LP.openSheet(`<h2>${title}<span class="sub">Player 1 is you. Player 2 is the computer or a guest.</span></h2>
      <div class="eq-teams">${['p1', 'p2', 'both'].map((w) => `<button class="eq-team" data-w="${w}"><span class="eq-pair">${preview(w)}</span><b>${WHO[w]}</b></button>`).join('')}</div>
      <div class="row"><button class="btn" id="eq-cancel">Cancel</button></div>`, true);
    document.querySelectorAll('.eq-team').forEach((b) => { b.onclick = () => cb(b.dataset.w); });
    $('#eq-cancel').onclick = () => { LP.closeSheet(); renderShop(); };
  }
  const kingPic = (skin, team) => skin.pk === 'neon' ? `<b class="piece ${team} pvk-neon" data-pk="neon" data-k="k"></b>`
    : `<i class="ic-sp"${skin.px ? ' data-px="1"' : ''} style="--i:${team === 'w' ? 3 : 9};background-image:url(${skin.sheet})"></i>`;
  /** Accessory, step 2: which pieces wear it. who = 'p1' | 'p2' | 'both' */
  function chooseHatPieces(it, who) {
    const first = whoList(who)[0];
    const on = new Set(S.slots[first].hat === it.id ? (S.slots[first].hatOn || 'k').split('') : ['k']);
    const skin = skinOf(S.slots[first]);
    const draw = () => {
      LP.openSheet(`<h2>${esc(it.name)} on ${who === 'both' ? 'both players' : WHO[who]}<span class="sub">Tap the pieces that should wear it.</span></h2>
        <div class="eq-chips">${'kqrbnp'.split('').map((k) => `<button class="eq-chip${on.has(k) ? ' on' : ''}" data-k="${k}">${skin.pk === 'neon' && (it.id === 'mini') ? '' : hatOn(it, k, on.has(k), first)}<span>${KNAMES[k]}</span></button>`).join('')}</div>
        <button class="btn wide" id="eq-all">${on.size === 6 ? 'Clear all' : 'Select all'}</button>
        <div class="row"><button class="btn" id="eq-back">Back</button><button class="btn primary" id="eq-ok" ${on.size ? '' : 'disabled'}>Wear it</button></div>`, true);
      document.querySelectorAll('.eq-chip').forEach((b) => { b.onclick = () => { const k = b.dataset.k; if (on.has(k)) on.delete(k); else on.add(k); draw(); }; });
      $('#eq-all').onclick = () => { if (on.size === 6) on.clear(); else 'kqrbnp'.split('').forEach((k) => on.add(k)); draw(); };
      $('#eq-back').onclick = () => chooseHat(it);
      $('#eq-ok').onclick = () => {
        const kinds = 'kqrbnp'.split('').filter((k) => on.has(k)).join('');
        whoList(who).forEach((w) => { S.slots[w].hat = it.id; S.slots[w].hatOn = kinds; });
        finishEquip(esc(it.name) + ' on ' + (on.size === 6 ? 'every piece' : [...'kqrbnp'].filter((k) => on.has(k)).map((k) => KNAMES[k].toLowerCase() + 's').join(', ')) + ' for ' + (who === 'both' ? 'both players' : WHO[who]));
      };
    };
    draw();
  }
  function chooseHat(it) {
    chooseWho('Who wears ' + esc(it.name) + '?', (w) => chooseHatPieces(it, w), (w) => {
      const s1 = skinOf(S.slots.p1), s2 = skinOf(S.slots.p2);
      return w === 'both' ? kingPic(s1, 'w') + kingPic(s2, 'b') : w === 'p1' ? kingPic(s1, 'w') : kingPic(s2, 'b');
    });
  }
  /** Piece set: who gets it. */
  function choosePieceWho(it) {
    chooseWho('Who gets ' + esc(it.name) + '?', (w) => {
      whoList(w).forEach((x) => { S.slots[x].piece = it.id; });
      S.equipped.piece = S.slots.p1.piece;
      finishEquip((it.id ? esc(it.name) : 'Retro') + ' equipped for ' + (w === 'both' ? 'both players' : WHO[w]));
    }, (w) => (w === 'both' ? kingPic(it, 'w') + kingPic(it, 'b') : w === 'p1' ? kingPic(it, 'w') : kingPic(it, 'b')));
  }
  /** Legendary background: pick a picture from your device (shrunk and kept on this device only). */
  function pickImage(done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 1280 / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          let ok = false;
          for (const q of [0.82, 0.6, 0.4]) { try { localStorage.setItem(IMGKEY, c.toDataURL('image/jpeg', q)); ok = true; break; } catch (e) { /* too big, try smaller */ } }
          if (ok) done(); else popup('That picture is too big to keep. Try a smaller one.');
        };
        im.onerror = () => popup('That file is not a picture I can open.');
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    };
    inp.click();
  }
  function customBgFlow() {
    const pic = customImg();
    LP.openSheet(`<h2>Your image<span class="sub">Pick any picture from your device. It stays on this device.</span></h2>
      <div class="bg-prev" style="${pic ? 'background-image:url(' + pic + ')' : ''}">${pic ? '' : '<b>No picture yet</b>'}</div>
      <div class="stack"><button class="btn primary" id="bg-pick">${pic ? 'Choose a different picture' : 'Choose a picture'}</button>
      ${pic ? '<button class="btn" id="bg-use">Use it</button><button class="btn" id="bg-rm">Remove picture</button>' : ''}
      <button class="btn" id="bg-x">Cancel</button></div>`, true);
    const equip = () => { S.equipped.bg = 'custom'; saveS(); apply(); LP.closeSheet(); renderShop(); popup('Your image is the background'); };
    $('#bg-pick').onclick = () => pickImage(equip);
    const u = $('#bg-use'); if (u) u.onclick = equip;
    const r = $('#bg-rm'); if (r) r.onclick = () => { try { localStorage.removeItem(IMGKEY); } catch (e) { /* ignore */ } if (S.equipped.bg === 'custom') S.equipped.bg = ''; saveS(); apply(); LP.closeSheet(); renderShop(); popup('Picture removed'); };
    $('#bg-x').onclick = () => { LP.closeSheet(); renderShop(); };
  }
  function equipFlow(slot, id) {
    if (slot === 'hat') {
      if (id) return chooseHat(find('hat', id));
      return chooseWho('Remove the accessory from...', (w) => { whoList(w).forEach((x) => { S.slots[x].hat = ''; }); S.equipped.hat = S.slots.p1.hat; finishEquip('Accessory removed for ' + (w === 'both' ? 'both players' : WHO[w])); }, () => '<span class="pv-none">∅</span>');
    }
    if (slot === 'piece') return choosePieceWho(id ? find('piece', id) : RETRO);
    if (slot === 'bg' && id === 'custom') return customBgFlow();
    S.equipped[slot] = id; saveS(); apply(); LP.closeSheet(); renderShop();
    popup((id ? esc(find(slot, id).name) : dflt[slot].name) + ' equipped');
  }


  /* ------------------------------------------------------------------ preview on hover (mouse) or press-and-hold (phone) */
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  /** One piece of a preview board, drawn exactly like a real one but never touched by tagKings (data-prev). */
  function miniPiece(kind, black, sk, hat) {
    const pe = document.createElement('span');
    pe.className = 'piece ' + (black ? 'b' : 'w'); pe.dataset.prev = '1'; pe.textContent = GLYPH[kind];
    const pk = sk.pk || '';
    if (pk) {
      pe.dataset.pk = pk; pe.dataset.k = kind;
      if (sk.px) pe.dataset.px = '1';
      if (pk === 'sheet') { pe.style.setProperty('--px', ((SHEET_AT[kind] + (black ? 6 : 0)) / 11 * 100) + '%'); pe.style.setProperty('--sheet', 'url(' + sk.sheet + ')'); }
    }
    if (hat && kind === 'k') {
      const hp = hatPos(sk.id || '', kind, hat.id);
      pe.dataset.hat = hat.id; pe.style.setProperty('--hx', hp.x + '%'); pe.style.setProperty('--hy', hp.y + '%'); pe.style.setProperty('--hw', hp.w + '%');
    }
    return pe;
  }
  /** The start position with the set being looked at: a board shows with your pieces, a piece set on your board. */
  function previewBoard(slot, it) {
    const bd = slot === 'board' ? it : find('board', S.equipped.board);
    const w = slot === 'piece' ? (it.id ? it : RETRO) : skinOf(slotOf(false)), bl = slot === 'piece' ? w : skinOf(slotOf(true));
    const hat = slot === 'hat' && it.id ? it : null;
    const bdk = bd && bd.neon ? 'neon' : bd && bd.doodle ? 'doodle' : bd && (bd.wood || bd.smooth) ? 'wood' : bd && bd.tile ? 'tile' : bd && bd.flat ? 'flat' : '';
    if (bd && bd.doodle) ensureDoodle();
    const wrap = document.createElement('div');
    wrap.className = 'board-wrap pv-live'; if (bdk) wrap.dataset.bd = bdk;
    wrap.style.cssText = '--bs:176px;--light-sq:' + (bd ? bd.l : '#eeeed2') + ';--dark-sq:' + (bd ? bd.d : '#769656') + ';--light-img:' + (bd && bd.li ? bd.li : 'none') + ';--dark-img:' + (bd && bd.di ? bd.di : 'none');
    const board = document.createElement('div'); board.className = 'board';
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const sq = document.createElement('div'); sq.className = 'square ' + ((r + f) % 2 ? 'dark' : 'light');
      const kind = r === 0 || r === 7 ? BACK[f] : r === 1 || r === 6 ? 'p' : '';
      if (kind) sq.appendChild(miniPiece(kind, r < 4, r < 4 ? bl : w, hat));
      board.appendChild(sq);
    }
    wrap.appendChild(board);
    return wrap;
  }
  /** A background shows as a small mock-up of the app: header, two cards, a button and a board. */
  function bgMock(it) {
    const pic = it.custom ? customImg() : '';
    const m = document.createElement('div');
    m.className = 'pv-mock' + (it.anim ? ' anim-' + it.anim : '');
    m.style.cssText = '--mb:' + (it.bg || '#1f1f1f') + ';--mp:' + (it.panel || '#2b2b2b') + ';--mp2:' + (it.panel2 || '#363636') + ';--ml:' + (it.line || '#404040') + ';--ma:' + (it.acc || '#ffffff') + (pic ? ';background-image:linear-gradient(rgba(0,0,0,.42),rgba(0,0,0,.42)),url(' + pic + ');background-size:cover;background-position:center' : '');
    m.innerHTML = '<b class="mk-h"></b><i class="mk-c"><u></u><u></u></i><i class="mk-c"><u></u><u></u></i><span class="mk-bd"></span><s class="mk-btn"></s>' + (it.custom && !pic ? '<em>Add your own picture</em>' : '');
    return m;
  }
  let hv = null;
  function hideHover() { if (hv) { hv.remove(); hv = null; } }
  function showHover(tile) {
    hideHover();
    const slot = tile.dataset.slot, id = tile.dataset.id, it = id === '' ? dflt[slot] : find(slot, id);
    if (!it) return;
    hv = document.createElement('div'); hv.className = 'sh-hover';
    hv.appendChild(slot === 'bg' ? bgMock(it) : previewBoard(slot, it));
    const cap = document.createElement('div'); cap.className = 'sh-hover-cap'; cap.textContent = it.name; hv.appendChild(cap);
    document.body.appendChild(hv);
    const r = tile.getBoundingClientRect(), w = hv.offsetWidth, h = hv.offsetHeight;
    let top = r.top - h - 10; if (top < 8) top = Math.min(r.bottom + 10, innerHeight - h - 8);
    hv.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    hv.style.top = Math.max(8, top) + 'px';
  }
  function wireHover(tile) {
    tile.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showHover(tile); });
    tile.addEventListener('pointerleave', hideHover);
    tile.addEventListener('contextmenu', (e) => e.preventDefault());
    let t = 0, sx = 0, sy = 0;
    const stop = () => { clearTimeout(t); if (tile._held) { hideHover(); setTimeout(() => { tile._held = false; }, 450); } };
    tile.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; tile._held = false; clearTimeout(t); t = setTimeout(() => { tile._held = true; showHover(tile); if (navigator.vibrate) { try { navigator.vibrate(12); } catch (x) { /* ignore */ } } }, 330); }, { passive: true });
    tile.addEventListener('touchmove', (e) => { if (Math.abs(e.touches[0].clientX - sx) + Math.abs(e.touches[0].clientY - sy) > 12) { clearTimeout(t); if (tile._held) stop(); } }, { passive: true });
    tile.addEventListener('touchend', stop); tile.addEventListener('touchcancel', stop);
  }

  const TABS = { board: 'Boards', piece: 'Pieces', hat: 'Accessories', bg: 'Backgrounds' };
  let tab = 'board';
  function renderShop() {
    $('#sh-tokens').textContent = S.tokens;
    const c = CRATES[tab], slot = tab;
    const got = c.items.filter((i) => S.owned[slot + ':' + i.id]).length;
    const can = S.tokens >= COST;
    const pct = Math.round(100 * got / c.items.length);
    const order = ['common', 'rare', 'epic', 'legendary'];
    const sorted = c.items.slice().sort((x, y) => order.indexOf(x.r) - order.indexOf(y.r));
    const tiles = [dflt[slot]].concat(sorted).map((it) => {
      const isDef = it.id === '', owned = isDef || S.owned[slot + ':' + it.id];
      const used = slot === 'board' || slot === 'bg' ? (S.equipped[slot] === it.id ? ['b'] : []) : ['p1', 'p2'].filter((w) => S.slots[w][slot] === it.id);
      const eq = used.length > 0;
      const R = isDef ? { name: 'Starter', c: '#8a8a85' } : RARITY[it.r];
      return `<button class="sh-tile${owned ? '' : ' locked'}${eq ? ' eq' : ''}" style="--rc:${R.c}" data-slot="${slot}" data-id="${it.id}" ${owned ? '' : 'aria-disabled="true"'}>
        <span class="sh-rar">${R.name}</span>
        <span class="sh-pv">${isDef && slot === 'hat' ? '<span class="pv-none">∅</span>' : preview(slot, it)}</span>
        <span class="sh-nm">${esc(it.name)}</span>
        <span class="sh-st">${owned ? (eq ? (slot === 'board' || slot === 'bg' ? 'Equipped' : used.length === 2 ? 'P1 + P2' : used[0] === 'p1' ? 'Player 1' : 'Player 2') : 'Tap to equip') : 'Not found yet'}</span></button>`;
    }).join('');
    $('#sh-list').innerHTML = `<div class="sh-tabs" role="tablist">${Object.keys(TABS).map((k) => `<button role="tab" class="${k === tab ? 'on' : ''}" data-tab="${k}">${TABS[k]}</button>`).join('')}</div>
      <section class="sh-crate" style="--c:${c.color}">
        <div class="sh-head">
          <span class="crate big" data-c="${slot}"></span>
          <span class="sh-title"><b>${c.name}</b>
            <span class="sh-prog"><i style="width:${pct}%"></i></span>
            <span class="sh-cnt">${got} of ${c.items.length} found</span></span>
        </div>
        <div class="sh-odds">${rollOdds(slot).map(([r, p]) => `<span class="od" style="--rc:${RARITY[r].c}">${RARITY[r].name} <b>${p}%</b></span>`).join('')}</div>
        <button class="sh-open" data-open="${slot}" ${can ? '' : 'disabled'}>${coin}<span>Open crate for ${COST}</span></button>
        ${can ? '' : `<p class="sh-need">You need ${COST - S.tokens} more token${COST - S.tokens === 1 ? '' : 's'}. Daily tasks pay tokens.</p>`}
      </section>
      <h3 class="sh-sub">Collection</h3>
      <div class="sh-grid">${tiles}</div>`;
    document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; renderShop(); }; });
    document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openCrate(b.dataset.open); });
    document.querySelectorAll('.sh-tile').forEach((b) => {
      wireHover(b);
      b.onclick = () => {
        hideHover();
        if (b._held || b.getAttribute('aria-disabled') === 'true') return;      // a press-and-hold only previews; a locked item can be previewed but not equipped
        equipFlow(b.dataset.slot, b.dataset.id);
      };
    });
  }

  function roll(slot) {
    const items = CRATES[slot].items;
    const rs = [...new Set(items.map((i) => i.r))];
    let x = Math.random() * rs.reduce((a, r) => a + RARITY[r].w, 0), r = rs[0];
    for (const k of rs) { x -= RARITY[k].w; if (x < 0) { r = k; break; } }
    const pool = items.filter((i) => i.r === r);
    const fresh = pool.filter((i) => !S.owned[slot + ':' + i.id]);
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  function openCrate(slot) {
    if (S.tokens < COST) return;
    const c = CRATES[slot];
    S.tokens -= COST;
    const it = roll(slot);
    const dup = !!S.owned[slot + ':' + it.id];
    S.owned[slot + ':' + it.id] = true;
    if (dup) S.tokens += RARITY[it.r].refund;
    saveS(); refresh();
    LP.openSheet(`<div class="cr-stage"><span class="crate big shake" data-c="${slot}"></span><p class="cr-hint">Opening...</p></div>`);
    setTimeout(() => {
      const rc = RARITY[it.r].c;
      LP.openSheet(`<div class="cr-reveal" style="--rc:${rc}">
        <span class="cr-rar">${RARITY[it.r].name}</span>
        <div class="cr-item">${preview(slot, it)}</div>
        <h2>${esc(it.name)}<span class="sub">${dup ? 'Already collected. You got ' + RARITY[it.r].refund + ' token' + (RARITY[it.r].refund > 1 ? 's' : '') + ' back.' : 'New item added to your collection!'}</span></h2>
        <div class="row"><button class="btn" id="cr-done">Done</button><button class="btn primary" id="cr-eq">Equip</button></div>
        <button class="btn wide" id="cr-more" ${S.tokens >= COST ? '' : 'disabled'}>Open another (${COST})</button></div>`);
      $('#cr-done').onclick = () => { LP.closeSheet(); renderShop(); };
      $('#cr-eq').onclick = () => equipFlow(slot, it.id);
      $('#cr-more').onclick = () => { renderShop(); openCrate(slot); };
    }, 1200);
  }

  /* ------------------------------------------------------------------ pages + menu */
  function refresh() {
    ensureDay();
    const done = D.list.filter((t) => t.done).length, wdone = W.list.filter((t) => t.done).length;
    const sd = $('#shop-desc'), td = $('#tasks-desc');
    if (sd) sd.textContent = S.tokens + (S.tokens === 1 ? ' token' : ' tokens') + ' to spend on crates.';
    if (td) td.textContent = 'Daily ' + done + '/' + D.list.length + ' · Weekly ' + wdone + '/' + W.list.length + '. Earn tokens.';
    if ($('#tasks').classList.contains('active')) renderTasks();
    if ($('#shop').classList.contains('active')) renderShop();
  }
  let clock = 0;
  function openPage(id) {
    LP.showPage(id);
    refresh();
    clearInterval(clock);
    if (id === 'tasks') clock = setInterval(() => { if (!$('#tasks').classList.contains('active')) clearInterval(clock); else { renderTasks(); } }, 30000);
  }
  document.querySelector('.mode[data-mode="tasks"]').addEventListener('click', () => openPage('tasks'));
  document.querySelector('.mode[data-mode="shop"]').addEventListener('click', () => openPage('shop'));
  $('#tk-back').addEventListener('click', () => { LP.showPage('menu'); refresh(); });
  $('#sh-back').addEventListener('click', () => { LP.closeSheet(); LP.showPage('menu'); refresh(); });
  $('#tk-shop').addEventListener('click', () => openPage('shop'));

  LP.rewards = { event, addTokens, tokens: () => S.tokens };
  LP.applyLook = apply;
  LP.hatDebug = { hatPos, HATS, PIECES, skinOf };
  apply();
  refresh();
})();
