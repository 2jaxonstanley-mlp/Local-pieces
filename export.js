/**
 * Exports.
 *   LP.exporter.matchSheet(data, back)  - a finished chess game (Classic, Bullet, Rapid) as PGN or as a plain move list, to copy or download.
 *                                         data = the saved game (the same object History keeps); back = what to do when Close is tapped (optional)
 *   LP.exporter.boardSheet(fen, back)   - one position as FEN text or as a picture (PNG), to copy or download
 *   LP.exporter.canExport(data)         - true for games that can be exported as a match (not Secret Queen, TAS or Capture Rush)
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const MODE_NAME = { basic: 'Classic', bullet: 'Bullet', rapid: 'Rapid' };
  const pad = (n) => String(n).padStart(2, '0');
  const canExport = (d) => !!d && !d.tas && !!MODE_NAME[d.mode2 || d.mode] && (d.mode2 || d.mode) !== 'secret' && Array.isArray(d.sans) && d.sans.length > 0;

  /* ------------------------------------------------------------------ match text */
  const tag = (s) => String(s == null ? '' : s).replace(/[\\"]/g, '').replace(/[\r\n]+/g, ' ').trim() || '?';
  function resultOf(d) {
    if (d.winner === 'w') return '1-0';
    if (d.winner === 'b') return '0-1';
    return /draw|stalemate|repetition|insufficient|50-move/i.test(d.result || '') ? '1/2-1/2' : '*';
  }
  function dateParts(d) { const t = new Date(d.date || Date.now()); return { y: t.getFullYear(), m: pad(t.getMonth() + 1), d: pad(t.getDate()) }; }
  /** Where the numbering starts: a game from a custom position may have Black to move first. */
  function startOf(d) {
    const p = String(d.fen || '').trim().split(/\s+/);
    return { black: p[1] === 'b', num: parseInt(p[5], 10) > 0 ? parseInt(p[5], 10) : 1 };
  }
  function movePairs(d) {
    const st = startOf(d), out = [];
    let num = st.num, white = !st.black;
    d.sans.forEach((s, i) => {
      if (white) out.push({ n: num, w: s, b: null });
      else if (i === 0) out.push({ n: num, w: null, b: s });
      else out[out.length - 1].b = s;
      if (!white) num++;
      white = !white;
    });
    return out;
  }
  function pgn(d) {
    const dt = dateParts(d), name = MODE_NAME[d.mode2 || d.mode] || 'Classic', res = resultOf(d);
    const tags = [
      ['Event', 'Local Pieces ' + name],
      ['Site', 'Local Pieces'],
      ['Date', dt.y + '.' + dt.m + '.' + dt.d],
      ['Round', '-'],
      ['White', (d.names && d.names.w) || 'White'],
      ['Black', (d.names && d.names.b) || 'Black'],
      ['Result', res],
    ];
    if (d.clock && d.clock.base) tags.push(['TimeControl', Math.round(d.clock.base / 1000) + (d.clock.inc ? '+' + Math.round(d.clock.inc / 1000) : '')]);
    if (d.resigned) tags.push(['Termination', 'abandoned']);
    else if (/ran out of time/i.test(d.result || '')) tags.push(['Termination', 'time forfeit']);
    else if (/checkmate|stalemate|repetition|insufficient|50-move/i.test(d.result || '')) tags.push(['Termination', 'normal']);
    if (d.fen) { tags.push(['SetUp', '1']); tags.push(['FEN', d.fen]); }
    const head = tags.map((t) => `[${t[0]} "${t[0] === 'FEN' ? t[1] : tag(t[1])}"]`).join('\n');
    const toks = [];
    const st = startOf(d);
    let white = !st.black, num = st.num;
    d.sans.forEach((s, i) => {
      if (white) toks.push(num + '. ' + s);
      else { toks.push((i === 0 ? num + '... ' : '') + s); num++; }
      white = !white;
    });
    toks.push(res);
    const lines = [];
    let line = '';
    toks.forEach((t) => {
      if ((line + ' ' + t).trim().length > 80) { lines.push(line); line = t; } else line = (line ? line + ' ' : '') + t;
    });
    if (line) lines.push(line);
    return head + '\n\n' + lines.join('\n') + '\n';
  }
  function plain(d) {
    const dt = dateParts(d), name = MODE_NAME[d.mode2 || d.mode] || 'Classic';
    const nw = (d.names && d.names.w) || 'White', nb = (d.names && d.names.b) || 'Black';
    const rows = movePairs(d).map((p) => `${String(p.n).padStart(3)}. ${(p.w || '...').padEnd(8)}${p.b || ''}`.replace(/\s+$/, ''));
    return [
      `${nw} (White) vs ${nb} (Black)`,
      `${name} · ${dt.d}/${dt.m}/${dt.y}` + (d.clock && d.clock.base ? ` · ${Math.round(d.clock.base / 60000 * 10) / 10} min` + (d.clock.inc ? ` + ${Math.round(d.clock.inc / 1000)}s` : '') : ''),
      d.result ? 'Result: ' + d.result : '',
      d.fen ? 'Start position: ' + d.fen : '',
      '',
    ].filter((x, i) => x || i === 4).concat(rows, ['']).join('\n');
  }

  /* ------------------------------------------------------------------ copy and download */
  async function copyText(text, ta) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
    try { if (ta) { ta.removeAttribute('readonly'); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); const ok = document.execCommand('copy'); ta.setAttribute('readonly', ''); if (ok) return true; } } catch (e) { /* ignore */ }
    return false;
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'player';
  function flash(btn, text) {
    const old = btn.dataset.t || btn.textContent;
    btn.dataset.t = old; btn.textContent = text;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = old; }, 1600);
  }
  const seg = (items, on) => `<div class="ex-seg">${items.map(([k, t]) => `<button type="button" class="${k === on ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}</div>`;

  /* ------------------------------------------------------------------ the match sheet */
  function matchSheet(d, back) {
    if (!canExport(d)) return;
    let fmt = 'pgn';
    const names = ((d.names && d.names.w) || 'White') + ' vs ' + ((d.names && d.names.b) || 'Black');
    LP.openSheet(`<h2>Export match<span class="sub">${esc(names)}</span></h2>
      ${seg([['pgn', 'PGN'], ['txt', 'Move list']], fmt)}
      <textarea id="ex-text" class="ex-text" readonly rows="10" spellcheck="false"></textarea>
      <div class="row"><button class="btn" id="ex-copy">Copy</button><button class="btn primary" id="ex-dl">Download</button></div>
      <button class="btn wide" id="ex-x" style="margin-top:.6rem">${back ? 'Back' : 'Close'}</button>`, true);
    const ta = $('#ex-text');
    const text = () => (fmt === 'pgn' ? pgn(d) : plain(d));
    const paint = () => {
      ta.value = text();
      document.querySelectorAll('.ex-seg button').forEach((b) => b.classList.toggle('on', b.dataset.f === fmt));
    };
    document.querySelectorAll('.ex-seg button').forEach((b) => { b.onclick = () => { fmt = b.dataset.f; paint(); }; });
    $('#ex-copy').onclick = async () => { const ok = await copyText(text(), ta); flash($('#ex-copy'), ok ? 'Copied!' : 'Press and hold the text to copy'); };
    $('#ex-dl').onclick = () => {
      const dt = dateParts(d), base = slug(d.names && d.names.w) + '-vs-' + slug(d.names && d.names.b) + '-' + dt.y + dt.m + dt.d;
      download(base + (fmt === 'pgn' ? '.pgn' : '.txt'), new Blob([text()], { type: 'text/plain;charset=utf-8' }));
      flash($('#ex-dl'), 'Downloaded');
    };
    $('#ex-x').onclick = () => { LP.closeSheet(); if (back) back(); };
    paint();
  }

  /* ------------------------------------------------------------------ the board sheet */
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  /** Draw a position (from its FEN) as a picture, White at the bottom. */
  function boardCanvas(fen) {
    const S = 800, M = 36, C = (S - M * 2) / 8, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#2b2f33'; g.fillRect(0, 0, S, S);
    const rows = String(fen).split(' ')[0].split('/');
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      g.fillStyle = (r + f) % 2 === 0 ? '#eeeed2' : '#769656';
      g.fillRect(M + f * C, M + r * C, C, C);
    }
    g.font = '600 22px sans-serif'; g.fillStyle = '#c9ced3'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) { g.fillText('abcdefgh'[i], M + i * C + C / 2, S - M / 2); g.fillText(String(8 - i), M / 2, M + i * C + C / 2); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = Math.round(C * 0.86) + 'px "Segoe UI Symbol","Noto Sans Symbols2","Apple Symbols",serif';
    rows.forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        const white = ch === ch.toUpperCase(), glyph = (GLYPH[ch.toLowerCase()] || '?') + '︎';
        const x = M + f * C + C / 2, y = M + r * C + C / 2 + C * 0.04;
        g.lineWidth = 5; g.strokeStyle = white ? '#222' : '#f2f2f2'; g.strokeText(glyph, x, y);
        g.fillStyle = white ? '#fff' : '#111'; g.fillText(glyph, x, y);
        f++;
      }
    });
    return cv;
  }
  function boardSheet(fen, back) {
    if (!fen) return;
    let fmt = 'fen', cv = null;
    LP.openSheet(`<h2>Export board<span class="sub">The position on the board right now</span></h2>
      ${seg([['fen', 'FEN'], ['img', 'Image']], fmt)}
      <textarea id="ex-text" class="ex-text" readonly rows="3" spellcheck="false"></textarea>
      <img id="ex-img" class="ex-img hidden" alt="The board">
      <div class="row"><button class="btn" id="ex-copy">Copy</button><button class="btn primary" id="ex-dl">Download</button></div>
      <button class="btn wide" id="ex-x" style="margin-top:.6rem">${back ? 'Back' : 'Close'}</button>`, true);
    const ta = $('#ex-text'), im = $('#ex-img');
    const paint = () => {
      document.querySelectorAll('.ex-seg button').forEach((b) => b.classList.toggle('on', b.dataset.f === fmt));
      ta.classList.toggle('hidden', fmt !== 'fen');
      im.classList.toggle('hidden', fmt !== 'img');
      if (fmt === 'fen') ta.value = fen;
      else { if (!cv) { cv = boardCanvas(fen); im.src = cv.toDataURL('image/png'); } }
    };
    document.querySelectorAll('.ex-seg button').forEach((b) => { b.onclick = () => { fmt = b.dataset.f; paint(); }; });
    $('#ex-copy').onclick = async () => {
      const btn = $('#ex-copy');
      if (fmt === 'fen') { flash(btn, (await copyText(fen, ta)) ? 'Copied!' : 'Press and hold the text to copy'); return; }
      try {
        const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        flash(btn, 'Copied!');
      } catch (e) { flash(btn, 'Copy is not available here, use Download'); }
    };
    $('#ex-dl').onclick = async () => {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      if (fmt === 'fen') download('position-' + stamp + '.txt', new Blob([fen + '\n'], { type: 'text/plain;charset=utf-8' }));
      else {
        const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
        download('position-' + stamp + '.png', blob);
      }
      flash($('#ex-dl'), 'Downloaded');
    };
    $('#ex-x').onclick = () => { LP.closeSheet(); if (back) back(); };
    paint();
  }

  LP.exporter = { canExport, matchSheet, boardSheet, pgn, plain };
})();
