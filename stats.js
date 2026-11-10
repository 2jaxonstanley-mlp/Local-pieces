/**
 * Stats page (this used to be the plain leaderboard): an overview, chess, puzzle and Capture Rush breakdowns,
 * plus the old leaderboard as "Records". Everything is saved on this device only.
 * The games report through LP.rewards.event (which forwards to LP.stats.event) and LP.stats.puzzle.
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;
  const KEY = 'localPieces.stats';
  const LEVELS = ['dumb', 'easy', 'medium', 'hard', 'godly', 'insane'];
  const MODES = { basic: 'Classic', secret: 'Secret Queen', bullet: 'Bullet', rapid: 'Rapid', hockey: 'Air Hockey', snail: 'Immortal Snail', gamble: 'Gamblite Chess', guess: 'Guess Who Chess', royale: 'Chess Royale' };
  const MODE_COL = { basic: '#8fc15b', secret: '#b48cf2' };
  const PNAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  const PIC = { p: 0, b: 1, q: 2, k: 3, n: 4, r: 5 };
  const QUALITY = [
    ['brilliant', 'Brilliant', '#26c9c3'], ['great', 'Great', '#26c2a3'], ['best', 'Best', '#96bc4b'], ['good', 'Good', '#2888aa'],
    ['book', 'Book', '#c9a56b'], ['interesting', 'Interesting', '#a050aa'], ['novelty', 'Novelty', '#96969a'],
    ['inaccuracy', 'Inaccuracy', '#f7c631'], ['mistake', 'Mistake', '#e58f2a'], ['blunder', 'Blunder', '#ca3431'],
    ['missedwin', 'Missed win', '#b41e28'], ['forced', 'Forced', '#78787d'],
    ['matewhite', 'Checkmate (W)', '#ebebee'], ['mateblack', 'Checkmate (B)', '#19191c'],
  ];
  const DIFFS = [['easy', 'Easy', '#8fc15b'], ['normal', 'Normal', '#f2c45a'], ['hard', 'Hard', '#ef6a4c'], ['insane', 'Insane', '#c77dff']];
  const KINDS = { mate: ['Checkmate', 3], check: ['Check', 5], best: ['Best move', 4], sac: ['Sacrifice', 2], fork: ['Fork', 1] };

  /* ------------------------------------------------------------------ saved data */
  const blank = () => ({ v: 1, since: 0, games: [], caps: 0, q: {}, puz: {}, rush: [], secs: 0 });
  let S = blank();
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) S = Object.assign(blank(), s); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  const touch = () => { if (!S.since) S.since = Date.now(); };

  function event(name, p) {
    if (name === 'capture') { S.caps += typeof p === 'number' ? p : 1; save(); return; }
    if (name === 'game' && p) {
      touch();
      S.games.push({ t: Date.now(), mode: p.mode, lvl: p.level || 'pvp', res: p.level === 'pvp' ? 'p' : p.won ? 'w' : p.draw ? 'd' : 'l', mv: p.moves || 0, secs: p.secs || 0, elo: p.elo ? { b: p.elo.before, a: p.elo.after } : null });
      if (S.games.length > 400) S.games.shift();
      Object.keys(p.q || {}).forEach((k) => { S.q[k] = (S.q[k] || 0) + p.q[k]; });
      S.secs += p.secs || 0;
      save();
    } else if (name === 'rush' && p) {
      touch();
      S.rush.push({ t: Date.now(), score: p.score || 0, piece: p.piece, lvl: p.level, caps: p.caps || 0, taken: p.taken || 0 });
      if (S.rush.length > 200) S.rush.shift();
      S.secs += 150;
      save();
    }
  }
  function puzzle(p) {
    touch();
    const d = S.puz[p.diff] || (S.puz[p.diff] = { s: 0, c: 0, m: 0, k: {} });
    if (p.miss) d.m++;
    else { d.s++; if (p.clean) d.c++; d.k[p.type] = (d.k[p.type] || 0) + 1; }
    save();
  }

  /* ------------------------------------------------------------------ helpers */
  const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
  const fmtT = (s) => { const m = Math.round(s / 60); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
  const fmtD = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const short = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const lvl = (l) => (l === 'pvp' ? '2 players' : (LP.LEVEL_LABEL && LP.LEVEL_LABEL[l]) || l);
  const spr = (i, cls) => `<i class="ic-sp${cls ? ' ' + cls : ''}" style="--i:${i}"></i>`;
  const vsComp = () => S.games.filter((g) => g.res !== 'p');
  const tally = (list) => list.reduce((a, g) => { a[g.res]++; return a; }, { w: 0, l: 0, d: 0, p: 0 });
  const empty = (txt) => `<div class="st-empty">${txt}</div>`;

  /** Longest and current run of wins (a draw or loss ends the run). */
  function streaks(list) {
    let cur = 0, best = 0;
    list.forEach((g) => { if (g.res === 'w') { cur++; best = Math.max(best, cur); } else if (g.res !== 'p') cur = 0; });
    return { cur, best };
  }

  /** Rating history for one mode as a small line chart. */
  function spark(mode, color) {
    const pts = S.games.filter((g) => g.mode === mode && g.elo).map((g) => g.elo.a);
    const now = LP.profile ? LP.profile.elo(mode) : null;
    if (!pts.length) return '<div class="st-spark none">No rated games yet</div>';
    const arr = pts.slice(-24);
    if (arr.length === 1) arr.unshift(arr[0]);
    const lo = Math.min(...arr), hi = Math.max(...arr), span = Math.max(hi - lo, 20), W = 200, H = 46;
    const xy = arr.map((v, i) => [Math.round(i * W / (arr.length - 1)), Math.round(H - 4 - (v - lo) / span * (H - 10))]);
    const line = xy.map((p) => p.join(',')).join(' ');
    return `<svg class="st-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${H} ${line} ${W},${H}" fill="${color}" fill-opacity=".14" stroke="none"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>` + (now == null ? '' : '');
  }

  const tile = (label, val, sub, col) => `<div class="st-tile" style="--c:${col || '#8fc15b'}"><small>${label}</small><b>${val}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const bar = (parts) => `<div class="st-stack">${parts.filter((p) => p.v > 0).map((p) => `<i style="flex:${p.v};background:${p.c}" title="${esc(p.l)}"></i>`).join('')}</div>`;

  /* ------------------------------------------------------------------ views */
  function overview() {
    const P = LP.profile, name = (P && P.name()) || '';
    const cg = vsComp(), t = tally(S.games), st = streaks(S.games);
    const rec = (m) => (P && P.rec ? P.rec(m) : { w: 0, l: 0, d: 0 });
    const w = rec('basic').w + rec('secret').w, l = rec('basic').l + rec('secret').l, d = rec('basic').d + rec('secret').d;
    const total = Math.max(w + l + d + t.p, S.games.length);
    const wins = Math.max(w + (S.games.filter((g) => g.res === 'p').length ? 0 : 0), t.w);
    const eloCard = (m) => {
      const cur = P ? P.elo(m) : 800, hist = S.games.filter((g) => g.mode === m && g.elo).map((g) => g.elo.a);
      const peak = Math.max(cur, ...hist), r = rec(m);
      return `<div class="st-elo" style="--c:${MODE_COL[m]}"><small>${MODES[m]}</small><b>${cur}</b><span>Peak ${peak} &middot; ${r.w}W ${r.l}L ${r.d}D</span>${spark(m, MODE_COL[m])}</div>`;
    };
    const solved = DIFFS.reduce((a, x) => a + puzStat(x[0]).solved, 0);
    const bestRush = S.rush.reduce((a, r) => Math.max(a, r.score), 0) || rushBestOld();
    const recent = S.games.slice(-6).reverse().map((g) => `<li class="st-game r-${g.res}">
        <span class="st-res">${g.res === 'w' ? 'W' : g.res === 'l' ? 'L' : g.res === 'd' ? 'D' : '·'}</span>
        <span class="st-gwho"><b>${MODES[g.mode] || g.mode}</b><span>vs ${esc(lvl(g.lvl))} &middot; ${g.mv} moves</span></span>
        <span class="st-gval">${g.elo ? `<b class="${g.elo.a >= g.elo.b ? 'up' : 'dn'}">${g.elo.a >= g.elo.b ? '+' : '−'}${Math.abs(g.elo.a - g.elo.b)}</b>` : ''}<span>${short(g.t)}</span></span></li>`).join('');
    return `<div class="st-hero"><span class="st-av">${esc((name[0] || '?').toUpperCase())}</span><span class="st-hero-t"><b>${esc(name || 'Player')}</b><span>${S.since ? 'Playing since ' + fmtD(S.since) : 'Play a game to start your stats'}</span></span></div>
      <div class="st-elos">${eloCard('basic')}${eloCard('secret')}</div>
      <div class="st-grid">
        ${tile('Games', total, t.p ? t.p + ' with friends' : 'against the computer', '#8fc15b')}
        ${tile('Win rate', pct(w, w + l + d) + '%', w + ' wins', '#f2c45a')}
        ${tile('Win streak', st.best, 'now ' + st.cur, '#ef6a4c')}
        ${tile('Captured', S.caps, 'pieces taken', '#5ab0ff')}
        ${tile('Puzzles', solved, 'solved', '#f58a2d')}
        ${tile('Rush best', bestRush, 'points', '#ff9a4d')}
        ${tile('Time played', S.secs ? fmtT(S.secs) : '0m', 'since tracking began', '#b48cf2')}
        ${tile('Quality moves', (S.q.brilliant || 0) + (S.q.great || 0) + (S.q.best || 0), 'brilliant, great or best', '#26c2a3')}
      </div>
      <h3 class="st-sub">Recent games</h3>
      ${recent ? `<ol class="st-games">${recent}</ol>` : empty('Your latest games show up here.')}`;
  }
  const rushBestOld = () => { try { const o = JSON.parse(localStorage.getItem('localPieces.rushBestPts')) || {}; return Math.max(0, ...Object.values(o).filter((x) => typeof x === 'number')); } catch (e) { return 0; } };

  let chessMode = 'all';
  function chess() {
    const P = LP.profile;
    const rec = (m) => (P && P.rec ? P.rec(m) : { w: 0, l: 0, d: 0 });
    const modes = chessMode === 'all' ? ['basic', 'secret'] : [chessMode];
    const list = S.games.filter((g) => chessMode === 'all' || g.mode === chessMode);
    const comp = list.filter((g) => g.res !== 'p');
    const w = modes.reduce((a, m) => a + rec(m).w, 0), l = modes.reduce((a, m) => a + rec(m).l, 0), d = modes.reduce((a, m) => a + rec(m).d, 0);
    const n = w + l + d;
    const chips = [['all', 'All'], ['basic', 'Classic'], ['secret', 'Secret Queen']].map(([k, nm]) => `<button class="lb-chip${chessMode === k ? ' on' : ''}" data-cm="${k}">${nm}</button>`).join('');
    if (!n && !list.length) return `<div class="lb-chips seg st-seg">${chips}</div>` + empty('Play a game against the computer and your results will be broken down here.');
    const byLvl = LEVELS.concat(['pvp']).map((k) => {
      const g = list.filter((x) => x.lvl === k); if (!g.length) return '';
      const tt = tally(g), pl = tt.w + tt.l + tt.d;
      return `<li class="st-row"><span class="st-rn">${esc(lvl(k))}</span>
        <span class="st-rb">${bar([{ v: tt.w, c: '#81b64c', l: 'Wins' }, { v: tt.d, c: '#8a8a85', l: 'Draws' }, { v: tt.l, c: '#ca3431', l: 'Losses' }])}</span>
        <span class="st-rv">${k === 'pvp' ? g.length + ' played' : tt.w + '-' + tt.l + '-' + tt.d}<small>${k === 'pvp' ? '' : pct(tt.w, pl) + '% won'}</small></span></li>`;
    }).join('');
    const wins = comp.filter((g) => g.res === 'w'), top = wins.reduce((a, g) => (LEVELS.indexOf(g.lvl) > LEVELS.indexOf(a) ? g.lvl : a), 'dumb');
    const mvAvg = list.length ? Math.round(list.reduce((a, g) => a + g.mv, 0) / list.length) : 0;
    const secsAvg = list.length ? list.reduce((a, g) => a + g.secs, 0) / list.length : 0;
    const fastest = wins.length ? Math.min(...wins.map((g) => g.mv)) : 0;
    const longest = list.length ? Math.max(...list.map((g) => g.mv)) : 0;
    const gains = comp.filter((g) => g.elo).map((g) => g.elo.a - g.elo.b);
    const st = streaks(S.games.filter((g) => chessMode === 'all' || g.mode === chessMode));
    const qTotal = QUALITY.reduce((a, x) => a + (S.q[x[0]] || 0), 0);
    const quality = qTotal ? `<h3 class="st-sub">Move quality</h3><div class="st-quality">${QUALITY.map(([id, nm, col]) => {
      const v = S.q[id] || 0;
      return `<div class="st-q"><img src="icon-${id}.png" alt="" width="22" height="22"><span class="st-qn">${nm}</span><span class="st-qb"><i style="width:${Math.max(v ? 3 : 0, pct(v, qTotal))}%;background:${col}"></i></span><b>${v}</b></div>`;
    }).join('')}</div><p class="st-note">Counted from your moves when move strength labels are switched on.</p>` : '';
    return `<div class="lb-chips seg st-seg">${chips}</div>
      <div class="st-card"><div class="st-rec"><div><b>${w}</b><small>Wins</small></div><div><b>${d}</b><small>Draws</small></div><div><b>${l}</b><small>Losses</small></div><div><b>${pct(w, n)}%</b><small>Win rate</small></div></div>
        ${bar([{ v: w, c: '#81b64c', l: 'Wins' }, { v: d, c: '#8a8a85', l: 'Draws' }, { v: l, c: '#ca3431', l: 'Losses' }])}</div>
      <div class="st-grid">
        ${tile('Best win streak', st.best, 'now ' + st.cur, '#ef6a4c')}
        ${tile('Toughest beaten', wins.length ? lvl(top) : '—', wins.length ? wins.length + ' wins counted' : 'no wins yet', '#f2c45a')}
        ${tile('Average game', mvAvg ? mvAvg + ' moves' : '—', secsAvg ? fmtT(secsAvg) : '', '#5ab0ff')}
        ${tile('Fastest win', fastest ? fastest + ' moves' : '—', longest ? 'longest game ' + longest : '', '#8fc15b')}
        ${tile('Best rating jump', gains.length ? '+' + Math.max(0, Math.max(...gains)) : '—', 'in a single game', '#26c2a3')}
        ${tile('Biggest drop', gains.length ? '−' + Math.abs(Math.min(0, Math.min(...gains))) : '—', 'in a single game', '#ca3431')}
      </div>
      ${byLvl ? `<h3 class="st-sub">By opponent</h3><ul class="st-rows">${byLvl}</ul><p class="st-note">Wins, losses and draws, from games played since stats were added.</p>` : ''}
      ${quality}`;
  }

  function puzRaw() {
    try { return JSON.parse(localStorage.getItem('localPieces.puzzleStats2')) || {}; } catch (e) { return {}; }
  }
  /** Aggregate one difficulty across types (legacy + new keys). */
  function puzStat(diff) {
    const raw = puzRaw();
    const mine = S.puz[diff] || { s: 0, c: 0, m: 0, k: {} };
    let solved = mine.s || 0, missed = mine.m || 0, clean = mine.c || 0;
    let best = 0, streak = 0;
    const kinds = Object.assign({ mate: 0, check: 0, best: 0, sac: 0, fork: 0 }, mine.k || {});
    // Legacy difficulty-only key
    const leg = raw[diff] || {};
    solved = Math.max(solved, leg.solved || 0);
    missed = Math.max(missed, leg.missed || 0);
    best = Math.max(best, leg.best || 0);
    streak = Math.max(streak, leg.streak || 0);
    // Per-type keys: easy:mate, etc.
    ['mate', 'check', 'best', 'sac', 'fork'].forEach((t) => {
      const o = raw[diff + ':' + t] || {};
      solved += o.solved || 0;
      missed += o.missed || 0;
      best = Math.max(best, o.best || 0);
      streak = Math.max(streak, o.streak || 0);
      kinds[t] = (kinds[t] || 0) + (o.solved || 0);
    });
    return { solved, missed, streak, best, clean, kinds };
  }
  function puzTypeStat(type) {
    const raw = puzRaw();
    let best = 0, streak = 0, solved = 0;
    DIFFS.forEach(([d]) => {
      const o = raw[d + ':' + type] || {};
      best = Math.max(best, o.best || 0);
      streak = Math.max(streak, o.streak || 0);
      solved += o.solved || 0;
    });
    return { best, streak, solved };
  }
  function puzzles() {
    const rows = DIFFS.map(([k, nm, col]) => ({ k, nm, col, s: puzStat(k) }));
    const solved = rows.reduce((a, r) => a + r.s.solved, 0), missed = rows.reduce((a, r) => a + r.s.missed, 0);
    if (!solved && !missed) return empty('Solve a puzzle and your accuracy and streaks will appear here.');
    const kinds = { mate: 0, check: 0, best: 0, sac: 0, fork: 0 };
    rows.forEach((r) => Object.keys(r.s.kinds).forEach((x) => { if (kinds[x] != null) kinds[x] += r.s.kinds[x]; }));
    const kTot = kinds.mate + kinds.check + kinds.best + kinds.sac + kinds.fork;
    const typeBest = Math.max(puzTypeStat('mate').best, puzTypeStat('check').best, puzTypeStat('best').best, puzTypeStat('sac').best, puzTypeStat('fork').best, ...rows.map((r) => r.s.best));
    const typeRows = Object.keys(KINDS).map((k) => {
      const ts = puzTypeStat(k);
      return `<div class="st-q"><span class="st-qi">${spr(KINDS[k][1])}</span><span class="st-qn">${KINDS[k][0]}</span>` +
        `<span class="st-qb"><i style="width:${Math.max(kinds[k] ? 3 : 0, pct(kinds[k], kTot || 1))}%;background:#f2c45a"></i></span>` +
        `<b>${kinds[k] || 0}</b></div>` +
        `<div class="st-note" style="margin:-.2rem 0 .5rem 2.4rem">Best streak ${ts.best} · current ${ts.streak}</div>`;
    }).join('');
    return `<div class="st-card"><div class="st-rec"><div><b>${solved}</b><small>Solved</small></div><div><b>${missed}</b><small>Misses</small></div><div><b>${pct(solved, solved + missed)}%</b><small>Accuracy</small></div><div><b>${typeBest}</b><small>Best streak</small></div></div>
        ${bar([{ v: solved, c: '#81b64c', l: 'Solved' }, { v: missed, c: '#ca3431', l: 'Missed' }])}</div>
      <h3 class="st-sub">By difficulty</h3>
      <div class="st-diffs">${rows.map((r) => `<div class="st-diff" style="--c:${r.col}"><b>${r.nm}</b>
        <span class="st-ring" style="--p:${pct(r.s.solved, r.s.solved + r.s.missed)}"><i>${pct(r.s.solved, r.s.solved + r.s.missed)}%</i></span>
        <span>${r.s.solved} solved</span><span>${r.s.missed} missed</span><span>Best streak ${r.s.best}</span></div>`).join('')}</div>
      ${kTot ? `<h3 class="st-sub">By puzzle type</h3><div class="st-quality">${typeRows}</div>
        <p class="st-note">Streaks are tracked separately for Checkmate, Check, Best move and Sacrifice — one never replaces another.</p>` : ''}
      <div class="st-grid">${tile('Clean solves', rows.reduce((a, r) => a + r.s.clean, 0), 'no misses', '#26c2a3')}${tile('Puzzle rate', pct(solved, solved + missed) + '%', 'solved vs missed', '#f2c45a')}</div>`;
  }

  function rush() {
    const R = S.rush;
    if (!R.length) return empty('Finish a Capture Rush round and your scores, captures and favourite piece will show up here.') + (rushBestOld() ? `<div class="st-grid">${tile('Earlier best', rushBestOld(), 'points before stats', '#ff9a4d')}</div>` : '');
    const tot = R.reduce((a, r) => a + r.score, 0), best = Math.max(...R.map((r) => r.score));
    const caps = R.reduce((a, r) => a + r.caps, 0), lost = R.reduce((a, r) => a + r.taken, 0);
    const per = Object.keys(PNAME).map((p) => { const g = R.filter((r) => r.piece === p); return { p, n: g.length, best: g.length ? Math.max(...g.map((r) => r.score)) : null, avg: g.length ? Math.round(g.reduce((a, r) => a + r.score, 0) / g.length) : 0 }; });
    const fav = per.slice().sort((a, b) => b.n - a.n)[0];
    const last = R.slice(-14), mx = Math.max(1, ...last.map((r) => Math.abs(r.score)));
    return `<div class="st-card"><div class="st-rec"><div><b>${R.length}</b><small>Rounds</small></div><div><b>${best}</b><small>Best</small></div><div><b>${Math.round(tot / R.length)}</b><small>Average</small></div><div><b>${caps}</b><small>Captures</small></div></div></div>
      <h3 class="st-sub">Last ${last.length} rounds</h3>
      <div class="st-bars">${last.map((r) => `<span class="${r.score < 0 ? 'neg' : ''}" title="${r.score}"><i style="height:${Math.max(4, Math.round(Math.abs(r.score) / mx * 100))}%"></i></span>`).join('')}</div>
      <h3 class="st-sub">By piece</h3>
      <ul class="st-rows">${per.map((x) => `<li class="st-row"><span class="st-rn">${spr(PIC[x.p], 'st-pi')}${PNAME[x.p]}</span><span class="st-rb"><span class="st-qb"><i style="width:${x.best == null ? 0 : Math.max(3, pct(Math.max(0, x.best), best))}%;background:#ff9a4d"></i></span></span><span class="st-rv">${x.best == null ? '—' : x.best}<small>${x.n} ${x.n === 1 ? "round" : "rounds"}</small></span></li>`).join('')}</ul>
      <div class="st-grid">${tile('Total points', tot, 'all rounds', '#ff9a4d')}${tile('Favourite piece', fav.n ? PNAME[fav.p] : '—', fav.n ? fav.n + (fav.n === 1 ? " round" : " rounds") : '', '#f2c45a')}${tile('Pieces lost', lost, 'taken from you', '#ca3431')}${tile('Capture ratio', lost ? (caps / lost).toFixed(1) : caps, 'taken per lost', '#26c2a3')}</div>`;
  }

  /* ------------------------------------------------------------------ page */
  const TABS = [['overview', 'Overview'], ['chess', 'Chess'], ['puzzles', 'Puzzles'], ['rush', 'Rush'], ['records', 'Records']];
  const TAB_IDS = new Set(TABS.map(([k]) => k));
  let tab = 'overview';
  function render() {
    if (!TAB_IDS.has(tab)) tab = 'overview';
    const nav = $('#st-nav');
    nav.innerHTML = TABS.map(([k, nm]) => `<button class="lb-tab${k === tab ? ' on' : ''}" data-st="${k}">${nm}</button>`).join('');
    nav.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { tab = b.dataset.st; render(); $('#board').scrollTop = 0; }; });
    const rec = tab === 'records';
    $('#lb-records').classList.toggle('hidden', !rec);
    $('#st-body').classList.toggle('hidden', rec);
    if (rec) { if (LP.board && LP.board.render) LP.board.render(); return; }
    const bodyFn = { overview, chess, puzzles, rush }[tab];
    $('#st-body').innerHTML = bodyFn ? bodyFn() : overview();
    document.querySelectorAll('[data-cm]').forEach((b) => { b.onclick = () => { chessMode = b.dataset.cm; render(); }; });
  }
  function open(t) { if (typeof t === 'string' && TAB_IDS.has(t)) tab = t; render(); LP.showPage('board'); }
  $('.mode[data-mode="board"]').addEventListener('click', () => open());

  /** Totals for the global leaderboard, and a way for Puzzle Rush to add its play time. */
  function snapshot() {
    return { cap: S.rush.reduce((m, r) => Math.max(m, r.score || 0), 0) || (typeof rushBestOld === 'function' ? rushBestOld() : 0), brill: S.q.brilliant || 0, best: S.q.best || 0, secs: Math.round(S.secs || 0) };
  }
  function addTime(secs) { touch(); S.secs += Math.max(0, secs || 0); save(); }
  LP.stats = { event, puzzle, open, render, snapshot, addTime };
})();
