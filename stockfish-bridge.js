/**
 * Stockfish in the browser (a Web Worker). Needs stockfish.js + stockfish.wasm in the same folder as this file
 * (the "lite single-threaded" build from the npm package "stockfish"; see the README).
 * If the files are missing or the page is opened straight from a folder, available() stays false and the game falls back to its own engine.
 *
 *   LP.Stockfish.load()                         -> Promise<boolean>   starts the engine (once)
 *   LP.Stockfish.analyse(fen, { movetime, depth, multipv }) -> Promise<{ best, depth, lines } | null>
 *        lines[k] = { move: 'e2e4', pv: ['e2e4', ...], score }   score = centipawns for the side to move (mate = +-(100000 - plies))
 *   LP.Stockfish.pickMove(game, ms)             -> Promise<legal move object | null>
 */
(() => {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const WORKER_URL = 'stockfish.js';
  const MATE = 100000;
  let w = null, state = 'idle', loading = null, cur = null, chain = Promise.resolve();

  const toScore = (cp, mate) => (mate != null ? (mate > 0 ? MATE - (2 * mate - 1) : -(MATE - 2 * -mate)) : cp);

  function fail(why) {
    state = 'failed';
    try { console.warn('Stockfish stopped:', why || 'unknown'); } catch (x) { /* ignore */ }
    if (w) { try { w.terminate(); } catch (x) { /* gone */ } }
    w = null;
    if (cur) { const c = cur; cur = null; c.res(null); }
  }

  function onLine(line) {
    line = String(line);
    if (cur && line.indexOf('info ') === 0 && line.indexOf(' pv ') > 0 && line.indexOf('score') > 0) {
      const t = line.split(/\s+/), at = (k) => t.indexOf(k);
      const k = at('multipv') > 0 ? +t[at('multipv') + 1] : 1;
      const si = at('score');
      const kind = t[si + 1], val = +t[si + 2];
      if (t[si + 3] === 'lowerbound' || t[si + 3] === 'upperbound') return;
      const pv = t.slice(at('pv') + 1);
      cur.lines[k - 1] = { move: pv[0], pv, score: toScore(kind === 'cp' ? val : 0, kind === 'mate' ? val : null), depth: +t[at('depth') + 1] || 0 };
    } else if (cur && line.indexOf('bestmove') === 0) {
      const c = cur; cur = null;
      const best = line.split(/\s+/)[1];
      const lines = c.lines.filter(Boolean);
      c.res(best && best !== '(none)' ? { best, depth: lines[0] ? lines[0].depth : 0, lines } : null);
    }
  }

  function load() {
    if (loading) return loading;
    loading = new Promise((resolve) => {
      if (typeof Worker === 'undefined' || location.protocol === 'file:') { state = 'failed'; resolve(false); return; }
      state = 'loading';
      let step = 0;
      const timer = setTimeout(() => { if (state === 'loading') { fail('load timeout'); resolve(false); } }, 15000);
      try {
        w = new Worker(WORKER_URL);
        w.onerror = (ev) => { clearTimeout(timer); if (state === 'loading') resolve(false); fail('worker error ' + (ev && ev.message)); };
        w.onmessage = (ev) => {
          const line = String(ev.data);
          if (state === 'loading') {
            if (step === 0 && line.indexOf('uciok') >= 0) { step = 1; w.postMessage('setoption name Hash value 32'); w.postMessage('isready'); }
            else if (step === 1 && line.indexOf('readyok') >= 0) { step = 2; state = 'ready'; clearTimeout(timer); resolve(true); }
          } else onLine(line);
        };
        w.postMessage('uci');
      } catch (x) { clearTimeout(timer); fail('start ' + x); resolve(false); }
    });
    return loading;
  }

  /** One search at a time; extra calls wait their turn. Resolves null if the engine is not there or too slow. */
  function analyse(fen, o) {
    o = o || {};
    const job = () => load().then((ok) => {
      if (!ok || state !== 'ready') return null;
      return new Promise((res) => {
        const ms = o.movetime || 1000;
        let guard = 0;
        const c = { lines: [], res: (v) => { clearTimeout(guard); res(v); } };
        cur = c;
        guard = setTimeout(() => { if (cur === c) { w.postMessage('stop'); setTimeout(() => { if (cur === c) fail('search did not stop'); }, 2500); } }, ms + 4000);
        w.postMessage('setoption name MultiPV value ' + (o.multipv || 1));
        w.postMessage('position fen ' + fen);
        w.postMessage(o.depth ? 'go depth ' + o.depth : 'go movetime ' + ms);
      });
    });
    const p = chain.then(job, job);
    chain = p.then(() => 0, () => 0);
    return p;
  }

  function stop() { if (w && cur) w.postMessage('stop'); }
  function newGame() { if (w && state === 'ready' && !cur) { w.postMessage('ucinewgame'); w.postMessage('isready'); } }

  /** A uci move ("e2e4", "e7e8q") as one of the legal moves of game g. */
  function legalOf(g, uci) {
    if (!uci || uci.length < 4) return null;
    const sq = (s) => (s.charCodeAt(0) - 97) + 16 * (+s[1] - 1);
    const from = sq(uci.slice(0, 2)), to = sq(uci.slice(2, 4));
    const pr = { q: 5, r: 4, b: 3, n: 2 }[uci[4]] || 0;
    return g.legalMoves().find((m) => m.from === from && m.to === to && (m.promo || 0) === pr) || null;
  }
  const alg = (s) => String.fromCharCode(97 + (s & 15)) + ((s >> 4) + 1);

  function pickMove(g, ms) {
    return analyse(g.toFen(), { movetime: Math.max(30, ms || 1000) }).then((r) => (r ? legalOf(g, r.best) : null));
  }

  LP.Stockfish = { load, analyse, pickMove, stop, newGame, legalOf, alg, available: () => state === 'ready', failed: () => state === 'failed', MATE };
})();
