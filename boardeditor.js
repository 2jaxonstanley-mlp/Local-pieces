/**
 * Your Own Board (a legendary board in the Board Crate): draw the light and the dark square yourself, or turn a picture
 * into them. It is private: saved on this device only (localStorage), like the legendary background picture.
 *   LP.boardEditor.has()          - has a design been saved?
 *   LP.boardEditor.resolve()      - { l, d, li, di } the colours and tile pictures to put on the board
 *   LP.boardEditor.open(onSaved)  - the editor sheet; onSaved() runs after "Save and use"
 */
(() => {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const KEY = 'localPieces.customBoard';
  const BASE = { l: '#eeeed2', d: '#769656' };
  const SWATCHES = ['#ffffff', '#eeeed2', '#f0d9b5', '#b58863', '#769656', '#4b7399', '#2b2b2b', '#000000', '#e5484d', '#f5b82e', '#4ade80', '#8e5cf0'];
  const $ = (s) => document.querySelector(s);

  /* ------------------------------------------------------------------ storage */
  function blank(n, c) { return new Array(n * n).fill(c); }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && (d.n === 16 || d.n === 32) && Array.isArray(d.l) && Array.isArray(d.d) && d.l.length === d.n * d.n && d.d.length === d.n * d.n) return d;
    } catch (e) { /* no design yet */ }
    return null;
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
  const fresh = () => ({ n: 16, l: blank(16, BASE.l), d: blank(16, BASE.d) });

  /* ------------------------------------------------------------------ tiles as pictures */
  const urlCache = {};
  function tileUrl(px, n) {
    const key = n + px.join('');
    if (urlCache[key]) return urlCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d');
    for (let i = 0; i < px.length; i++) { x.fillStyle = px[i]; x.fillRect(i % n, Math.floor(i / n), 1, 1); }
    return (urlCache[key] = 'url(' + c.toDataURL('image/png') + ')');
  }
  /** The average colour of a tile (shown wherever the picture is not used, e.g. while it loads). */
  function average(px) {
    let r = 0, g = 0, b = 0;
    px.forEach((h) => { r += parseInt(h.slice(1, 3), 16); g += parseInt(h.slice(3, 5), 16); b += parseInt(h.slice(5, 7), 16); });
    const k = Math.max(1, px.length), hx = (v) => ('0' + Math.round(v / k).toString(16)).slice(-2);
    return '#' + hx(r) + hx(g) + hx(b);
  }
  function resolve() {
    const d = load();
    if (!d) return { l: BASE.l, d: BASE.d, li: '', di: '' };
    return { l: average(d.l), d: average(d.d), li: tileUrl(d.l, d.n), di: tileUrl(d.d, d.n) };
  }

  /* ------------------------------------------------------------------ the editor */
  let S = null;   // { n, l, d, tab, tool, color, undo[] }
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join('');

  function open(onSaved) {
    const d = load() || fresh();
    S = { n: d.n, l: d.l.slice(), d: d.d.slice(), tab: 'l', tool: 'pen', color: '#e5484d', undo: [], onSaved: onSaved || (() => {}) };
    draw();
  }

  function sheet() {
    const t = S.tab;
    return `<h2>Your own board<span class="sub">Draw the two square designs, or turn a picture into them. Only you see it, it stays on this device.</span></h2>
      <div class="be-tabs"><button class="be-tab${t === 'l' ? ' on' : ''}" data-bt="l">Light square</button><button class="be-tab${t === 'd' ? ' on' : ''}" data-bt="d">Dark square</button></div>
      <canvas id="be-cv" class="be-cv" width="256" height="256"></canvas>
      <div class="be-tools">
        ${[['pen', 'Draw'], ['erase', 'Erase'], ['fill', 'Fill'], ['pick', 'Pick']].map((x) => `<button class="be-tool${S.tool === x[0] ? ' on' : ''}" data-tool="${x[0]}">${x[1]}</button>`).join('')}
        <button class="be-tool" id="be-undo">Undo</button>
      </div>
      <div class="be-colors">
        <input type="color" id="be-col" value="${S.color}" aria-label="Colour">
        ${SWATCHES.map((c) => `<button class="be-sw${c === S.color ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
      </div>
      <div class="be-row"><span>Detail</span><button class="be-tool${S.n === 16 ? ' on' : ''}" data-n="16">16 × 16</button><button class="be-tool${S.n === 32 ? ' on' : ''}" data-n="32">32 × 32</button></div>
      <canvas id="be-pv" class="be-pv" width="160" height="160"></canvas>
      <div class="stack">
        <button class="btn" id="be-pic">Use a picture…</button>
        <button class="btn primary" id="be-save">Save and use</button>
        <div class="row"><button class="btn" id="be-clear">Clear tile</button><button class="btn" id="be-x">Cancel</button></div>
      </div>`;
  }

  function paint() {
    const n = S.n, px = S[S.tab], cv = $('#be-cv');
    if (!cv) return;
    const x = cv.getContext('2d'), k = cv.width / n;
    for (let i = 0; i < px.length; i++) { x.fillStyle = px[i]; x.fillRect((i % n) * k, Math.floor(i / n) * k, k, k); }
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; x.beginPath();
    for (let i = 1; i < n; i++) { x.moveTo(i * k + .5, 0); x.lineTo(i * k + .5, cv.width); x.moveTo(0, i * k + .5); x.lineTo(cv.width, i * k + .5); }
    x.stroke();
    const pv = $('#be-pv');
    if (pv) {
      const y = pv.getContext('2d'), s = pv.width / 8;
      y.imageSmoothingEnabled = false;
      const tl = tileCanvas(S.l, n), td = tileCanvas(S.d, n);
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) y.drawImage((r + f) % 2 ? td : tl, f * s, r * s, s, s);
    }
  }
  function tileCanvas(px, n) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d');
    for (let i = 0; i < px.length; i++) { x.fillStyle = px[i]; x.fillRect(i % n, Math.floor(i / n), 1, 1); }
    return c;
  }

  function flood(px, n, i, to) {
    const from = px[i];
    if (from === to) return;
    const st = [i];
    while (st.length) {
      const j = st.pop();
      if (px[j] !== from) continue;
      px[j] = to;
      const x = j % n, y = Math.floor(j / n);
      if (x > 0) st.push(j - 1); if (x < n - 1) st.push(j + 1); if (y > 0) st.push(j - n); if (y < n - 1) st.push(j + n);
    }
  }

  function draw() {
    LP.openSheet(sheet(), false);
    paint();
    const cv = $('#be-cv');
    let down = false;
    const cell = (e) => {
      const r = cv.getBoundingClientRect(), n = S.n;
      const x = Math.floor((e.clientX - r.left) / r.width * n), y = Math.floor((e.clientY - r.top) / r.height * n);
      return x < 0 || y < 0 || x >= n || y >= n ? -1 : y * n + x;
    };
    const act = (e, first) => {
      const i = cell(e);
      if (i < 0) return;
      const px = S[S.tab];
      if (S.tool === 'pick') { if (first) { S.color = px[i]; draw(); } return; }
      if (S.tool === 'fill') { if (first) { flood(px, S.n, i, S.color); paint(); } return; }
      const c = S.tool === 'erase' ? BASE[S.tab] : S.color;
      if (px[i] !== c) { px[i] = c; paint(); }
    };
    cv.style.touchAction = 'none';
    cv.onpointerdown = (e) => {
      down = true; cv.setPointerCapture(e.pointerId);
      S.undo.push([S.tab, S[S.tab].slice()]); if (S.undo.length > 30) S.undo.shift();
      act(e, true); e.preventDefault();
    };
    cv.onpointermove = (e) => { if (down) act(e, false); };
    cv.onpointerup = cv.onpointercancel = () => { down = false; };
    document.querySelectorAll(".be-tab").forEach((b) => { b.onclick = () => { S.tab = b.dataset.bt; draw(); }; });
    document.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => { S.tool = b.dataset.tool; draw(); }; });
    document.querySelectorAll('.be-sw').forEach((b) => { b.onclick = () => { S.color = b.dataset.c; if (S.tool === 'erase' || S.tool === 'pick') S.tool = 'pen'; draw(); }; });
    $('#be-col').onchange = (e) => { S.color = e.target.value; if (S.tool === 'erase' || S.tool === 'pick') S.tool = 'pen'; draw(); };
    $('#be-undo').onclick = () => { const u = S.undo.pop(); if (!u) return; S[u[0]] = u[1]; paint(); };
    document.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => { resize(+b.dataset.n); draw(); }; });
    $('#be-clear').onclick = () => { S.undo.push([S.tab, S[S.tab].slice()]); S[S.tab] = blank(S.n, BASE[S.tab]); paint(); };
    $('#be-pic').onclick = () => pickPicture();
    $('#be-x').onclick = () => { S = null; LP.closeSheet(); };
    $('#be-save').onclick = () => {
      const ok = save({ n: S.n, l: S.l, d: S.d });
      if (!ok) { alert('Could not save the board on this device (storage is full).'); return; }
      const cb = S.onSaved; S = null; LP.closeSheet(); cb();
    };
  }

  /** Change the detail: every pixel is kept, repeated (16 to 32) or sampled (32 to 16). */
  function resize(n) {
    if (n === S.n) return;
    const re = (px) => {
      const o = new Array(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) o[y * n + x] = px[Math.floor(y * S.n / n) * S.n + Math.floor(x * S.n / n)];
      return o;
    };
    S.l = re(S.l); S.d = re(S.d); S.n = n; S.undo = [];
  }

  /* ------------------------------------------------------------------ a picture becomes the tiles */
  function pickPicture() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => crop(im);
        im.onerror = () => { alert('That file is not a picture I can open.'); };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    };
    inp.click();
  }

  function crop(im) {
    const V = 256;   // the square window you look through
    let zoom = 1, ox = 0, oy = 0;
    const base = Math.min(im.width, im.height);   // at zoom 1 the biggest square that fits shows
    const sheetHtml = `<h2>Crop the picture<span class="sub">Drag to move, use the slider to zoom. The square you see becomes the tile.</span></h2>
      <canvas id="cr-cv" class="be-cv" width="${V}" height="${V}"></canvas>
      <input type="range" id="cr-z" min="1" max="4" step="0.01" value="1" style="width:100%">
      <div class="stack">
        <button class="btn primary" id="cr-l">Use for the light square</button>
        <button class="btn primary" id="cr-d">Use for the dark square</button>
        <button class="btn primary" id="cr-b">Use for both (dark one is shaded)</button>
        <button class="btn" id="cr-x">Back</button>
      </div>`;
    LP.openSheet(sheetHtml, false);
    const cv = $('#cr-cv'), x = cv.getContext('2d');
    const win = () => { const s = base / zoom; return { s, sx: Math.max(0, Math.min(im.width - s, (im.width - s) / 2 + ox)), sy: Math.max(0, Math.min(im.height - s, (im.height - s) / 2 + oy)) }; };
    const show = () => { const w = win(); x.clearRect(0, 0, V, V); x.drawImage(im, w.sx, w.sy, w.s, w.s, 0, 0, V, V); };
    show();
    let drag = null;
    cv.style.touchAction = 'none';
    cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => {
      if (!drag) return;
      const k = (base / zoom) / cv.getBoundingClientRect().width;
      ox = drag.ox - (e.clientX - drag.x) * k; oy = drag.oy - (e.clientY - drag.y) * k;
      const w = win(); ox = w.sx - (im.width - w.s) / 2; oy = w.sy - (im.height - w.s) / 2;   // keep inside the picture
      show();
    };
    cv.onpointerup = cv.onpointercancel = () => { drag = null; };
    $('#cr-z').oninput = (e) => { zoom = +e.target.value; show(); };
    const sample = (shade) => {
      const n = S.n, w = win(), c = document.createElement('canvas');
      c.width = c.height = n;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(im, w.sx, w.sy, w.s, w.s, 0, 0, n, n);
      const data = g.getImageData(0, 0, n, n).data, out = [];
      for (let i = 0; i < n * n; i++) out.push(toHex(data[i * 4] * (1 - shade), data[i * 4 + 1] * (1 - shade), data[i * 4 + 2] * (1 - shade)));
      return out;
    };
    const done = () => { S.undo = []; draw(); };
    $('#cr-l').onclick = () => { S.l = sample(0); S.tab = 'l'; done(); };
    $('#cr-d').onclick = () => { S.d = sample(0); S.tab = 'd'; done(); };
    $('#cr-b').onclick = () => { S.l = sample(0); S.d = sample(0.38); S.tab = 'l'; done(); };
    $('#cr-x').onclick = () => draw();
  }

  LP.boardEditor = { has: () => !!load(), resolve, open, remove() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } } };
})();
