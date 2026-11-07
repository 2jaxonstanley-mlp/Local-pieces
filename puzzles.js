/**
 * Puzzle screen: Checkmate (pick the difficulty, then how many moves to mate, 1 to 8), Check (safe check within N moves; Black replies),
 * Best move and Sacrifice (Easy / Normal / Hard each). The positions come from puzzlegen.js. Progress is saved so the menu can offer "Continue playing".
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
  let state = 'idle';      // gen | play | failed | solved
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
    const chk = g.inCheck(0x10) && state !== 'gen' ? g.kingSquare(0x10) : -1;
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
    $('#pz-goal').textContent = state === 'gen' ? 'Setting up the board…' : goal;
    const s = stats.get();
    $('#pz-diff').textContent = DIFF[cfg.diff];
    $('#pz-streak').textContent = s.streak;
    $('.pz-bolt').classList.toggle('on', s.streak > 0);
    $('#pz-count').innerHTML = 'Solved ' + s.solved + ' <i>·</i> Missed ' + s.missed + ' <i>·</i> Best ' + s.best;
    $('#pz-kind').textContent = TITLE[cfg.type];
    $('#pz-turn').classList.toggle('solved', state === 'solved');
    $('#pz-turn-t').textContent = state === 'solved' ? (missed || revealed ? 'Puzzle over' : 'Puzzle solved') : 'White to Move';
    const chk = cfg.type === 'check';
    $('#pz-undo').classList.toggle('hidden', !chk);
    $('#pz-undo').disabled = !snaps.length || busy || state === 'solved';
    $('#pz-hint').disabled = busy || state === 'solved' || state === 'gen';
    $('#pz-retry').disabled = state === 'gen';
    $('#pz-answer').disabled = busy || state === 'gen';
    $('#pz-next').classList.toggle('glow', state === 'solved');
  }

  function prompt() {
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
  /** Plain-English reasons for the solution, built from the position and the solution line. */
  function explainText(p) {
    try {
      const g0 = PG.fromPos(p.pos);
      const mv = (e) => findMove(g0, e);
      if (p.type === 'best' || p.type === 'sac') {
        const m = mv(p.good[0]);
        const pc = NAMES[g0.board[m.from] & 7] || 'piece', cap = g0.board[m.to] ? NAMES[g0.board[m.to] & 7] : '';
        const chk = /[+#]$/.test(p.san);
        let t = (cap ? 'The ' + pc + ' takes the ' + cap + ' on ' + sqName(m.to) : 'The ' + pc + ' moves to ' + sqName(m.to)) + (chk ? ' with check' : '') + '. ';
        t += p.explain + ' ';
        if (p.type === 'sac') t += 'It gives up about ' + (p.loss != null ? Math.round(p.loss) : 'some') + ' point(s) at first, so a quick glance at safe moves can mislead you. Always check forcing moves: checks, captures and threats.';
        else t += 'Habit to build: look at every check, capture and threat for both sides, and ask what each one achieves.';
        return { title: 'Best move: ' + p.san, text: t };
      }
      if (p.type === 'mate' && PG.treeOf(p)) {
        const line = [];
        let nd = PG.treeOf(p);
        for (;;) {
          const d = PG.dec(nd[0]), m = findMove(g0, d);
          if (!m) break;
          line.push(PG.sanOf(g0, m)); g0.makeMove(m);
          if (nd.length === 1) break;
          const r = PG.toughest(nd[1]), rd = PG.dec(r[0]), rm = findMove(g0, rd);
          if (!rm) break;
          line.push(PG.sanOf(g0, rm)); g0.makeMove(rm);
          nd = r[1];
        }
        const tg = p.tags || [];
        const idea = tg.includes('disc') ? ' The key idea is a discovered check: one piece steps aside and another gives check.' : tg.includes('sac') ? ' The key idea is a sacrifice that drags the defenders away.' : tg.includes('forced') ? ' The key idea is a check that leaves Black one or two legal replies, so the rest is forced.' : tg.includes('cap') ? ' It starts by taking material with tempo.' : '';
        const t = p.n === 1
          ? line[0] + ' gives check and Black has no answer: the king has no safe square, and the checking piece cannot be captured or blocked.'
          : 'Play ' + line[0] + '. Black\'s toughest defence is ' + (line[1] || 'shown') + ', and the mate follows by force. Full line: ' + line.join(' ') + '.' + idea;
        return { title: 'Mate in ' + p.n, text: t };
      }
      if (p.type === 'mate') {
        const line = [];
        const m1 = mv(p.sol[0]);
        line.push(PG.sanOf(g0, m1));
        let wm = 1;
        g0.makeMove(m1);
        for (let k = 1; k < p.n; k++) {
          const r = PG.bestDefence(g0, p.n - wm);
          if (r) { line.push(PG.sanOf(g0, r)); g0.makeMove(r); }
          const m = PG.findMateMove(g0, p.n - wm);
          if (!m) break;
          line.push(PG.sanOf(g0, m)); wm++; g0.makeMove(m);
        }
        const t = p.n === 1
          ? line[0] + ' gives check and Black has no answer: the king has no safe square, and the checking piece cannot be captured or blocked.'
          : 'Play ' + line[0] + '. Every reply leaves Black with only losing choices (the toughest defence is ' + (line[1] || 'shown') + '), and then ' + (line[line.length - 1]) + ' finishes it. Full line: ' + line.join(' ') + '.';
        return { title: 'Mate in ' + p.n, text: t + (p.n > 1 ? ' Tip: forcing checks that take away the king\'s squares come first.' : ' Tip: count the king\'s escape squares, then look for the check that covers them all.') };
      }
      const sans = PG.sanPath(p.pos, p.path);
      return { title: 'Safe check in ' + p.path.length, text: 'One way: ' + sans.join(', then ') + '. A check is safe when Black cannot simply capture the piece that gives it. Count which of Black\'s pieces attack the square first.' };
    } catch (e) { return { title: 'Solution', text: p.explain || 'Look for forcing moves first: checks, captures and threats.' }; }
  }
  function showWhy() {
    const box = $('#pz-why');
    if (!box) return;
    if (!P || state !== 'solved') { box.classList.add('hidden'); return; }
    const x = explainText(P);
    box.innerHTML = '<b>' + esc(x.title) + '</b>' + esc(x.text);
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
      c.querySelector('.pf-why').onclick = () => { const x = explainText(f.P); LP.openSheet('<h2>' + esc(x.title) + '</h2><p class="note" style="font-size:1rem">' + esc(x.text) + '</p><button class="btn wide" id="pw-b">Back</button>', true); $('#pw-b').onclick = favSheet; };
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
    state = 'play'; busy = false; revealed = false;
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
    state = 'gen'; busy = true;
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
    if (busy || state !== 'play' || !g) return;
    const p = g.board[s];
    const own = p && (p & 24) === 8;
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
      b.onclick = () => { LP.closeSheet(); const m = ms.find((x) => x.promo === +b.dataset.pr); if (m && state === 'play' && !busy) commit(m); };
    });
  }

  function commit(m) {
    sel = -1; targets = []; hints = [];
    if (P.type === 'check') snaps.push(g.board.slice());
    g.makeMove(m);
    last = [m.from, m.to];
    render();
    slide(m.from, m.to);
    if (P.type === 'mate') afterMate(m);
    else if (P.type === 'check') afterCheck(m);
    else afterBest(m);
  }

  /** Take back the move that was just made (not part of the solution) after a short pause. */
  function wrong(msg) {
    stats.miss();
    busy = true;
    const my = token;
    setStatus(msg, 'check');
    updateInfo();
    setTimeout(() => {
      if (my !== token) return;
      g.unmakeMove();
      last = log.length ? [log[log.length - 1].f, log[log.length - 1].t] : null;
      busy = false;
      render();
      updateInfo();
      setStatus(prompt(), 'dim');
    }, 950);
  }

  function afterMate(m) {
    const remaining = P.n - userMoves;                  // moves White has left, counting the one just made
    if (PG.isMate(g)) { log.push(plain(m)); userMoves++; solve(); return; }
    if (remaining <= 1) { wrong(P.n === 1 ? 'That is not checkmate' : 'That is not checkmate. Look for the mating move'); return; }
    // not mate yet: it has to leave Black no defence, i.e. checkmate is still forced within the moves left
    const wasTw = tw;
    let ok = treeWhite(m);
    if (!ok && userMoves === 0 && (P.sol || []).some((x) => x.f === m.from && x.t === m.to)) ok = true;
    if (!ok && remaining - 1 <= 3) ok = PG.forcedWithin(g, remaining - 1).ok;     // too deep for the quick solver beyond that
    if (!ok) { tw = wasTw; wrong(PG.treeOf(P) && remaining - 1 > 3 ? 'Not the line. Look for a forcing check or capture' : 'That does not force checkmate in time'); return; }
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
      wrong('That checks, but your piece can be taken. Find a safe check.');
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
    else wrong(P.type === 'sac' ? 'Not the sacrifice. Look for a move that gives material to gain more.' : 'Not the best move. Try again');
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
    else if (P.type === 'mate') msg = 'Checkmate! Puzzle solved.';
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
        else if (P.type === 'mate') msg = P.n === 1 ? 'Checkmate solution.' : 'Forced mate in ' + P.n + ' (one way of defending shown).';
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
    dragHooks: { tap: (s) => onSquare(s), selected: () => sel, can: (s) => !busy && state === 'play' && !!g && !!g.board[s] && (g.board[s] & 24) === 8 },
    describe(d) { return TITLE[d.cfg.type] + ' · ' + DIFF[d.cfg.diff] + (d.P && d.P.type === 'mate' ? ' · Mate in ' + d.P.n : ''); },
  };
  LP.renderSavedList();   // the menu's Continue button needs Rush and Puzzle to exist
})();
