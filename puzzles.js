/**
 * Puzzle screen: Checkmate (pick the difficulty, then how many moves to mate, 1 to 8), Check (safe check within N moves; Black replies),
 * Best move and Sacrifice (Easy / Normal / Hard each). The positions come from puzzlegen.js. Progress is saved so the menu can offer "Continue playing".
 * A bad move stays on the board with a speech bubble (and a red arrow when Black can punish it) until you press Undo or Retry.
 * After a puzzle is finished, failed or its solution shown, Analysis lets you move both sides, step through the line and try what-ifs.
 */
(() => {
  'use strict';
  const LP = window.LP, PG = window.PuzzleGen;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const FILLED = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };
  const glyph = (p) => FILLED[p & 7] + '︎';
  const DIFF = { easy: 'Easy', normal: 'Normal', hard: 'Hard', insane: 'Insane' };
  const TITLE = { mate: 'Checkmate puzzles', check: 'Check puzzles', best: 'Best move', sac: 'Sacrifice' };
  const PIECE_NAME = { 5: 'Queen', 4: 'Rook', 3: 'Bishop', 2: 'Knight' };

  let cfg = null;          // { type, diff, n } (n: wanted mate length, 0 = any for the level)
  let P = null;            // the puzzle
  let g = null;            // live position
  let els = {};
  let sel = -1, targets = [];
  let log = [];            // committed moves (and Black's replies), for saving
  let busy = false;        // generating, or Black is replying, or a wrong move is being taken back
  let state = 'idle';      // gen | play | wrong (bad move shown, waiting for Undo/Retry) | failed | solved | analysis
  let bad = null;          // the bad move that is still on the board (state 'wrong')
  let an = null;           // analysis: { line: [moves from the start], sans: [], idx, why }
  let userMoves = 0;
  let snaps = [];          // check puzzles: board before each of your moves (for Undo)
  let hints = [];          // squares to highlight
  let last = null;
  let revealed = false;    // the solution was shown, so it does not count as solved
  let token = 0;
  let toastTimer = null;
  let tw = null, trp = null;   // mate puzzles from the bank: the proof-tree node White is on, or the replies awaiting Black

  let missed = false;      // a hint, the solution or a wrong move was used on this puzzle
  // Records are per difficulty AND type, so a Check streak never overwrites a Checkmate streak.
  const stats = {
    all() { try { return JSON.parse(localStorage.getItem('localPieces.puzzleStats2')) || {}; } catch (e) { return {}; } },
    key(d, t) { return (d || cfg.diff) + ':' + (t || cfg.type); },
    get(d, t) { return Object.assign({ solved: 0, missed: 0, streak: 0, best: 0 }, stats.all()[stats.key(d, t)] || {}); },
    put(s, d, t) { const a = stats.all(); a[stats.key(d, t)] = s; try { localStorage.setItem('localPieces.puzzleStats2', JSON.stringify(a)); } catch (e) { /* ignore */ } },
    miss() {
      if (missed || !P) return;
      missed = true;
      const s = stats.get(); s.missed++; s.streak = 0; stats.put(s);
      if (LP.stats) LP.stats.puzzle({ diff: cfg.diff, type: cfg.type, miss: true });
      updateInfo();
    },
    win() {
      const s = stats.get(); s.solved++;
      if (!missed) { s.streak++; s.best = Math.max(s.best, s.streak); }
      stats.put(s);
      if (LP.stats) LP.stats.puzzle({ diff: cfg.diff, type: cfg.type, clean: !missed });
    },
  };

  /* ------------------------------------------------------------------ board */
  function buildBoard() {
    const boardEl = $('#pz-board');
    boardEl.innerHTML = '';
    els = {};
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const s = r * 16 + f;
        const el = document.createElement('div');
        el.className = 'square ' + ((f + r) % 2 === 1 ? 'light' : 'dark');
        el.dataset.sq = s;
        if (r === 0) { const c = document.createElement('span'); c.className = 'coord file'; c.textContent = 'abcdefgh'[f]; el.appendChild(c); }
        if (f === 0) { const c = document.createElement('span'); c.className = 'coord rank'; c.textContent = r + 1; el.appendChild(c); }
        boardEl.appendChild(el);
        els[s] = el;
      }
    }
  }

  function render() {
    const legal = new Set(targets.map((m) => m.to));
    const side = state === 'analysis' ? g.turn : 0x10;
    const chk = state !== 'gen' && g.inCheck(side) ? g.kingSquare(side) : -1;
    for (const key in els) {
      const s = +key, el = els[s], p = g.board[s];
      el.classList.toggle('selected', s === sel);
      el.classList.toggle('last', !!last && (last[0] === s || last[1] === s));
      el.classList.toggle('legal', legal.has(s));
      el.classList.toggle('capture', legal.has(s) && !!p);
      el.classList.toggle('check', s === chk);
      el.classList.toggle('hint-from', hints.includes(s));
      if (!p) { if (el._piece) { el._piece.remove(); el._piece = null; el._code = 0; } }
      else if (el._code !== p) {
        let pe = el._piece;
        if (!pe) { pe = document.createElement('span'); el.appendChild(pe); el._piece = pe; }
        pe.className = 'piece ' + ((p & 24) === 8 ? 'w' : 'b');
        pe.textContent = glyph(p);
        el._code = p;
      }
    }
  }

  function slide(src, dst) {
    const de = els[dst], se = els[src];
    const pe = de && de._piece;
    if (!pe || !se) return;
    pe.style.transition = 'none';
    pe.style.transform = '';
    void pe.offsetWidth;
    const a = se.getBoundingClientRect(), b = de.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    pe.style.transform = `translate(${dx}px, ${dy}px)`;
    de.style.zIndex = 6;
    void pe.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pe.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)';
      pe.style.transform = '';
      setTimeout(() => { pe.style.transition = ''; de.style.zIndex = ''; }, 280);
    }));
  }

  function setStatus(text, cls) {
    const el = $('#pz-status');
    el.className = 'status' + (cls ? ' ' + cls : '');
    el.textContent = text || ' ';
  }

  function toast(text) {
    const t = $('#pz-toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function movesLeft() { return P.limit - userMoves; }

  function updateInfo() {
    let goal = 'Find the best move for White.';
    if (P && P.type === 'mate') goal = 'Checkmate in ' + P.n + (P.n === 1 ? ' move.' : ' moves.');
    else if (P && P.type === 'check') goal = 'Safe check in ' + P.limit + (P.limit === 1 ? ' move' : ' moves') + ' (piece must not be capturable)' + (userMoves ? ' · ' + movesLeft() + ' left' : '') + '.';
    else if (P && P.type === 'sac') goal = 'Find the winning sacrifice: give material to gain more.';
    const isAn = state === 'analysis', isWrong = state === 'wrong';
    $('#pz-goal').textContent = state === 'gen' ? 'Setting up the board…' : isAn ? 'Move both sides freely. There are no right or wrong moves.' : isWrong ? 'Undo the move or retry the puzzle.' : goal;
    const s = stats.get();
    $('#pz-diff').textContent = DIFF[cfg.diff];
    $('#pz-streak').textContent = s.streak;
    $('.pz-bolt').classList.toggle('on', s.streak > 0);
    $('#pz-count').innerHTML = 'Solved ' + s.solved + ' <i>·</i> Missed ' + s.missed + ' <i>·</i> Best ' + s.best;
    $('#pz-kind').textContent = TITLE[cfg.type];
    $('#pz-turn').classList.toggle('solved', state === 'solved');
    $('#pz-turn-t').textContent = isAn ? 'Analysis' : isWrong ? 'Not quite' : state === 'solved' ? (missed || revealed ? 'Puzzle over' : 'Puzzle solved') : 'White to Move';
    const chk = cfg.type === 'check';
    $('#pz-undo').classList.toggle('hidden', !(chk || isWrong) || isAn);
    $('#pz-undo').disabled = isWrong ? false : (!snaps.length || busy || state === 'solved');
    $('#pz-undo').classList.toggle('glow', isWrong);
    $('#pz-retry').classList.toggle('glow', isWrong);
    $('#pz-hint').disabled = busy || state === 'solved' || state === 'gen' || isWrong || isAn;
    $('#pz-retry').disabled = state === 'gen';
    $('#pz-answer').disabled = busy || state === 'gen' || isAn;
    const canAn = state === 'solved' || state === 'failed' || isWrong;
    $('#pz-an-row').classList.toggle('hidden', !(canAn || isAn));
    $('#pz-analysis').classList.toggle('hidden', !canAn);
    $('#pz-exit').classList.toggle('hidden', !isAn);
    $('#pz-nav').classList.toggle('hidden', !isAn);
    $('#pz-fix').classList.toggle('hidden', !isWrong);
    if (isAn && an) {
      $('#pz-nb').disabled = an.idx <= 0;
      $('#pz-nf').disabled = an.idx >= an.line.length;
      $('#pz-nlabel').textContent = (an.idx ? an.sans[an.idx - 1] : 'Start') + ' · ' + an.idx + ' / ' + an.line.length;
    }
    $('#pz-next').classList.toggle('glow', state === 'solved');
  }

  function prompt() {
    if (state === 'wrong') return 'Not quite. Undo the move or retry.';
    if (state === 'analysis') return 'Analysis: move either side, or use the arrows to step through the line.';
    if (state === 'failed') return 'Out of moves. Undo a move or retry.';
    if (P.type === 'mate') return P.n >= 2 && userMoves >= 1 ? (P.n - userMoves === 1 ? 'Now deliver checkmate' : 'Keep forcing: checkmate in ' + (P.n - userMoves) + ' more') : 'White to move: find the checkmate' + (P.n > 1 ? ' in ' + P.n : '');
    if (P.type === 'check') return 'Give a safe check in ' + movesLeft() + (movesLeft() === 1 ? ' move' : ' moves') + ' or fewer. Black will reply.';
    if (P.type === 'sac') return 'Sacrifice material to win more back (or force mate).';
    return 'Which move is best for White?';
  }

  /* ------------------------------------------------------------- persistence */
  function save() {
    if (!P || (state !== 'play' && state !== 'failed')) return;
    LP.session.set({ kind: 'puzzle', cfg, P, log, date: Date.now() });
  }
  function clearSave() { const s = LP.session.get(); if (s && s.kind === 'puzzle') LP.session.clear(); }

  /* ------------------------------------------------------------- favourites and explanations */
  const FAVKEY = 'localPieces.puzzleFavs';
  const MAXFAV = 40;
  const NAMES = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
  const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
  const favs = {
    all() { try { const l = JSON.parse(localStorage.getItem(FAVKEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; } },
    put(l) { try { localStorage.setItem(FAVKEY, JSON.stringify(l.slice(0, MAXFAV))); return true; } catch (e) { return false; } },
    idOf(p) { const t = p.type + JSON.stringify(p.pos); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return p.type + ':' + (h >>> 0).toString(36); },
    has(p) { const id = favs.idOf(p); return favs.all().some((f) => f.id === id); },
    toggle(p, c) {
      const id = favs.idOf(p), l = favs.all(), i = l.findIndex((f) => f.id === id);
      if (i >= 0) { l.splice(i, 1); favs.put(l); return false; }
      if (l.length >= MAXFAV) l.pop();
      l.unshift({ id, type: p.type, diff: (c && c.diff) || p.diff, P: p, date: Date.now() });
      return favs.put(l);
    },
  };
  const VAL = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100 };
  const KDELTAS = [1, -1, 16, -16, 15, 17, -15, -17];
  const lc = (p) => NAMES[p & 7] || 'piece';

  /** Black to move after a quiet White move: could White now give checkmate? */
  function threatensMate(g0) {
    const t = g0.turn, ep = g0.ep;
    let ok = false;
    try { g0.turn = 8; g0.ep = -1; const mm = PG.mateMoves(g0, true); ok = !!(mm && mm.length); } catch (e) { /* ignore */ }
    g0.turn = t; g0.ep = ep;
    return ok;
  }
  /** g0 is the position after a mating move: say what kind of mate it is. */
  function mateReason(g0, m) {
    const k = g0.kingSquare(16), mover = g0.board[m.to] & 7;
    let blocked = 0, total = 0;
    for (const d of KDELTAS) { const q = k + d; if (q & 0x88) continue; total++; const x = g0.board[q]; if (x && (x & 24) === 16) blocked++; }
    if (mover === 2 && blocked === total) return 'Smothered mate: the king is boxed in by its own pieces and nothing can take the knight.';
    if ((k >> 4) % 7 === 0 && blocked > 0 && (mover === 4 || mover === 5) && (m.to >> 4) === (k >> 4)) return 'Back-rank mate: the king is stuck on the edge behind its own pieces.';
    return 'Checkmate: the king has no safe square, and the check cannot be captured or blocked.';
  }
  /** Why a White move in the solution works (g0 is before the move). */
  function whyWhite(g0, m) {
    const pc = lc(g0.board[m.from]), cap = g0.board[m.to] ? lc(g0.board[m.to]) : '';
    const act = cap ? 'The ' + pc + ' takes the ' + cap + ' on ' + sqName(m.to) : 'The ' + pc + ' goes to ' + sqName(m.to);
    g0.makeMove(m);
    let t;
    const chk = g0.inCheck(g0.turn), rep = g0.legalMoves();
    if (chk && !rep.length) t = act + '. ' + mateReason(g0, m);
    else if (chk) {
      const n = rep.length, safe = !rep.some((x) => x.to === m.to);
      t = act + ' with check. ' + (n <= 3 ? 'Black has only ' + n + ' legal ' + (n === 1 ? 'reply' : 'replies') + ', so the game is forced.' : 'Black must answer it.') + (safe ? ' Nothing can take the ' + pc + '.' : '');
    } else if (threatensMate(g0)) t = act + ' as a quiet move that threatens checkmate next.';
    else t = act + '.';
    g0.unmakeMove();
    return t;
  }
  /** What a Black move does (g0 is before the move). */
  function whyBlack(g0, r) {
    const pc = lc(g0.board[r.from]), cap = g0.board[r.to] ? lc(g0.board[r.to]) : '';
    if (g0.inCheck(g0.turn)) {
      if ((g0.board[r.from] & 7) === 6) return 'The king steps out of check to ' + sqName(r.to) + (cap ? ', taking the ' + cap : '') + '.';
      if (cap) return 'The ' + pc + ' takes the ' + cap + ' on ' + sqName(r.to) + ' to remove the check.';
      return 'The ' + pc + ' blocks the check on ' + sqName(r.to) + '.';
    }
    return cap ? 'The ' + pc + ' takes the ' + cap + ' on ' + sqName(r.to) + '.' : 'The ' + pc + ' goes to ' + sqName(r.to) + '.';
  }
  /** Walk a list of plain moves from the start and describe each one. */
  function narrate(pos, plains, blackLabel) {
    const g0 = PG.fromPos(pos), out = [];
    for (const e of plains) {
      const col = g0.board[e.f] & 24;
      if (col !== g0.turn) { g0.turn = col; g0.ep = -1; }
      const m = findMove(g0, e);
      if (!m) break;
      const san = PG.sanOf(g0, m), white = col === 8;
      out.push({ san, white, why: white ? whyWhite(g0, m) : blackLabel + whyBlack(g0, m) });
      g0.makeMove(m);
    }
    return out;
  }
  /** The solution as a title, a lead sentence, one explained step per move and a note on Black's other defences. */
  function explainParts(p) {
    if (p.type === 'best' || p.type === 'sac') {
      let lead = p.explain || '';
      if (p.type === 'sac') lead += ' That is roughly ' + (p.loss != null ? Math.max(1, Math.round(p.loss / 100)) : 'some') + ' point(s) of material at first, so a quick look at safe moves can mislead you.';
      return { title: (p.type === 'sac' ? 'Sacrifice: ' : 'Best move: ') + p.san, lead, steps: narrate(p.pos, [p.good[0]], ''), defence: 'Habit to build: look at every check, capture and threat for both sides, and ask what each one achieves.' };
    }
    if (p.type === 'mate') {
      const plains = [];
      let defence = '';
      const tree = PG.treeOf(p);
      if (tree) {
        const g1 = PG.fromPos(p.pos);
        let nd = tree;
        for (;;) {
          const d = PG.dec(nd[0]), m = findMove(g1, d);
          if (!m) break;
          plains.push(d); g1.makeMove(m);
          if (nd.length === 1) break;
          const r = PG.toughest(nd[1]), rd = PG.dec(r[0]), rm = findMove(g1, rd);
          if (!rm) break;
          if (!defence) defence = 'After the first move Black has ' + nd[1].length + ' legal ' + (nd[1].length === 1 ? 'reply' : 'replies') + ' and every one of them loses by force. The line shown is the toughest.';
          plains.push(rd); g1.makeMove(rm);
          nd = r[1];
        }
      } else {
        const g1 = PG.fromPos(p.pos);
        const m1 = findMove(g1, p.sol[0]);
        plains.push(p.sol[0]); g1.makeMove(m1);
        let wm = 1;
        for (let k = 1; k < p.n; k++) {
          const r = PG.bestDefence(g1, p.n - wm);
          if (r) { plains.push(plain(r)); g1.makeMove(r); }
          const m = PG.findMateMove(g1, p.n - wm);
          if (!m) break;
          plains.push(plain(m)); wm++; g1.makeMove(m);
        }
        if (p.n > 1) defence = 'Black\'s other replies lose as well: this is a forced mate in ' + p.n + '.';
      }
      const tg = p.tags || [];
      const idea = tg.includes('disc') ? ' The key idea is a discovered check: one piece steps aside and another gives check.' : tg.includes('sac') ? ' The key idea is a sacrifice that drags the defenders away.' : tg.includes('forced') ? ' The key idea is a check that leaves Black one or two legal replies, so the rest is forced.' : tg.includes('cap') ? ' It starts by taking material with tempo.' : '';
      return { title: 'Mate in ' + p.n, lead: p.n === 1 ? 'One move finishes it.' : 'A forced mate in ' + p.n + '.' + idea, steps: narrate(p.pos, plains, 'Black\'s toughest defence: '), defence };
    }
    const plains = [];
    p.path.forEach((wm, i) => { plains.push(wm); if (p.replies && p.replies[i]) plains.push(p.replies[i]); });
    return { title: 'Safe check in ' + p.path.length, lead: 'A check is safe when Black cannot capture the piece that gives it. Count which Black pieces attack the square first.', steps: narrate(p.pos, plains, 'Black replies: '), defence: '' };
  }
  function partsHtml(x) {
    return '<b>' + esc(x.title) + '</b>' + (x.lead ? '<p class="pz-lead">' + esc(x.lead) + '</p>' : '')
      + '<ol class="pz-steps">' + x.steps.map((st) => '<li class="' + (st.white ? 'w' : 'b') + '"><span class="pz-mv">' + esc(st.san) + '</span><span>' + esc(st.why) + '</span></li>').join('') + '</ol>'
      + (x.defence ? '<p class="pz-def">' + esc(x.defence) + '</p>' : '');
  }
  function explainHtml(p) {
    try { return partsHtml(explainParts(p)); } catch (e) { return '<b>Solution</b><p class="pz-lead">' + esc(p.explain || 'Look for forcing moves first: checks, captures and threats.') + '</p>'; }
  }
  function showWhy() {
    const box = $('#pz-why');
    if (!box) return;
    if (!P || !(state === 'solved' || (state === 'analysis' && an && an.why))) { box.classList.add('hidden'); return; }
    box.innerHTML = explainHtml(P);
    box.classList.remove('hidden');
  }
  function syncFav() {
    const b = $('#pz-fav');
    if (!b) return;
    const on = !!P && favs.has(P);
    b.classList.toggle('on', on);
    b.textContent = on ? '★' : '☆';
    b.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
    b.disabled = !P;
  }
  function favSheet() {
    const l = favs.all();
    LP.openSheet('<h2>Favourite puzzles<span class="sub">' + l.length + ' saved. Replay them any time.</span></h2>' + (l.length ? '<div class="pz-favs">' + l.map((f) => `<div class="an-card" data-id="${esc(f.id)}"><div class="an-top"><b>${esc(TITLE[f.type] || f.type)}</b><span class="dim">${esc(DIFF[f.diff] || '')}</span></div><div class="an-btns"><button class="btn primary pf-play">Play</button><button class="btn pf-why">Explain</button><button class="btn an-del pf-del" aria-label="Remove">✕</button></div></div>`).join('') + '</div>' : '<p class="note">No favourites yet. Tap the star on a puzzle to keep it here.</p>') + '<button class="btn wide" id="pf-x">Close</button>', true);
    $('#pf-x').onclick = startPuzzles;
    document.querySelectorAll('.pz-favs .an-card').forEach((c) => {
      const f = favs.all().find((x) => x.id === c.dataset.id);
      if (!f) return;
      c.querySelector('.pf-play').onclick = () => LP.saves.guard(() => { LP.session.fresh(); cfg = { type: f.type, diff: f.diff }; missed = false; LP.closeSheet(); LP.showPage('puzzle'); load(f.P); });
      c.querySelector('.pf-why').onclick = () => { LP.openSheet('<div class="pz-why">' + explainHtml(f.P) + '</div><button class="btn wide" id="pw-b">Back</button>', true); $('#pw-b').onclick = favSheet; };
      c.querySelector('.pf-del').onclick = () => { favs.put(favs.all().filter((x) => x.id !== f.id)); favSheet(); };
    });
  }

  /* ----------------------------------------------------------------- loading */
  const plain = (m) => ({ f: m.from, t: m.to, p: m.promo || 0 });
  const findMove = (gg, e) => gg.legalMovesFrom(e.f).find((x) => x.to === e.t && (x.promo || 0) === (e.p || 0));
  const passTurn = () => { g.turn = 8; g.ep = -1; g.castling = 0; };

  function load(p, replayLog) {
    token++;
    P = p;
    g = PG.fromPos(p.pos);
    log = []; snaps = []; userMoves = 0; sel = -1; targets = []; last = null; hints = [];
    state = 'play'; busy = false; revealed = false; bad = null; an = null; clearBubble();
    tw = p.type === 'mate' ? PG.treeOf(p) : null; trp = null;
    showWhy(); syncFav();
    buildBoard();
    if (replayLog) {
      for (const e of replayLog) {
        const m = findMove(g, e);
        if (!m) break;
        if (p.type === 'check' && !e.r) snaps.push(g.board.slice());
        if (p.type === 'mate') { if (e.r) treeBlack(m); else treeWhite(m); }
        g.makeMove(m);
        if (!e.r) userMoves++;
        log.push(e);
        last = [e.f, e.t];
      }
      if (p.type === 'check' && userMoves >= p.limit && !g.inCheck(0x10)) state = 'failed';
    }
    render();
    updateInfo();
    setStatus(prompt(), 'dim');
    save();
  }

  /** White just played m: follow the proof tree if that is the tree's move, else leave it. */
  function treeWhite(m) {
    if (tw && tw.length > 1 && PG.enc(m) === tw[0]) { trp = tw[1]; tw = null; return true; }
    tw = null; trp = null; return false;
  }
  function treeBlack(r) {
    if (trp) { const c = trp.find((x) => x[0] === PG.enc(r)); tw = c ? c[1] : null; }
    trp = null;
  }
  const mateList = () => MATEIN[cfg.diff] || [1, 2, 3];

  function newPuzzle() {
    missed = false;
    const my = ++token;
    P = null; g = PG.blank(); log = []; snaps = []; userMoves = 0; sel = -1; targets = []; last = null; hints = [];
    state = 'gen'; busy = true; bad = null; an = null; clearBubble();
    showWhy(); syncFav();
    LP.showPage('puzzle');
    buildBoard();
    render();
    updateInfo();
    setStatus('Setting up a puzzle…', 'dim');
    let want = 0;
    if (cfg.type === 'mate') { const l = mateList(); want = cfg.n && l.includes(cfg.n) ? cfg.n : l[Math.floor(Math.random() * l.length)]; }
    PG.make(cfg.type, cfg.diff, (p) => {
      if (my !== token) return;
      load(p);
      if (want && p.n !== want) toast('No mate in ' + want + ' puzzle for this level yet: here is a mate in ' + p.n);
    }, want);
  }

  /* ------------------------------------------------------------------- moves */
  function onSquare(s) {
    const isAn = state === 'analysis';
    if (busy || (state !== 'play' && !isAn) || !g) return;
    const p = g.board[s];
    const own = p && (p & 24) === (isAn ? g.turn : 8);
    if (sel >= 0) {
      const ms = targets.filter((m) => m.to === s);
      if (ms.length) { choose(ms); return; }
      if (own && s !== sel) { select(s); return; }
      sel = -1; targets = []; render();
      return;
    }
    if (own) select(s);
  }

  function select(s) {
    sel = s; targets = g.legalMovesFrom(s); hints = []; render();
  }

  function choose(ms) {
    if (ms.length === 1) { commit(ms[0]); return; }
    LP.openSheet(`<h2>Promote to</h2>
      <div class="rush-pieces">${[5, 4, 3, 2].map((t) => `<button class="btn big" data-pr="${t}"><span class="rp-g"><i class="ic-sp" style="--i:${({ 5: 2, 4: 5, 3: 1, 2: 4 })[t]}"></i></span>${PIECE_NAME[t]}</button>`).join('')}</div>`, true);
    document.querySelectorAll('[data-pr]').forEach((b) => {
      b.onclick = () => { LP.closeSheet(); const m = ms.find((x) => x.promo === +b.dataset.pr); if (m && (state === 'play' || state === 'analysis') && !busy) commit(m); };
    });
  }

  function commit(m) {
    sel = -1; targets = []; hints = [];
    if (state === 'analysis') { anMove(m); return; }
    if (P.type === 'check') snaps.push(g.board.slice());
    g.makeMove(m);
    last = [m.from, m.to];
    render();
    slide(m.from, m.to);
    if (P.type === 'mate') afterMate(m);
    else if (P.type === 'check') afterCheck(m);
    else afterBest(m);
  }

  /* ------------------------------------------------- bad moves: bubble, red arrow, Undo */
  function drawArrow(a) {
    const svg = $('#pz-arrow');
    if (!svg) return;
    if (!a || !a.length) { svg.innerHTML = ''; return; }
    const list = Array.isArray(a[0]) ? a : [a];
    const op = list.length > 4 ? 0.7 : 0.9;
    const c = (q) => [(q & 7) + 0.5, 7 - (q >> 4) + 0.5];
    svg.innerHTML = list.map((ar) => {
      const [x1, y1] = c(ar[0]), [x2, y2] = c(ar[1]);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const sx = x1 + ux * 0.3, sy = y1 + uy * 0.3, ex = x2 - ux * 0.1, ey = y2 - uy * 0.1;
      const bx = ex - ux * 0.42, by = ey - uy * 0.42;
      return `<line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="#e5484d" stroke-width="0.17" stroke-linecap="round" opacity="${op}"/>`
        + `<polygon points="${ex},${ey} ${bx - uy * 0.27},${by + ux * 0.27} ${bx + uy * 0.27},${by - ux * 0.27}" fill="#e5484d" opacity="${op}"/>`;
    }).join('');
  }
  function showBubble(text, arrow) {
    const b = $('#pz-bubble');
    if (b) { $('#pz-bubble-t').textContent = text; b.classList.remove('hidden'); }
    drawArrow(arrow);
  }
  function clearBubble() {
    const b = $('#pz-bubble');
    if (b) b.classList.add('hidden');
    drawArrow(null);
  }

  /** The bad move m is on the board and Black is to move: why does it fail, and which Black move should the arrow show? */
  function refute(m, kind, left) {
    const pn = lc(g.board[m.to]);
    const caps = g.legalMoves().filter((x) => x.to === m.to).sort((a, b) => VAL[g.board[a.from] & 7] - VAL[g.board[b.from] & 7]);
    const inChk = g.inCheck(0x10);
    if (caps.length) {
      const c = caps[0], cn = lc(g.board[c.from]);
      g.makeMove(c);
      const back = g.legalMoves().some((x) => x.to === m.to);
      g.unmakeMove();
      const base = 'Your ' + pn + ' can be taken by the ' + cn + ' on ' + sqName(c.from) + '.';
      let tail;
      if (kind === 'check') tail = ' A safe check cannot be captured.';
      else if (kind === 'mate') tail = inChk ? ' It is check, but the check can be captured, so it is not mate.' : ' That does not lead to mate.';
      else tail = back ? ' You could take back, but this is not the strongest move.' : ' You cannot take back, so you just lose the piece.';
      return { text: base + tail, arrow: [c.from, m.to] };
    }
    if (kind === 'mate') {
      const X = left + 1;                      // the mate has to come within this many White moves, counting the bad one
      const deep = left > 3;                   // too deep to test every reply quickly
      if (inChk || (left > 0 && !deep)) {
        // Every Black reply that gets away: it is not forced, and none of them lead to mate in X
        const t0 = Date.now(), outs = [];
        let partial = false;
        for (const r of g.legalMoves()) {
          if (left > 0 && !deep) {
            if (Date.now() - t0 > 800) { partial = true; break; }
            const san = PG.sanOf(g, r);
            g.makeMove(r);
            const mates = !!PG.findMateMove(g, left);
            g.unmakeMove();
            if (mates) continue;
            outs.push({ r, san });
          } else outs.push({ r, san: PG.sanOf(g, r) });
        }
        if (outs.length) {
          const shown = outs.slice(0, 8).map((o) => o.san).join(', ') + (outs.length > 8 ? ' and ' + (outs.length - 8) + ' more' : '');
          const ways = outs.length + (partial ? '+' : '') + (outs.length === 1 && !partial ? ' way out' : ' ways out');
          let text;
          if (left <= 0) text = 'It is check, but Black has ' + ways.replace(' ways out', ' legal replies').replace(' way out', ' legal reply') + ' (' + shown + '), so it is not checkmate.';
          else if (deep) text = 'It is check, but Black can escape (' + shown + '). Checkmate needs every escape covered.';
          else text = (inChk ? 'It is check, but it is not forced. ' : 'That is not forcing. ') + 'Black has ' + ways + ' (' + shown + '). None of them lead to mate in ' + X + '.';
          return { text, arrow: outs.slice(0, 12).map((o) => [o.r.from, o.r.to]) };
        }
      }
      if (left <= 0) return { text: inChk ? 'That is not checkmate.' : 'That is not even check, so it cannot be mate. Look for the mating move.', arrow: null };
      if (deep) return { text: 'Not the line. Look for a forcing check or capture first.', arrow: null };
      return { text: 'That does not force mate in ' + X + '.', arrow: null };
    }
    if (kind === 'check') return { text: 'That checks, but it is not a safe check. Find a check that nothing can take.', arrow: null };
    if (kind === 'sac') return { text: 'Not the sacrifice. Look for a move that gives up material to win more back (or to force mate).', arrow: null };
    return { text: 'That is not the strongest move. Look at checks, captures and threats first.', arrow: null };
  }
  function badMove(m, kind, left) { const r = refute(m, kind, left); wrong(r.text, r.arrow, m); }

  /** Keep the bad move on the board with the reason; Undo or Retry gets you out. */
  function wrong(text, arrow, mv) {
    stats.miss();
    state = 'wrong'; busy = false; sel = -1; targets = []; hints = [];
    bad = mv ? plain(mv) : null;
    showBubble(text, arrow);
    render();
    updateInfo();
    setStatus('Not quite. Press Undo to take the move back.', 'check');
  }
  function undoWrong() {
    g.unmakeMove();
    if (P.type === 'check') snaps.pop();      // commit() saved a snapshot before the bad move
    last = log.length ? [log[log.length - 1].f, log[log.length - 1].t] : null;
    state = 'play'; bad = null; sel = -1; targets = []; hints = [];
    clearBubble();
    render();
    updateInfo();
    setStatus(prompt(), 'dim');
  }

  function afterMate(m) {
    const remaining = P.n - userMoves;                  // moves White has left, counting the one just made
    if (PG.isMate(g)) { log.push(plain(m)); userMoves++; solve(); return; }
    if (remaining <= 1) { badMove(m, 'mate', 0); return; }
    // not mate yet: it has to leave Black no defence, i.e. checkmate is still forced within the moves left
    const wasTw = tw;
    let ok = treeWhite(m);
    if (!ok && userMoves === 0 && (P.sol || []).some((x) => x.f === m.from && x.t === m.to)) ok = true;
    if (!ok && remaining - 1 <= 3) ok = PG.forcedWithin(g, remaining - 1).ok;     // too deep for the quick solver beyond that
    if (!ok) { tw = wasTw; badMove(m, 'mate', remaining - 1); return; }
    log.push(plain(m));
    userMoves++;
    busy = true;
    const my = token;
    setStatus('Black replies…', 'dim');
    updateInfo();
    setTimeout(() => {
      if (my !== token) return;
      let r = null;
      if (trp) { const t = PG.toughest(trp); r = t && findMove(g, PG.dec(t[0])); }
      if (!r) r = PG.bestDefence(g, P.n - userMoves) || g.legalMoves()[0];
      treeBlack(r);
      g.makeMove(r);
      log.push(Object.assign(plain(r), { r: 1 }));
      last = [r.from, r.to];
      busy = false;
      render();
      slide(r.from, r.to);
      updateInfo();
      setStatus(prompt(), 'dim');
      save();
    }, 650);
  }

  function afterCheck(m) {
    // Winning check must put Black in check AND leave the checking piece safe
    if (g.inCheck(0x10)) {
      if (PG.isSafeCheck && PG.isSafeCheck(g, m.to)) {
        log.push(plain(m));
        userMoves++;
        solve();
        return;
      }
      // Unsafe check — Black can take the piece (move still on board until wrong() undoes it)
      badMove(m, 'check', 0);
      return;
    }
    log.push(plain(m));
    userMoves++;
    if (userMoves >= P.limit) {
      state = 'failed';
      render();
      updateInfo();
      setStatus(prompt(), 'check');
      save();
      return;
    }
    // Black replies (like mate-in-2)
    busy = true;
    const my = token;
    setStatus('Black replies…', 'dim');
    updateInfo();
    setTimeout(() => {
      if (my !== token) return;
      const replies = g.legalMoves();
      let r = null;
      if (replies.length) {
        const pref = (P.replies && P.replies[userMoves - 1]) || null;
        if (pref) r = replies.find((x) => x.from === pref.f && x.to === pref.t && (x.promo || 0) === (pref.p || 0)) || null;
        if (!r) r = replies[Math.floor(Math.random() * replies.length)];
        g.makeMove(r);
        log.push(Object.assign(plain(r), { r: 1 }));
        last = [r.from, r.to];
      }
      busy = false;
      render();
      if (r) slide(r.from, r.to);
      updateInfo();
      setStatus(prompt(), 'dim');
      save();
    }, 650);
  }

  function afterBest(m) {
    const ok = P.good.some((x) => x.f === m.from && x.t === m.to);
    if (ok) { log.push(plain(m)); userMoves++; solve(); }
    else badMove(m, P.type === 'sac' ? 'sac' : 'best', 0);
  }

  function solve() {
    state = 'solved';
    busy = false;
    render();
    updateInfo();
    clearSave();
    if (!revealed) {
      if (LP.rewards) { LP.rewards.event('puzzle', { diff: cfg.diff }); if (!missed) LP.rewards.event('cleanpuzzle'); }
      stats.win();
      const st = stats.get();
      if (!missed && st.streak >= 3 && LP.board) {
        const nm = LP.board.lastName();
        const res = LP.board.record({ cat: 'puzzle', key: 'puzzle:' + cfg.diff + ':' + cfg.type, group: DIFF[cfg.diff] + ' · ' + TITLE[cfg.type].replace(' puzzles', '').replace(' puzzles', ''), name: nm || 'Player', vs: TITLE[cfg.type], value: st.streak, unit: 'streak', low: false, unique: true });
        if (res.isBest) { if (!nm) LP.board.askName(res.entry, null, 'A new best streak! Choose the name for the leaderboard.'); else toast('New best streak: ' + st.streak); }
      }
    }
    updateInfo();
    let msg;
    if (P.type === 'best' || P.type === 'sac') msg = 'Correct! ' + P.san + '. ' + P.explain;
    else if (P.type === 'mate') msg = 'Checkmate! Mate in ' + P.n + ' solved. The explanation is above.';
    else msg = 'Check! Solved in ' + userMoves + (userMoves === 1 ? ' move.' : ' moves.');
    setStatus(msg, 'good');
    showWhy();
  }

  /* ----------------------------------------------------------------- buttons */
  function hint() {
    if (busy || state === 'solved' || state === 'gen' || !P) return;
    stats.miss();
    let from = -1;
    if (P.type === 'best' || P.type === 'sac') from = P.good[0].f;
    else if (P.type === 'mate') {
      if (tw) from = PG.dec(tw[0]).f;
      else if (userMoves >= 1) { const mv = P.n - userMoves <= 3 ? PG.findMateMove(g, P.n - userMoves) : null; if (mv) from = mv.from; else { toast('That line is off the prepared solution. Try Retry.'); return; } }
      else from = P.sol[0].f;
    } else {
      const path = PG.checkPath(g.board, Math.max(1, movesLeft()));
      if (path) from = path[0].f;
      else { toast('No way to check from here. Try Undo.'); return; }
    }
    if (from < 0) return;
    sel = -1; targets = []; hints = [from];
    render();
    setStatus('Hint: move the highlighted piece', 'dim');
  }

  function solution() {
    if (busy || state === 'gen' || !P) return;
    stats.miss();
    load(P);                      // back to the start
    revealed = true;
    busy = true;
    state = 'play';
    updateInfo();
    setStatus('Playing solution…', 'dim');

    const steps = [];             // sequence of plain moves (White and Black) to animate
    if (P.type === 'best' || P.type === 'sac') {
      steps.push(P.good[0]);
    } else if (P.type === 'mate') {
      if (tw) { for (let k = 0; k < P.n; k++) { steps.push({ _twm: true }); if (k < P.n - 1) steps.push({ _tbr: true }); } }
      else {
        steps.push(P.sol[0]);
        // longer mates: show Black's stubbornest defence, then the next forcing move, and so on
        for (let k = 1; k < P.n; k++) { steps.push({ _defence: true }); steps.push({ _mate2: true }); }
      }
    } else if (P.type === 'check' && P.path) {
      P.path.forEach((wm, i) => {
        steps.push(wm);
        if (P.replies && P.replies[i]) steps.push(Object.assign({}, P.replies[i], { r: 1 }));
      });
    }

    const my = token;
    let i = 0, wm = 0;                        // wm: White moves played so far
    const playNext = () => {
      if (my !== token) return;
      if (i >= steps.length) {
        busy = false;
        state = 'solved';
        sel = -1; targets = []; hints = [];
        render();
        updateInfo();
        let msg = 'Solution played.';
        if (P.type === 'best' || P.type === 'sac') msg = (P.type === 'sac' ? 'Sacrifice' : 'Best move') + ': ' + P.san + '. ' + P.explain;
        else if (P.type === 'mate') msg = P.n === 1 ? 'Checkmate solution. The explanation is above.' : 'Forced mate in ' + P.n + ' (one way of defending shown). The explanation is above.';
        else msg = 'Safe check solution.';
        setStatus(msg, 'good');
        showWhy();
        return;
      }
      const step = steps[i++];
      // proof-tree playback: White's tree move, then Black's toughest reply
      if (step._twm || step._tbr) {
        let m = null;
        if (step._twm && tw) { m = findMove(g, PG.dec(tw[0])); if (m) { treeWhite(m); wm++; } }
        else if (step._tbr && trp) { const t = PG.toughest(trp); m = t && findMove(g, PG.dec(t[0])); if (m) treeBlack(m); }
        if (m) {
          g.makeMove(m);
          log.push(step._tbr ? Object.assign(plain(m), { r: 1 }) : plain(m));
          last = [m.from, m.to];
          render();
          slide(m.from, m.to);
        }
        setTimeout(playNext, 700);
        return;
      }
      // Dynamic mate-in-2 continuation
      if (step._defence) {
        const r = PG.bestDefence(g, P.n - wm);
        if (r) {
          g.makeMove(r);
          log.push(Object.assign(plain(r), { r: 1 }));
          last = [r.from, r.to];
          render();
          slide(r.from, r.to);
        }
        setTimeout(playNext, 700);
        return;
      }
      if (step._mate2) {
        const m = PG.findMateMove(g, P.n - wm);
        if (m) {
          wm++;
          g.makeMove(m);
          log.push(plain(m));
          last = [m.from, m.to];
          render();
          slide(m.from, m.to);
        }
        setTimeout(playNext, 700);
        return;
      }
      const m = findMove(g, step);
      if (!m) { setTimeout(playNext, 200); return; }
      if (!step.r) wm++;
      g.makeMove(m);
      log.push(step.r ? Object.assign({}, step) : plain(m));
      last = [m.from, m.to];
      if (!step.r) userMoves++;
      render();
      slide(m.from, m.to);
      setTimeout(playNext, 700);
    };
    setTimeout(playNext, 450);
  }

  function undo() {
    if (state === 'wrong') { undoWrong(); return; }
    if (busy || !snaps.length || P.type !== 'check' || state === 'solved') return;
    // Restore board from snapshot (before White's last move); drop White move and any Black reply from the log
    g.board.set(snaps.pop());
    g.turn = 8; g.ep = -1; g.castling = 0; g.history = [];
    while (log.length && log[log.length - 1].r) log.pop();
    if (log.length) log.pop();
    userMoves = snaps.length;
    state = 'play'; sel = -1; targets = []; hints = [];
    last = log.length ? [log[log.length - 1].f, log[log.length - 1].t] : null;
    render();
    updateInfo();
    setStatus(prompt(), 'dim');
    save();
  }

  /* ------------------------------------------------------------------ analysis */
  /** Rebuild the board at move i of the analysis line (it is the whole timeline: moving back and playing a new move cuts the old future). */
  function anRebuild(i) {
    g = PG.fromPos(P.pos);
    an.sans = [];
    let k = 0;
    for (; k < i && k < an.line.length; k++) {
      const e = an.line[k], col = g.board[e.f] & 24;
      if (col !== g.turn) { g.turn = col; g.ep = -1; }
      const m = findMove(g, e);
      if (!m) break;
      an.sans.push(PG.sanOf(g, m));
      g.makeMove(m);
    }
    if (k < i && k < an.line.length) an.line.length = k;     // a saved move that cannot be played is dropped
    an.idx = k;
    last = k ? [an.line[k - 1].f, an.line[k - 1].t] : null;
  }
  function anGo(i, slideMove) {
    anRebuild(i);
    sel = -1; targets = [];
    render();
    if (slideMove) slide(slideMove.from, slideMove.to);
    updateInfo();
    let msg = prompt();
    if (!g.hasLegalMove()) msg = g.inCheck(g.turn) ? 'Checkmate. ' + (g.turn === 8 ? 'Black' : 'White') + ' wins this line.' : 'Stalemate: a draw.';
    else if (g.inCheck(g.turn)) msg = (g.turn === 8 ? 'White' : 'Black') + ' is in check.';
    setStatus(msg, 'dim');
  }
  function anMove(m) {
    const e = plain(m), cur = an.line[an.idx];
    if (cur && cur.f === e.f && cur.t === e.t && (cur.p || 0) === e.p) an.idx++;       // same as the saved next move: keep the rest
    else { an.line.length = an.idx; an.line.push(e); an.idx++; }                      // a new idea: the old future is dropped
    anGo(an.idx, m);
  }
  function enterAnalysis() {
    if (!P || !(state === 'solved' || state === 'failed' || state === 'wrong')) return;
    const line = log.map((e) => ({ f: e.f, t: e.t, p: e.p || 0 }));
    if (state === 'wrong' && bad) line.push(bad);
    token++;
    an = { line, sans: [], idx: line.length, why: state === 'solved' };
    state = 'analysis'; busy = false; bad = null; hints = [];
    clearBubble();
    showWhy();
    anGo(line.length);
  }
  function exitAnalysis() {
    if (state !== 'analysis' || !P) return;
    load(P);                 // back to the original starting position, ready to try again
  }
  function anStep(d) {
    if (state !== 'analysis' || !an) return;
    const i = an.idx + d;
    if (i < 0 || i > an.line.length) return;
    if (d > 0) { const e = an.line[an.idx]; anGo(i, e ? { from: e.f, to: e.t } : null); } else anGo(i);
  }

  /* ------------------------------------------------------------------- setup */
  const KINDS = [
    { id: 'mate', icon: 3, name: 'Checkmate', sub: 'Pick the difficulty, then mate in 1 to 8.' },
    { id: 'check', icon: 5, name: 'Check', sub: 'Safe check — Black replies each turn.' },
    { id: 'best', icon: 4, name: 'Best move', sub: 'Find the strongest move.' },
    { id: 'sac', icon: 2, name: 'Sacrifice', sub: 'Give material to win more, or to force mate.' },
  ];
  const LEVELS = [
    { id: 'easy', name: 'Easy', sub: 'Clear and straightforward.', n: 1 },
    { id: 'normal', name: 'Normal', sub: 'A little more to think about.', n: 2 },
    { id: 'hard', name: 'Hard', sub: 'Tricky and well defended.', n: 3 },
    { id: 'insane', name: 'Insane', sub: 'Crowded boards and deep forced mates.', n: 4 },
  ];
  // Checkmate only: how many moves to mate you can pick for each level
  const MATEIN = { easy: [1, 2], normal: [1, 2, 3], hard: [2, 3, 4, 5], insane: [2, 3, 4, 5, 6, 7, 8] };
  // what each level means for each kind of puzzle (shown in the level picker)
  const SUBS = {
    mate: { easy: 'Few pieces, so it is easy to see. Mate in 1 or 2.', normal: 'A fuller board. Mate in 1, 2 or 3.', hard: 'Busy board with forcing moves. Mate in 2 to 5.', insane: 'Crowded board, sacrifices and discovered checks. Mate in 2 to 8.' },
    check: { easy: 'A safe check, a couple of moves at most.', normal: 'More pieces defending, up to 3 moves.', hard: 'A crowded board: the safe check takes 3 moves.' },
    best: { easy: 'Win something clear.', normal: 'The best move is not the obvious capture.', hard: 'A deep tactic that a short look misses.' },
    sac: { easy: 'A simple sacrifice that wins quickly.', normal: 'A sacrifice that leads to mate or a bigger win.', hard: 'A big sacrifice and a deep combination.' },
  };
  const meter = (n) => `<span class="pz-lv lv${n}" aria-hidden="true"><i class="${n >= 1 ? 'on' : ''}"></i><i class="${n >= 2 ? 'on' : ''}"></i><i class="${n >= 3 ? 'on' : ''}"></i></span>`;

  function askMateIn(diff) {
    const list = MATEIN[diff];
    LP.openSheet(`<h2>Checkmate · ${DIFF[diff]}<span class="sub">Mate in how many moves?</span></h2>
      <div class="pz-ns">
        ${list.map((n) => `<button class="btn big pz-n" data-n="${n}"><b>${n}</b><span>${n === 1 ? 'move' : 'moves'}</span></button>`).join('')}
        <button class="btn big pz-n" data-n="0"><b>?</b><span>Any</span></button>
      </div>
      <div class="row"><button class="btn" id="pz-nback">Back</button><button class="btn" id="pz-nx">Cancel</button></div>`, true);
    document.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => { cfg = { type: 'mate', diff, n: +b.dataset.n }; LP.session.fresh(); LP.closeSheet(); newPuzzle(); }; });
    $('#pz-nback').onclick = () => askDiff('mate');
    $('#pz-nx').onclick = LP.closeSheet;
  }

  function askDiff(type) {
    const kind = KINDS.find((k) => k.id === type);
    LP.openSheet(`<h2>${esc(kind.name)}<span class="sub">How hard should it be?</span></h2>
      <div class="pz-options">
        ${LEVELS.filter((l) => l.id !== 'insane' || type === 'mate').map((l) => `<button class="pz-opt" data-d="${l.id}">${meter(l.n)}<span class="pz-text"><span class="pz-name">${l.name}</span><span class="pz-sub">${(SUBS[type] && SUBS[type][l.id]) || l.sub}</span></span></button>`).join('')}
      </div>
      <div class="row"><button class="btn" id="pz-dback">Back</button><button class="btn" id="pz-dx">Cancel</button></div>`, true);
    document.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { if (type === 'mate') { askMateIn(b.dataset.d); return; } cfg = { type, diff: b.dataset.d }; LP.session.fresh(); LP.closeSheet(); newPuzzle(); }; });
    $('#pz-dback').onclick = startPuzzles;
    $('#pz-dx').onclick = LP.closeSheet;
  }

  function startPuzzles() {
    LP.openSheet(`<h2>Puzzles<span class="sub">Choose a challenge.</span></h2>
      <div class="pz-options">
        ${KINDS.map((k) => `<button class="pz-opt" data-k="${k.id}"><span class="pz-ic"><i class="ic-sp" style="--i:${k.icon}"></i></span><span class="pz-text"><span class="pz-name">${k.name}</span><span class="pz-sub">${k.sub}</span></span></button>`).join('')}
      </div>
      <button class="btn wide" id="pz-fv">★ Favourites (${favs.all().length})</button>
      <button class="btn wide" id="pz-x">Cancel</button>`, true);
    $('#pz-fv').onclick = favSheet;
    document.querySelectorAll('[data-k]').forEach((b) => {
      b.onclick = () => askDiff(b.dataset.k);
    });
    $('#pz-x').onclick = LP.closeSheet;
  }

  function leave() {
    token++;
    save();
    LP.closeSheet();
    LP.renderSavedList();
    LP.showPage('menu');
  }

  $('#pz-board').addEventListener('click', (e) => { const el = e.target.closest('.square'); if (el) onSquare(+el.dataset.sq); });
  $('#pz-back').addEventListener('click', leave);
  $('#pz-hint').addEventListener('click', hint);
  $('#pz-answer').addEventListener('click', solution);
  $('#pz-undo').addEventListener('click', undo);
  $('#pz-fundo').addEventListener('click', undo);
  $('#pz-fretry').addEventListener('click', () => { if (P) load(P); });
  $('#pz-analysis').addEventListener('click', enterAnalysis);
  $('#pz-exit').addEventListener('click', exitAnalysis);
  $('#pz-nb').addEventListener('click', () => anStep(-1));
  $('#pz-nf').addEventListener('click', () => anStep(1));
  document.addEventListener('keydown', (e) => {
    if (state !== 'analysis' || !$('#puzzle').classList.contains('active') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('#sheet-bg').classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); anStep(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); anStep(1); }
  });
  $('#pz-retry').addEventListener('click', () => { if (P) load(P); });
  $('#pz-next').addEventListener('click', () => {
    if (state === 'play' && log.length && !revealed) {
      LP.openSheet('<h2>Skip this puzzle?</h2><div class="row"><button class="btn" id="c-no">Cancel</button><button class="btn primary" id="c-yes">New puzzle</button></div>');
      $('#c-no').onclick = LP.closeSheet;
      $('#c-yes').onclick = () => { LP.closeSheet(); newPuzzle(); };
    } else newPuzzle();
  });
  document.querySelector('.mode[data-mode="puzzle"]').addEventListener('click', () => LP.saves.guard(startPuzzles));
  $('#pz-fav').addEventListener('click', () => {
    if (!P) return;
    const ok = favs.toggle(P, cfg);
    syncFav();
    toast(favs.has(P) ? 'Added to favourites' : ok ? 'Removed from favourites' : 'Could not save on this device');
  });

  window.Puzzle = {
    resume(d) {
      LP.session.use(d.id);
      cfg = d.cfg;
      missed = false;
      LP.closeSheet();
      LP.showPage('puzzle');
      load(d.P, d.log);
    },
    peek() { return { P, state, userMoves }; },
    dragHooks: { tap: (s) => onSquare(s), selected: () => sel, can: (s) => !busy && !!g && !!g.board[s] && (state === 'play' ? (g.board[s] & 24) === 8 : state === 'analysis' && (g.board[s] & 24) === g.turn) },
    describe(d) { return TITLE[d.cfg.type] + ' · ' + DIFF[d.cfg.diff] + (d.P && d.P.type === 'mate' ? ' · Mate in ' + d.P.n : ''); },
  };
  LP.renderSavedList();   // the menu's Continue button needs Rush and Puzzle to exist
})();
