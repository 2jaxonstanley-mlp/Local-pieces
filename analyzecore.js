/**
 * The analysis engine behind Analyze (chess games). No DOM in here, so it runs inside a Web Worker (analyzeworker.js) and,
 * when workers are not available (a page opened straight from a folder), on the main thread.
 *
 * Two passes over the game, within a total time budget:
 *   1. every move to be reviewed gets a quick search (a few hundred milliseconds, depth up to 14);
 *   2. every move that the first pass rated as something important (inaccuracy, mistake, blunder, missed win, brilliant, great,
 *      interesting) or that came close, gets a much deeper search (up to depth 22, wider quiescence) that re-decides the rating,
 *      so a mistake is only called a mistake when a deep search agrees;
 *   3. for each real mistake the engine also plays out the refutation (what the opponent does next) and the line the best
 *      move leads to. Those lines are what the explanations in explain.js are written from.
 *
 * analyseGame(job, hooks) -> { [moveIndex]: { r, b, bs, ps, d, top, facts, bl, ref, ver } }
 *   job   = { mode, fen, secrets: { w, b }, moves: [{ from, to, promo, flags, q }], idxs: [moveIndex], budget: ms }
 *   hooks = { progress(percent, text), cancelled() }
 */
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const MR = root.MoveRating, AI = root.AIAnalyse;
  const MATE = 100000;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mvKey = (m) => ({ f: m.from, t: m.to, p: m.promo || 0, q: m.q || 0 });
  const same = (a, b) => a.from === b.from && a.to === b.to && (a.promo || 0) === (b.promo || 0) && (a.q || 0) === (b.q || 0);
  const wpLoss = (bs, ps) => Math.max(0, MR.wp(bs) - Math.min(MR.wp(ps), MR.wp(bs)));

  const TEACH = { inaccuracy: 1, mistake: 1, blunder: 1, missedwin: 1 };
  const VERIFY = { inaccuracy: 1, mistake: 1, blunder: 1, missedwin: 1, brilliant: 1, great: 1, interesting: 1 };

  function startPosition(job) {
    const g = new Chess();
    g.mode = job.mode; g.reset();
    if (job.fen) g.loadFen(job.fen);
    g.secretQueen = { [WHITE]: job.secrets.w, [BLACK]: job.secrets.b };
    return g;
  }

  /** Engine moves played out from position g0 (before `first`; null = start with the engine's own choice). Returns [[f, t, promo, q], ...]. */
  function playOut(g0, first, plies, ms, depth) {
    const c = MR.clone(g0);
    const out = [];
    let mv = first;
    for (let k = 0; k < plies; k++) {
      if (!mv) {
        let A = null;
        try { A = AI.run(MR.clone(c), null, ms, depth, 5); } catch (e) { A = null; }
        if (!A || !A.top.length) break;
        mv = A.top[0].move;
      }
      const lm = c.legalMoves().find((x) => same(x, mv));
      if (!lm) break;
      out.push([lm.from, lm.to, lm.promo || 0, lm.q || 0]);
      c.makeMove(lm);
      mv = null;
      if (!c.hasLegalMove()) break;
    }
    return out;
  }

  const slim = (r) => ({
    r: r.rating ? r.rating.id : null,
    b: r.best ? mvKey(r.best) : null,
    bs: Math.round(r.bestScore || 0), ps: Math.round(r.playedScore || 0), d: r.depth || 0,
    top: (r.top || []).map((t) => [mvKey(t.move), Math.round(t.score)]),
    facts: r.facts ? { before: Math.round(r.facts.before || 0), afterQs: Math.round(r.facts.afterQs || 0), captured: !!r.facts.captured } : null,
  });

  async function analyseGame(job, hooks) {
    const cancelled = () => !!(hooks && hooks.cancelled && hooks.cancelled());
    const say = (p, t) => { if (hooks && hooks.progress) hooks.progress(p, t); };
    const t0 = now();
    const budget = job.budget || 30000;
    const wanted = new Set(job.idxs);
    const N = Math.max(1, wanted.size);
    const total = job.moves.length;
    const out = {};
    const raw = {};

    /* ---- pass 1: every move, quickly */
    const ms1 = clamp(budget * 0.36 / N, 140, 900);
    let g = startPosition(job);
    let done = 0;
    for (let i = 0; i < total; i++) {
      const m = job.moves[i];
      if (wanted.has(i)) {
        if (cancelled()) return null;
        say(done / N * 46, 'Move ' + (Math.floor(i / 2) + 1) + ' of ' + Math.ceil(total / 2));
        await tick();
        let r = null;
        try { r = MR.analyse(g, m, ms1, 14, 4); } catch (e) { r = null; }
        if (r) raw[i] = r;
        done++;
      }
      g.makeMove(m);
    }

    /* ---- which moves deserve a second, deeper look */
    const flagged = [];
    Object.keys(raw).forEach((k) => {
      const r = raw[k], id = r.rating ? r.rating.id : null;
      if (r.forced || r.isMate || !r.top || !r.top.length) return;
      const loss = wpLoss(r.bestScore, r.playedScore);
      const mateish = Math.abs(r.bestScore) > MATE - 200 || Math.abs(r.playedScore) > MATE - 200;
      if ((id && VERIFY[id]) || loss >= 0.035 || (mateish && !(id === 'book'))) flagged.push(+k);
    });
    const F = Math.max(1, flagged.length);
    const remaining = Math.max(2500, budget - (now() - t0) - 800);
    const deepMs = clamp(remaining * 0.62 / F, 400, 3600);
    const lineMs = clamp(remaining * 0.34 / (F * 7), 60, 320);
    const flagSet = new Set(flagged);

    /* ---- pass 2: deeper search + the lines, only where it matters */
    g = startPosition(job);
    let k2 = 0;
    for (let i = 0; i < total; i++) {
      const m = job.moves[i];
      if (raw[i]) {
        let r = raw[i], ver = false;
        if (flagSet.has(i)) {
          if (cancelled()) return null;
          say(46 + k2 / F * 50, 'Looking closer at move ' + (Math.floor(i / 2) + 1));
          await tick();
          let r2 = null;
          try { r2 = MR.analyse(g, m, deepMs, 22, 6); } catch (e) { r2 = null; }
          if (r2 && r2.top && r2.top.length) { r = r2; ver = true; }
          k2++;
          const id = r.rating ? r.rating.id : null;
          const s = slim(r);
          s.ver = ver;
          const playedBest = r.best && same(r.best, m);
          if (TEACH[id] || (VERIFY[id] && playedBest)) {
            await tick();
            try {
              const mv = g.legalMoves().find((x) => same(x, m)) || m;
              if (TEACH[id]) {
                s.ref = playOut(g, mv, 5, lineMs, 12);                 // played move, then what the opponent does about it
                if (r.best && !playedBest) s.bl = playOut(g, r.best, 4, lineMs, 12);   // the better move and what follows
              } else s.bl = playOut(g, mv, 4, lineMs, 12);             // praise: where the move leads
            } catch (e) { /* lines are optional */ }
          }
          out[i] = s;
        } else {
          out[i] = slim(r);
          out[i].ver = false;
        }
      }
      g.makeMove(m);
    }
    say(97, 'Writing the lesson');
    return out;
  }

  root.AnalyzeCore = { analyseGame, startPosition, TEACH, VERIFY };
})();
