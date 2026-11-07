/**
 * Solo Chess - Perfect Run: 30 capture puzzles against the clock. Rules and puzzle maker live in solocore.js.
 * Best result is kept on this device: more puzzles solved always beats a faster time, and a faster time only counts on a tie.
 * 0 players: the computer plays the whole run itself (it looks for a winning line, then plays it capture by capture). Its best
 * result is kept separately as the Bot highscore, shown to the right of your own.
 */
(() => {
  'use strict';
  const LP = window.LP, C = window.SoloCore;
  const $ = (s) => document.querySelector(s);
  const ROUNDS = 30;
  const BEST_KEY = 'localPieces.soloBest';
  const BOT_KEY = 'localPieces.soloBotBest';
  const GLYPH = { 1: '♟︎', 2: '♞︎', 3: '♝︎', 4: '♜︎', 5: '♛︎', 6: '♚︎' };

  const boardEl = $('#so-board');
  let els = {};
  let puzzles = [];          // made ahead of time, in the background
  let making = 0;            // token so an old background job stops when a new one starts
  let run = null;            // { idx, results, t0, board, sel, targets, locked, last, timer, ended, ms }
  let sel = -1;

  /* ---------------------------------------------------------------- best score */
  const loadBest = () => { try { const b = JSON.parse(localStorage.getItem(BEST_KEY)); return b && typeof b.n === 'number' ? b : null; } catch (e) { return null; } };
  const saveBest = (b) => { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* ignore */ } };
  const loadBot = () => { try { const b = JSON.parse(localStorage.getItem(BOT_KEY)); return b && typeof b.n === 'number' ? b : null; } catch (e) { return null; } };
  const saveBot = (b) => { try { localStorage.setItem(BOT_KEY, JSON.stringify(b)); } catch (e) { /* ignore */ } };
  /** Higher score wins; an equal score needs a faster time. */
  const beats = (n, ms, best) => !best || n > best.n || (n === best.n && ms < best.ms);

  function clock(ms) {
    const t = Math.floor(ms / 100);
    const m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (t % 10);
  }
  const showScore = (n, ms) => n + ' / ' + clock(ms);

  /* ---------------------------------------------------------------- puzzles, made ahead */
  function prepare() {
    const tok = ++making;
    puzzles = [];
    const go = () => {
      if (tok !== making || puzzles.length >= ROUNDS) return;
      puzzles.push(C.puzzleFor(puzzles.length + 1, Math.random, 150));
      updateStart();
      setTimeout(go, 0);
    };
    setTimeout(go, 0);
  }
  function puzzleAt(i) {
    while (puzzles.length <= i) puzzles.push(C.puzzleFor(puzzles.length + 1, Math.random, 150));   // (not made yet: make it now)
    return puzzles[i];
  }
  function updateStart() {
    const b = $('#so-start'), z = $('#so-bot');
    if (!b || run) return;
    const ready = puzzles.length >= 3;
    b.disabled = !ready;
    b.textContent = ready ? 'Start run' : 'Getting puzzles ready…';
    if (z) { z.disabled = !ready; z.textContent = '0 players: watch the bot'; }
  }

  /* ---------------------------------------------------------------- board drawing */
  function buildBoard() {
    boardEl.innerHTML = '';
    els = {};
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const s = r * 8 + f;
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

  function render(popSq) {
    const b = run ? run.board : null;
    const targets = new Set(run && sel >= 0 ? run.targets : []);
    for (let s = 0; s < 64; s++) {
      const el = els[s], p = b ? b[s] : null;
      el.classList.toggle('selected', s === sel);
      el.classList.toggle('last', !!run && !!run.last && (run.last[0] === s || run.last[1] === s));
      el.classList.toggle('legal', targets.has(s));
      el.classList.toggle('capture', targets.has(s));
      let pe = el._piece;
      if (!p) {
        if (pe) { pe.remove(); el._piece = null; }
        if (el._pips) { el._pips.remove(); el._pips = null; }
        continue;
      }
      if (!pe) { pe = document.createElement('span'); el.appendChild(pe); el._piece = pe; }
      const txt = GLYPH[p.t];
      if (pe.textContent !== txt) pe.textContent = txt;
      pe.className = 'piece w' + (p.c >= C.MAX_CAPS ? ' spent' : '') + (popSq === s ? ' reveal' : '');
      let pips = el._pips;
      if (p.c > 0) {
        if (!pips) { pips = document.createElement('span'); pips.className = 'so-pips'; el.appendChild(pips); el._pips = pips; }
        const t = p.c >= C.MAX_CAPS ? '●●' : '●';
        if (pips.textContent !== t) pips.textContent = t;
      } else if (pips) { pips.remove(); el._pips = null; }
    }
  }

  /** The tick or cross in the bottom right corner of a piece. */
  function mark(s, ok) {
    const el = els[s];
    if (!el) return;
    const m = document.createElement('span');
    m.className = 'so-mark ' + (ok ? 'ok' : 'no');
    m.textContent = ok ? '✓' : '✕';
    el.appendChild(m);
  }
  function clearMarks() { boardEl.querySelectorAll('.so-mark').forEach((m) => m.remove()); }

  function buildGrid() {
    $('#so-grid').innerHTML = Array.from({ length: ROUNDS }, (_, i) => `<span class="so-cell" data-i="${i}"><i>${i + 1}</i><b></b></span>`).join('');
  }
  function paintGrid() {
    document.querySelectorAll('#so-grid .so-cell').forEach((c) => {
      const i = +c.dataset.i, r = run ? run.results[i] : undefined;
      c.className = 'so-cell' + (r === true ? ' ok' : r === false ? ' no' : '') + (run && !run.ended && i === run.idx ? ' cur' : '');
      c.querySelector('b').textContent = r === true ? '✓' : r === false ? '✕' : '';
    });
  }

  const say = (t) => { $('#so-status').textContent = t; };
  function paintTime() { if (run) $('#so-time').textContent = clock(run.ended ? run.ms : Date.now() - run.t0); }

  /* ---------------------------------------------------------------- the run */
  function loadRound() {
    const pz = puzzleAt(run.idx);
    run.board = C.toBoard(pz.pieces);
    run.last = null;
    run.targets = [];
    run.locked = false;
    sel = -1;
    clearMarks();
    render();
    paintGrid();
    $('#so-round').textContent = 'Puzzle ' + (run.idx + 1) + ' of ' + ROUNDS;
    say(C.count(run.board) + ' pieces. Capture until one is left.');
    if (run.bot) botPlay();
  }

  /* ---------------------------------------------------------------- 0 players: the bot plays the round */
  function botPlay() {
    const tok = run.tok;
    const alive = () => !!run && run.tok === tok && !run.ended && !run.locked;
    say('The bot is thinking…');
    setTimeout(() => {
      if (!alive()) return;
      let line = null;
      try { line = C.solution(run.board, 150000); } catch (e) { line = null; }   // a winning line, if it can find one
      let i = 0;
      const step = () => {
        if (!alive()) return;
        let m = line && line[i++];
        if (!m) {                                    // no line found (or it ran out): take any capture, like someone who cannot see the answer
          const all = C.captures(run.board);
          if (!all.length) return;
          m = all[Math.floor(Math.random() * all.length)];
        }
        sel = m.from; run.targets = capturesFrom(m.from);
        render();
        setTimeout(() => {
          if (!alive()) return;
          capture(m.from, m.to);
          setTimeout(step, 170);
        }, 170);
      };
      say(C.count(run.board) + ' pieces. The bot is playing.');
      step();
    }, 250);
  }

  let botTok = 0;
  function start(bot) {
    if (puzzles.length < 3) return;
    $('#so-intro').classList.add('hidden');
    $('#so-run').classList.remove('hidden');
    run = { idx: 0, results: [], t0: Date.now(), board: null, targets: [], locked: false, last: null, timer: 0, ended: false, ms: 0, bot: bot === true, tok: ++botTok };
    $('#so-mode').textContent = run.bot ? '0 players' : '';
    buildGrid();
    loadRound();
    paintTime();
    run.timer = setInterval(paintTime, 100);
  }

  const capturesFrom = (s) => {
    const p = run.board[s];
    if (!p || p.c >= C.MAX_CAPS) return [];
    return C.reach(run.board, s, p.t).filter((to) => run.board[to].t !== C.K);
  };

  function onSquare(s) {
    if (!run || run.locked || run.ended || run.bot) return;
    if (sel >= 0 && run.targets.includes(s)) { capture(sel, s); return; }
    const p = run.board[s];
    if (p) {
      const t = capturesFrom(s);
      if (t.length) { sel = s; run.targets = t; render(); return; }
      if (p.c >= C.MAX_CAPS) say('That piece has already captured twice.');
      else if (p.t === C.K) say('The king can capture, but it can never be captured.');
      else say('That piece cannot capture anything right now.');
    }
    sel = -1; run.targets = [];
    render();
  }
  boardEl.addEventListener('click', (e) => {
    const q = e.target.closest ? e.target.closest('.square') : null;
    if (q) onSquare(+q.dataset.sq);
  });
  if (LP.drag && LP.drag.attach) {
    LP.drag.attach(boardEl, {
      tap: onSquare,
      selected: () => sel,
      can: (s) => !!run && !run.bot && !run.locked && !run.ended && capturesFrom(s).length > 0,
    });
  }

  function capture(from, to) {
    C.apply(run.board, { from, to });
    run.last = [from, to];
    sel = -1; run.targets = [];
    render(to);
    const left = C.count(run.board);
    if (left === 1) { finishRound(true, to); return; }
    if (!C.captures(run.board).length) { finishRound(false, to); return; }
    say(left + ' pieces left.');
  }

  function finishRound(ok, sq) {
    run.locked = true;
    run.results[run.idx] = ok;
    mark(sq, ok);
    paintGrid();
    say(ok ? 'Solved' : 'Stuck with ' + C.count(run.board) + ' pieces left');
    const last = run.idx === ROUNDS - 1;
    if (last) { run.ended = true; run.ms = Date.now() - run.t0; clearInterval(run.timer); paintTime(); }
    setTimeout(() => {
      if (!run) return;
      if (last) { results(); return; }
      run.idx++;
      loadRound();
    }, ok ? 750 : 1100);
  }

  function results() {
    const n = run.results.filter(Boolean).length, ms = run.ms, bot = run.bot;
    const prev = bot ? loadBot() : loadBest();
    const fresh = beats(n, ms, prev);
    if (fresh) (bot ? saveBot : saveBest)({ n, ms, date: Date.now() });
    const who = bot ? 'Bot highscore' : 'Your best';
    const bestLine = fresh
      ? (prev ? 'The last ' + (bot ? 'bot highscore' : 'best') + ' was ' + showScore(prev.n, prev.ms) : bot ? 'First bot run on this device' : 'First run on this device')
      : who + ' is ' + showScore(prev.n, prev.ms);
    LP.openSheet(`<h2>${bot ? 'Bot run' : 'Perfect Run'}<span class="sub">${n === ROUNDS ? 'Every puzzle solved!' : 'Run complete'}</span></h2>
      <div class="so-final">${LP.esc(showScore(n, ms))}</div>
      <p class="so-finalsub">${n} of ${ROUNDS} puzzles solved in ${LP.esc(clock(ms))}</p>
      ${fresh ? '<p class="so-new">New ' + (bot ? 'bot highscore' : 'high score') + '!</p>' : ''}
      <p class="so-finalsub">${LP.esc(bestLine)}</p>
      <div class="stack"><button class="btn primary big" id="so-again">Play again</button><button class="btn big" id="so-menu">Menu</button></div>`);
    $('#so-again').onclick = () => { LP.closeSheet(); open(); };
    $('#so-menu').onclick = () => { LP.closeSheet(); leave(); };
  }

  /* ---------------------------------------------------------------- pages */
  function stop() {
    if (run) clearInterval(run.timer);
    run = null;
    sel = -1;
  }
  function leave() { stop(); making++; LP.showPage('menu'); }

  function open() {
    stop();
    if (!Object.keys(els).length) buildBoard();
    const best = loadBest(), bot = loadBot();
    $('#so-best').textContent = best ? 'Best: ' + showScore(best.n, best.ms) : 'No best score yet';
    $('#so-botbest').textContent = bot ? 'Bot highscore: ' + showScore(bot.n, bot.ms) : 'No bot highscore yet';
    $('#so-intro').classList.remove('hidden');
    $('#so-run').classList.add('hidden');
    LP.showPage('solo');
    prepare();
    updateStart();
  }

  $('#so-start').addEventListener('click', () => start(false));
  $('#so-bot').addEventListener('click', () => start(true));
  $('#so-back').addEventListener('click', () => {
    if (run && !run.ended) LP.confirmSheet(run.bot ? 'Stop the bot run? Its result will not be saved.' : 'Quit this run? Your progress will be lost.', 'Quit', leave);
    else leave();
  });
  document.querySelector('.mode[data-mode="solo"]').addEventListener('click', open);
  buildBoard();
  LP.solo = { open, best: loadBest, botBest: loadBot };
})();
