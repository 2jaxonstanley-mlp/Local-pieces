/**
 * Position editor: set up any chess position, check it is legal, then play it against the computer or a friend,
 * save it on this device, or copy / paste it as FEN code. Custom positions do not change your Elo, leaderboard or rewards.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const KEY = 'localPieces.positions';
  const MAXP = 30;
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const GLYPH = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
  const ORDER = ['k', 'q', 'r', 'b', 'n', 'p'];
  let cells = new Array(64).fill('');     // index = rank * 8 + file, 'P' = white pawn, 'p' = black pawn ...
  let turn = 'w', castle = { K: true, Q: true, k: true, q: true };
  let brush = 'P';                         // piece letter to place, or 'x' for the eraser
  let flipped = false;
  let built = false;

  const readSaved = () => { try { const l = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  const writeSaved = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, MAXP))); return true; } catch (e) { return false; } };

  function toFen() {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', e = 0;
      for (let f = 0; f < 8; f++) {
        const c = cells[r * 8 + f];
        if (!c) { e++; continue; }
        if (e) { row += e; e = 0; }
        row += c;
      }
      if (e) row += e;
      rows.push(row);
    }
    const cs = (castle.K ? 'K' : '') + (castle.Q ? 'Q' : '') + (castle.k ? 'k' : '') + (castle.q ? 'q' : '');
    return rows.join('/') + ' ' + turn + ' ' + (cs || '-') + ' - 0 1';
  }
  function fromFen(fen) {
    const probe = new window.Chess();
    const err = probe.loadFen(fen);
    if (err) return err;
    const parts = fen.trim().split(/\s+/);
    const next = new Array(64).fill('');
    parts[0].split('/').forEach((row, i) => {
      let f = 0;
      for (const c of row) { if (/[1-8]/.test(c)) f += +c; else { next[(7 - i) * 8 + f] = c; f++; } }
    });
    cells = next;
    turn = parts[1] === 'b' ? 'b' : 'w';
    const cs = parts[2] || '-';
    castle = { K: cs.includes('K'), Q: cs.includes('Q'), k: cs.includes('k'), q: cs.includes('q') };
    return '';
  }
  function problems() {
    const probe = new window.Chess();
    const err = probe.loadFen(toFen());
    if (err) return [err];
    return probe.problems();
  }

  /* ------------------------------------------------------------------ drawing */
  function drawBoard() {
    const b = $('#ed-board');
    b.innerHTML = '';
    for (let i = 0; i < 64; i++) {
      const r = flipped ? Math.floor(i / 8) : 7 - Math.floor(i / 8), f = flipped ? 7 - (i % 8) : i % 8;
      const el = document.createElement('div');
      el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark');
      const last = flipped ? 7 : 0;
      if (r === last) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = 'abcdefgh'[f]; el.appendChild(c); }
      if (f === (flipped ? 7 : 0)) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = r + 1; el.appendChild(c); }
      const p = cells[r * 8 + f];
      if (p) { const s = document.createElement('span'); s.className = 'piece ' + (p === p.toUpperCase() ? 'w' : 'b'); s.textContent = GLYPH[p.toLowerCase()]; el.appendChild(s); }
      el.onclick = () => put(r * 8 + f);
      b.appendChild(el);
    }
  }
  function drawPalette() {
    const pal = $('#ed-pal');
    const btn = (letter, glyph, cls) => `<button class="ed-pc${brush === letter ? ' on' : ''}" data-l="${letter}" aria-label="${letter === 'x' ? 'Eraser' : (cls === 'w' ? 'White ' : 'Black ') + glyph}"><span class="piece ${cls}">${letter === 'x' ? '✕' : GLYPH[letter.toLowerCase()]}</span></button>`;
    pal.innerHTML = '<div class="ed-prow">' + ORDER.map((t) => btn(t.toUpperCase(), t, 'w')).join('') + '</div><div class="ed-prow">' + ORDER.map((t) => btn(t, t, 'b')).join('') + '</div><div class="ed-prow"><button class="ed-pc ed-erase' + (brush === 'x' ? ' on' : '') + '" data-l="x">Eraser</button></div>';
    pal.querySelectorAll('.ed-pc').forEach((b) => { b.onclick = () => { brush = b.dataset.l; drawPalette(); }; });
  }
  function drawInfo() {
    const pr = problems();
    const box = $('#ed-msg');
    box.className = 'ed-msg ' + (pr.length ? 'bad' : 'ok');
    box.innerHTML = pr.length ? pr.map((x) => '<div>' + esc(x) + '</div>').join('') : 'Looks good. This position can be played.';
    $('#ed-play1').disabled = $('#ed-play2').disabled = pr.length > 0;
    $('#ed-white').classList.toggle('on', turn === 'w');
    $('#ed-black').classList.toggle('on', turn === 'b');
    ['K', 'Q', 'k', 'q'].forEach((c) => { $('#ed-c' + c).checked = castle[c]; });
    $('#ed-fen').value = toFen();
  }
  const redraw = () => { drawBoard(); drawInfo(); };

  function put(i) {
    const r = Math.floor(i / 8), f = i % 8;
    if (brush === 'x') cells[r * 8 + f] = '';
    else cells[r * 8 + f] = cells[r * 8 + f] === brush ? '' : brush;
    redraw();
  }

  /* ------------------------------------------------------------------ saved positions */
  function stamp(t) { const d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  function saveSheet() {
    LP.openSheet('<h2>Save this position<span class="sub">Give it a name so you can find it again.</span></h2><input id="ed-name" class="text-in" maxlength="30" placeholder="My position" autocomplete="off"><div class="row"><button class="btn" id="ed-sx">Cancel</button><button class="btn primary" id="ed-sok">Save</button></div>', true);
    const nm = $('#ed-name');
    nm.focus();
    const ok = () => {
      const l = readSaved();
      l.unshift({ id: Date.now().toString(36), name: nm.value.trim() || 'Position ' + (l.length + 1), fen: toFen(), date: Date.now() });
      LP.closeSheet();
      toast(writeSaved(l) ? 'Position saved' : 'Could not save on this device');
    };
    $('#ed-sok').onclick = ok;
    $('#ed-sx').onclick = LP.closeSheet;
    nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }
  function loadSheet() {
    const l = readSaved();
    LP.openSheet('<h2>Saved positions</h2>' + (l.length ? '<div class="ed-saved">' + l.map((p) => `<div class="ed-sv" data-id="${p.id}"><button class="ed-sv-go"><b>${esc(p.name)}</b><small>${stamp(p.date)}</small></button><button class="ed-sv-del" aria-label="Delete ${esc(p.name)}">✕</button></div>`).join('') + '</div>' : '<p class="note">Nothing saved yet. Set up a position and press Save.</p>') + '<button class="btn wide" id="ed-lx">Close</button>', true);
    $('#ed-lx').onclick = LP.closeSheet;
    document.querySelectorAll('.ed-sv').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('.ed-sv-go').onclick = () => { const p = readSaved().find((x) => x.id === id); if (p && !fromFen(p.fen)) { LP.closeSheet(); redraw(); } };
      row.querySelector('.ed-sv-del').onclick = () => { writeSaved(readSaved().filter((x) => x.id !== id)); loadSheet(); };
    });
  }
  function pasteSheet() {
    LP.openSheet('<h2>Import from FEN<span class="sub">Paste or type a FEN code (the standard text for a chess position). A board alone also works.</span></h2><textarea id="ed-paste" class="text-in" rows="3" placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"></textarea><div id="ed-perr" class="note"></div><div class="row"><button class="btn" id="ed-px">Cancel</button><button class="btn" id="ed-pclip">Paste</button><button class="btn primary" id="ed-pok">Import</button></div>', true);
    $('#ed-px').onclick = LP.closeSheet;
    $('#ed-pclip').onclick = () => {
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => { $('#ed-paste').value = t.trim(); }, () => { $('#ed-perr').textContent = 'Your browser blocked the clipboard. Paste into the box instead.'; });
      else $('#ed-perr').textContent = 'Paste into the box instead.';
    };
    $('#ed-pok').onclick = () => {
      let txt = $('#ed-paste').value.trim().replace(/\s+/g, ' ');
      if (txt && txt.split(' ').length === 1) txt += ' w - - 0 1';   // just the board
      const err = fromFen(txt);
      if (err) { $('#ed-perr').textContent = err; return; }
      LP.closeSheet(); redraw();
    };
  }
  /** Import and Export both start by asking which format: FEN or PGN. */
  function askFormat(verb, onFen, onPgn) {
    LP.openSheet(`<h2>${verb}<span class="sub">${verb === 'Import' ? 'What are you importing?' : 'What do you want to export?'}</span></h2>
      <div class="stack"><button class="btn big" id="ed-fmt-fen">FEN<small>One position as a line of text</small></button>
      <button class="btn big" id="ed-fmt-pgn">PGN<small>${verb === 'Import' ? 'A whole game: the editor shows its final position' : 'The position as a PGN file'}</small></button>
      <button class="btn" id="ed-fmt-x">Cancel</button></div>`, true);
    $('#ed-fmt-fen').onclick = onFen;
    $('#ed-fmt-pgn').onclick = onPgn;
    $('#ed-fmt-x').onclick = LP.closeSheet;
  }

  /* ---- PGN import: play the moves through and show the final position */
  const normSan = (t) => String(t).replace(/[+#!?]/g, '').replace(/=/g, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');
  function parsePgn(text) {
    const g = new window.Chess();
    g.reset();
    const fm = /\[FEN\s+"([^"]+)"\s*\]/i.exec(text);
    if (fm) { const e = g.loadFen(fm[1]); if (e) return { err: 'The FEN inside the PGN is not valid. ' + e }; }
    let body = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let prev;
    do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);   // variations
    body = body.replace(/\$\d+/g, ' ').replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ').replace(/\d+\.+/g, ' ');
    const toks = body.split(/\s+/).filter(Boolean);
    if (!toks.length && !fm) return { err: 'No moves found. Paste the text of a PGN game.' };
    let n = 0;
    for (const t of toks) {
      const want = normSan(t);
      const m = g.legalMoves().find((x) => normSan(g.moveToSan(x)) === want);
      if (!m) return { err: 'Move ' + (n + 1) + ' (' + t + ') is not legal in this game.' };
      g.makeMove(m);
      n++;
    }
    return { fen: g.toFen(), n };
  }
  function pgnImportSheet() {
    LP.openSheet('<h2>Import from PGN<span class="sub">Paste the PGN of a game. The editor will show the position after its last move.</span></h2><textarea id="ed-paste" class="text-in" rows="6" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"></textarea><div id="ed-perr" class="note"></div><div class="row"><button class="btn" id="ed-px">Cancel</button><button class="btn" id="ed-pclip">Paste</button><button class="btn primary" id="ed-pok">Import</button></div>', true);
    $('#ed-px').onclick = LP.closeSheet;
    $('#ed-pclip').onclick = () => {
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => { $('#ed-paste').value = t.trim(); }, () => { $('#ed-perr').textContent = 'Your browser blocked the clipboard. Paste into the box instead.'; });
      else $('#ed-perr').textContent = 'Paste into the box instead.';
    };
    $('#ed-pok').onclick = () => {
      const r = parsePgn($('#ed-paste').value);
      if (r.err) { $('#ed-perr').textContent = r.err; return; }
      const err = fromFen(r.fen);
      if (err) { $('#ed-perr').textContent = err; return; }
      LP.closeSheet(); redraw();
      toast(r.n ? 'Loaded ' + r.n + ' move' + (r.n === 1 ? '' : 's') : 'Position loaded');
    };
  }

  /* ---- export */
  function exportFenSheet() {
    if (LP.exporter && LP.exporter.boardSheet) LP.exporter.boardSheet(toFen(), false);   // FEN text or a picture, copy or download
    else copyFen();
  }
  function positionPgn() {
    const d = new Date(), z = (x) => String(x).padStart(2, '0');
    return ['[Event "Local Pieces position"]', '[Site "Local Pieces"]', '[Date "' + d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate()) + '"]', '[Round "-"]', '[White "White"]', '[Black "Black"]', '[Result "*"]', '[SetUp "1"]', '[FEN "' + toFen() + '"]', '', '*', ''].join('\n');
  }
  function exportPgnSheet() {
    const text = positionPgn();
    LP.openSheet('<h2>Export PGN<span class="sub">The position, ready to open in any chess program.</span></h2><textarea id="ex-text" class="ex-text" readonly rows="8" spellcheck="false"></textarea><div class="row"><button class="btn" id="ed-pgc">Copy</button><button class="btn primary" id="ed-pgd">Download</button></div><button class="btn wide" id="ed-pgx" style="margin-top:.6rem">Close</button>', true);
    const ta = $('#ex-text');
    ta.value = text;
    const flash = (b, t) => { const o = b.dataset.t || b.textContent; b.dataset.t = o; b.textContent = t; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = o; }, 1600); };
    $('#ed-pgc').onclick = async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { try { ta.removeAttribute('readonly'); ta.focus(); ta.select(); ok = document.execCommand('copy'); ta.setAttribute('readonly', ''); } catch (x) { ok = false; } }
      flash($('#ed-pgc'), ok ? 'Copied!' : 'Press and hold the text to copy');
    };
    $('#ed-pgd').onclick = () => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
      a.href = url; a.download = 'position-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.pgn'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      flash($('#ed-pgd'), 'Downloaded');
    };
    $('#ed-pgx').onclick = LP.closeSheet;
  }
  function copyFen() {
    const f = toFen();
    const done = () => toast('FEN copied');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(f).then(done, () => { $('#ed-fen').select(); toast('Select the code above and copy it'); });
    else { $('#ed-fen').select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Select the code above and copy it'); } }
  }
  let tt = 0;
  function toast(t) { const e = $('#ed-toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 1400); }

  /* ------------------------------------------------------------------ page */
  function build() {
    const sec = document.createElement('section');
    sec.id = 'editor'; sec.className = 'page';
    sec.innerHTML = `<header class="game-header">
        <button id="ed-back" class="text-btn" aria-label="Back to menu">&larr; Menu</button>
        <span class="pz-head"><span class="mode-title">Position editor</span></span>
        <span class="header-spacer"></span>
      </header>
      <div class="layout"><div class="board-col">
        <div class="board-wrap"><div id="ed-board" class="board"></div><div id="ed-toast" class="toast" role="status"></div></div>
        <div id="ed-pal" class="ed-pal"></div>
      </div><div class="panel ed-panel">
        <div id="ed-msg" class="ed-msg"></div>
        <div class="ed-row"><span class="ed-l">To move</span><button class="btn seg" id="ed-white">White</button><button class="btn seg" id="ed-black">Black</button></div>
        <div class="ed-row ed-cast"><span class="ed-l">Castling</span>
          <label><input type="checkbox" id="ed-cK"> White short</label><label><input type="checkbox" id="ed-cQ"> White long</label>
          <label><input type="checkbox" id="ed-ck"> Black short</label><label><input type="checkbox" id="ed-cq"> Black long</label></div>
        <div class="controls ed-tools"><button class="btn" id="ed-clear">Clear</button><button class="btn" id="ed-start">Start position</button><button class="btn" id="ed-flip">Flip</button></div>
        <div class="ed-row"><input id="ed-fen" class="text-in ed-fen" readonly aria-label="FEN code"></div>
        <div class="controls ed-tools"><button class="btn" id="ed-import">Import</button><button class="btn" id="ed-export">Export</button><button class="btn" id="ed-save">Save</button><button class="btn" id="ed-load">Saved</button></div>
        <div class="controls ed-go"><button class="btn primary" id="ed-play1">Play the computer</button><button class="btn primary" id="ed-play2">Play 2 players</button></div>
        <p class="note">Position games are for fun: they never change your Elo, leaderboard or rewards. You play White against the computer.</p>
      </div></div>`;
    $('#app').insertBefore(sec, $('#sheet-bg'));
    $('#ed-back').onclick = () => LP.showPage('menu');
    $('#ed-white').onclick = () => { turn = 'w'; drawInfo(); };
    $('#ed-black').onclick = () => { turn = 'b'; drawInfo(); };
    ['K', 'Q', 'k', 'q'].forEach((c) => { $('#ed-c' + c).onchange = (e) => { castle[c] = e.target.checked; drawInfo(); }; });
    $('#ed-clear').onclick = () => { cells = new Array(64).fill(''); castle = { K: false, Q: false, k: false, q: false }; redraw(); };
    $('#ed-start').onclick = () => { fromFen(START); redraw(); };
    $('#ed-flip').onclick = () => { flipped = !flipped; drawBoard(); };
    $('#ed-import').onclick = () => askFormat('Import', pasteSheet, pgnImportSheet);
    $('#ed-export').onclick = () => askFormat('Export', exportFenSheet, exportPgnSheet);
    $('#ed-save').onclick = saveSheet;
    $('#ed-load').onclick = loadSheet;
    $('#ed-play1').onclick = () => { if (!problems().length) LP.playPosition(toFen(), 1); };
    $('#ed-play2').onclick = () => { if (!problems().length) LP.playPosition(toFen(), 2); };
    built = true;
  }
  function show() {
    if (!built) { build(); fromFen(START); }
    drawPalette();
    redraw();
    LP.showPage('editor');
  }
  const m = document.querySelector('.mode[data-mode="editor"]');
  if (m) m.addEventListener('click', show);
  LP.editor = { show, toFen, fromFen: (f) => { const e = fromFen(f); if (built && !e) redraw(); return e; } };
})();
