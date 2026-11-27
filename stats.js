/**
 * Stats page (this used to be the plain leaderboard): an overview, chess, puzzle and Capture Rush breakdowns.
 * Saved on this device. A small card of it (profileData) is also sent to the online server so other players can open your profile.
 * Elo and the win streak come from online games against real players (event 'online').
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
  const MODE_COL = { basic: '#8fc15b', bullet: '#f2c45a', rapid: '#5ab0ff' };
  const ELO_MODES = ['basic', 'bullet', 'rapid'];
  const PNAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  const PIC = { p: 0, b: 1, q: 2, k: 3, n: 4, r: 5 };
  const QUALITY = [
    ['brilliant', 'Brilliant', '#26c9c3'], ['great', 'Great', '#26c2a3'], ['best', 'Best', '#96bc4b'], ['onlymove', 'Only move', '#3fc6e8'], ['excellent', 'Excellent', '#6fbf73'], ['good', 'Good', '#2888aa'],
    ['book', 'Book', '#c9a56b'], ['interesting', 'Interesting', '#a050aa'], ['novelty', 'Novelty', '#96969a'],
    ['inaccuracy', 'Inaccuracy', '#f7c631'], ['mistake', 'Mistake', '#e58f2a'], ['blunder', 'Blunder', '#ca3431'],
    ['throw', 'Threw the win', '#9c1d2c'], ['missedmate', 'Missed mate', '#d6263b'], ['missedwin', 'Missed win', '#b41e28'], ['forced', 'Forced', '#78787d'],
    ['matewhite', 'Checkmate (W)', '#ebebee'], ['mateblack', 'Checkmate (B)', '#19191c'],
  ];
  const DIFFS = [['easy', 'Easy', '#8fc15b'], ['normal', 'Normal', '#f2c45a'], ['hard', 'Hard', '#ef6a4c'], ['insane', 'Insane', '#c77dff']];
  const KINDS = { mate: ['Checkmate', 3], check: ['Check', 5], best: ['Best move', 4], sac: ['Sacrifice', 2], fork: ['Fork', 1], pin: ['Pin', 3], skewer: ['Skewer', 2], hanging: ['Hanging piece', 5], trapped: ['Trapped piece', 4], backrank: ['Back-rank mate', 2], scholar: ['Scholar\'s mate', 1], underpromo: ['Under-promotion', 5], endgame: ['Endgame practice', 0] };
  const KIND_IDS = Object.keys(KINDS);
  const zeroKinds = () => { const o = {}; KIND_IDS.forEach((k) => { o[k] = 0; }); return o; };

  /* ------------------------------------------------------------------ saved data */
  const blank = () => ({ v: 1, since: 0, games: [], caps: 0, q: {}, puz: {}, rush: [], secs: 0, on: [], owc: 0, owb: 0 });
  let S = blank();
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) S = Object.assign(blank(), s); } catch (e) { /* ignore */ }
  const OWN = S;   // your own stats object (S is swapped for someone else's while their profile is open)
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  const touch = () => { if (!S.since) S.since = Date.now(); };
  // brilliant and best moves found in Analyze reviews, one entry per analysed game (kept apart from S, which is swapped while another player's profile is open)
  const AQKEY = 'localPieces.analysedMoves';
  let AQ = {};
  try { const a = JSON.parse(localStorage.getItem(AQKEY)); if (a && typeof a === 'object') AQ = a; } catch (e) { /* ignore */ }
  /** Record what Analyze found in one game: re-analysing a game replaces its numbers, so nothing is counted twice. */
  function analysed(id, brilliant, best, q) {
    if (!id) return;
    const o = AQ[id], qq = q || {};
    if (o && o.b === brilliant && o.g === best && JSON.stringify(o.q || {}) === JSON.stringify(qq)) return;
    AQ[id] = { b: brilliant | 0, g: best | 0, q: qq };
    try { localStorage.setItem(AQKEY, JSON.stringify(AQ)); } catch (e) { /* ignore */ }
    if (LP.global && LP.global.syncStats) setTimeout(() => LP.global.syncStats(), 600);
  }
  /** Every move rating from every analysed game, added up (your own moves only). */
  function aqAll() {
    const t = {};
    Object.keys(AQ).forEach((id) => { const q = AQ[id] && AQ[id].q; if (q) Object.keys(q).forEach((k) => { t[k] = (t[k] || 0) + q[k]; }); });
    return t;
  }
  const aqSum = (k) => Object.keys(AQ).reduce((a, id) => a + ((AQ[id] && AQ[id][k]) || 0), 0);

  function event(name, p) {
    if (name === 'capture') { S.caps += typeof p === 'number' ? p : 1; save(); return; }
    if (name === 'online' && p) {   // a finished online game against a real player: { m, res: w|l|d, opp, oe, b, a, mv }
      touch();
      S.on.push({ t: Date.now(), m: p.m, res: p.res, opp: String(p.opp || 'Player').slice(0, 16), oe: p.oe || 0, b: p.b, a: p.a, mv: p.mv || 0 });
      if (S.on.length > 300) S.on.shift();
      if (p.res === 'w') { S.owc++; S.owb = Math.max(S.owb, S.owc); } else S.owc = 0;   // a draw or a loss ends the streak
      save();
      return;
    }
    if (name === 'game' && p) {
      touch();
      S.games.push({ t: Date.now(), mode: p.mode, lvl: p.level || 'pvp', res: p.level === 'pvp' ? 'p' : p.won ? 'w' : p.draw ? 'd' : 'l', mv: p.moves || 0, secs: p.secs || 0, elo: p.elo ? { b: p.elo.before, a: p.elo.after } : null });
      if (S.games.length > 400) S.games.shift();
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

  /** Rating history as a small line chart. pts = the ratings after each online game. */
  function spark(pts, color) {
    if (!pts || !pts.length) return '<div class="st-spark none">No online games yet</div>';
    const arr = pts.slice(-24);
    if (arr.length === 1) arr.unshift(arr[0]);
    const lo = Math.min(...arr), hi = Math.max(...arr), span = Math.max(hi - lo, 20), W = 200, H = 46;
    const xy = arr.map((v, i) => [Math.round(i * W / (arr.length - 1)), Math.round(H - 4 - (v - lo) / span * (H - 10))]);
    const line = xy.map((p) => p.join(',')).join(' ');
    return `<svg class="st-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${H} ${line} ${W},${H}" fill="${color}" fill-opacity=".14" stroke="none"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  const tile = (label, val, sub, col) => `<div class="st-tile" style="--c:${col || '#8fc15b'}"><small>${label}</small><b>${val}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const bar = (parts) => `<div class="st-stack">${parts.filter((p) => p.v > 0).map((p) => `<i style="flex:${p.v};background:${p.c}" title="${esc(p.l)}"></i>`).join('')}</div>`;

  /* ------------------------------------------------------------------ views */
  const perfectCount = () => Object.keys(S.puz).reduce((a, k) => a + ((S.puz[k] && S.puz[k].c) || 0), 0);
  /** Everything the overview shows, as plain data. The same shape is what other players get to see (profileData). */
  function selfData() {
    const P = LP.profile, onl = S.on || [], e = {};
    ELO_MODES.forEach((m) => {
      const h = onl.filter((x) => x.m === m && x.a != null).map((x) => x.a), cur = P ? P.elo(m) : (m === 'basic' ? 800 : 1000), r = P ? P.on(m) : { w: 0, l: 0, d: 0 };
      e[m] = { e: cur, pk: Math.max(cur, ...h), w: r.w, l: r.l, d: r.d, h: h.slice(-24) };
    });
    const w = ELO_MODES.reduce((a, m) => a + e[m].w, 0), l = ELO_MODES.reduce((a, m) => a + e[m].l, 0), d = ELO_MODES.reduce((a, m) => a + e[m].d, 0);
    return {
      v: 1, n: (P && P.name()) || '', avg: P ? P.avg() : 0, since: S.since || 0, e, w, l, d, ws: { c: S.owc || 0, b: S.owb || 0 },
      cap: S.caps || 0, pz: DIFFS.reduce((a, x) => a + puzStat(x[0]).solved, 0), pf: perfectCount(), rb: S.rush.reduce((a, r) => Math.max(a, r.score), 0) || rushBestOld(),
      sec: Math.round(S.secs || 0), q: ((S === OWN ? aqAll() : S.q).brilliant || 0) + ((S === OWN ? aqAll() : S.q).great || 0) + ((S === OWN ? aqAll() : S.q).best || 0),
      rec: onl.slice(-6).reverse().map((x) => ({ r: x.res, m: x.m, o: x.opp, oe: x.oe, dl: (x.a != null && x.b != null) ? x.a - x.b : 0, t: x.t })),
    };
  }
  /** The overview page for one player. d = selfData() or another player's card, pfp = their picture (or '' for a letter). */
  function viewHtml(d, pfp, nameOverride) {
    const name = nameOverride || d.n || 'Player';
    const av = pfp ? `<span class="st-av" style="background-image:url(${pfp});background-size:cover;background-position:center"></span>` : `<span class="st-av">${esc((name[0] || '?').toUpperCase())}</span>`;
    const card = (m) => { const x = (d.e && d.e[m]) || { e: m === 'basic' ? 800 : 1000, pk: 0, w: 0, l: 0, d: 0, h: [] };
      return `<div class="st-elo" style="--c:${MODE_COL[m]}"><small>${MODES[m]}</small><b>${x.e}</b><span>Peak ${Math.max(x.pk || 0, x.e)} &middot; ${x.w}W ${x.l}L ${x.d}D</span>${spark(x.h, MODE_COL[m])}</div>`; };
    const n = d.w + d.l + d.d;
    const recent = (d.rec || []).map((g) => `<li class="st-game r-${g.r}">
        <span class="st-res">${g.r === 'w' ? 'W' : g.r === 'l' ? 'L' : 'D'}</span>
        <span class="st-gwho"><b>${esc(MODES[g.m] || g.m)}</b><span>vs ${esc(g.o || 'Player')}${g.oe ? ' (' + g.oe + ')' : ''}</span></span>
        <span class="st-gval">${g.dl ? `<b class="${g.dl >= 0 ? 'up' : 'dn'}">${g.dl >= 0 ? '+' : '−'}${Math.abs(g.dl)}</b>` : ''}<span>${short(g.t)}</span></span></li>`).join('');
    return `<div class="st-hero">${av}<span class="st-hero-t"><b>${esc(name)}</b><span>Average Elo <strong class="st-avg">${d.avg || '—'}</strong>${d.since ? ' &middot; since ' + fmtD(d.since) : ''}</span></span></div>
      <div class="st-elos">${ELO_MODES.map(card).join('')}</div>
      <div class="st-grid">
        ${tile('Online games', n, d.w + 'W ' + d.l + 'L ' + d.d + 'D', '#8fc15b')}
        ${tile('Win rate', pct(d.w, n) + '%', 'vs real players', '#f2c45a')}
        ${tile('Win streak', (d.ws && d.ws.b) || 0, 'vs real players &middot; now ' + ((d.ws && d.ws.c) || 0), '#ef6a4c')}
        ${tile('Captured', d.cap || 0, 'pieces taken', '#5ab0ff')}
        ${tile('Puzzles', d.pz || 0, 'solved', '#f58a2d')}
        ${tile('Perfect puzzles', d.pf || 0, 'no miss, no hint', '#26c2a3')}
        ${tile('Rush best', d.rb || 0, 'points', '#ff9a4d')}
        ${tile('Time played', d.sec ? fmtT(d.sec) : '0m', 'on the app', '#b48cf2')}
      </div>
      <h3 class="st-sub">Recent online games</h3>
      ${recent ? `<ol class="st-games">${recent}</ol>` : empty('Online games against real players show up here.')}`;
  }
  function overview() {
    const P = LP.profile;
    return viewHtml(selfData(), P && P.pfp && P.pfp(), (P && P.name()) || '');
  }
  const rushBestOld = () => { if (OLDOV != null) return OLDOV; try { const o = JSON.parse(localStorage.getItem('localPieces.rushBestPts')) || {}; return Math.max(0, ...Object.values(o).filter((x) => typeof x === 'number')); } catch (e) { return 0; } };

  let chessMode = 'all';
  function chess() {
    const P = LP.profile;
    const list = S.games.filter((g) => chessMode === 'all' || g.mode === chessMode);
    const comp = list.filter((g) => g.res !== 'p');
    const onl = (S.on || []).filter((g) => chessMode === 'all' || g.m === chessMode);
    const w = comp.filter((g) => g.res === 'w').length, l = comp.filter((g) => g.res === 'l').length, d = comp.filter((g) => g.res === 'd').length;
    const n = w + l + d;
    const chips = [['all', 'All'], ['basic', 'Classic'], ['bullet', 'Bullet'], ['rapid', 'Rapid']].map(([k, nm]) => `<button class="lb-chip${chessMode === k ? ' on' : ''}" data-cm="${k}">${nm}</button>`).join('');
    if (!n && !list.length && !onl.length) return `<div class="lb-chips seg st-seg">${chips}</div>` + empty('Play a game and your results will be broken down here.');
    // every opponent actually played: the six built-in levels first, then the other named bots (CopyCat, Stockfish...), then anything unknown, then 2 players
    const seen = Array.from(new Set(list.map((x) => x.lvl)));
    const named = Object.keys(LP.LEVEL_LABEL || {});
    const order = LEVELS.concat(named.filter((k) => !LEVELS.includes(k))).filter((k) => seen.includes(k) && k !== 'pvp')
      .concat(seen.filter((k) => !LEVELS.includes(k) && !named.includes(k) && k !== 'pvp'), seen.includes('pvp') ? ['pvp'] : []);
    const byLvl = order.map((k) => {
      const g = list.filter((x) => x.lvl === k); if (!g.length) return '';
      const tt = tally(g), pl = tt.w + tt.l + tt.d;
      return `<li class="st-row"><span class="st-rn">${esc(lvl(k))}</span>
        <span class="st-rb">${bar([{ v: tt.w, c: '#81b64c', l: 'Wins' }, { v: tt.d, c: '#8a8a85', l: 'Draws' }, { v: tt.l, c: '#ca3431', l: 'Losses' }])}</span>
        <span class="st-rv">${k === 'pvp' ? g.length + ' played' : `<b class="st-w">${tt.w}W</b> <b class="st-l">${tt.l}L</b> <b class="st-d">${tt.d}D</b>`}<small>${k === 'pvp' ? '' : pct(tt.w, pl) + '% won'}</small></span></li>`;
    }).join('');
    const wins = comp.filter((g) => g.res === 'w'), top = wins.reduce((a, g) => (LEVELS.indexOf(g.lvl) > LEVELS.indexOf(a) ? g.lvl : a), 'dumb');
    const mvAvg = list.length ? Math.round(list.reduce((a, g) => a + g.mv, 0) / list.length) : 0;
    const secsAvg = list.length ? list.reduce((a, g) => a + g.secs, 0) / list.length : 0;
    const fastest = wins.length ? Math.min(...wins.map((g) => g.mv)) : 0;
    const longest = list.length ? Math.max(...list.map((g) => g.mv)) : 0;
    const gains = onl.filter((g) => g.a != null && g.b != null).map((g) => g.a - g.b);
    const st = streaks(onl.map((g) => ({ res: g.res })));
    const ow = onl.filter((g) => g.res === 'w').length, ol = onl.filter((g) => g.res === 'l').length, od = onl.filter((g) => g.res === 'd').length;
    const Q = S === OWN ? aqAll() : (S.q || {});
    const qTotal = QUALITY.reduce((a, x) => a + (Q[x[0]] || 0), 0);
    const quality = qTotal ? `<h3 class="st-sub">Move quality</h3><div class="st-quality">${QUALITY.map(([id, nm, col]) => {
      const v = Q[id] || 0;
      return `<div class="st-q"><img src="icon-${id}.png" alt="" width="22" height="22"><span class="st-qn">${nm}</span><span class="st-qb"><i style="width:${Math.max(v ? 3 : 0, pct(v, qTotal))}%;background:${col}"></i></span><b>${v}</b></div>`;
    }).join('')}</div><p class="st-note">Counted from every move in games that have been analysed (Analyze tab).</p>` : `<h3 class="st-sub">Move quality</h3><p class="st-note">Analyse a game to see how your moves rate: Brilliant, Great, Best, Inaccuracy, Mistake, Blunder and more.</p>`;
    return `<div class="lb-chips seg st-seg">${chips}</div>
      <div class="st-card"><h3 class="st-sub" style="margin-top:0">Online (real players)</h3><div class="st-rec"><div><b>${ow}</b><small>Wins</small></div><div><b>${od}</b><small>Draws</small></div><div><b>${ol}</b><small>Losses</small></div><div><b>${pct(ow, ow + ol + od)}%</b><small>Win rate</small></div></div>
        ${bar([{ v: ow, c: '#81b64c', l: 'Wins' }, { v: od, c: '#8a8a85', l: 'Draws' }, { v: ol, c: '#ca3431', l: 'Losses' }])}</div>
      <div class="st-card"><h3 class="st-sub" style="margin-top:0">Against the computer</h3><div class="st-rec"><div><b>${w}</b><small>Wins</small></div><div><b>${d}</b><small>Draws</small></div><div><b>${l}</b><small>Losses</small></div><div><b>${pct(w, n)}%</b><small>Win rate</small></div></div>
        ${bar([{ v: w, c: '#81b64c', l: 'Wins' }, { v: d, c: '#8a8a85', l: 'Draws' }, { v: l, c: '#ca3431', l: 'Losses' }])}</div>
      <div class="st-grid">
        ${tile('Online win streak', st.best, 'vs real players &middot; now ' + st.cur, '#ef6a4c')}
        ${tile('Toughest beaten', wins.length ? lvl(top) : '—', wins.length ? wins.length + ' wins counted' : 'no wins yet', '#f2c45a')}
        ${tile('Average game', mvAvg ? mvAvg + ' moves' : '—', secsAvg ? fmtT(secsAvg) : '', '#5ab0ff')}
        ${tile('Fastest win', fastest ? fastest + ' moves' : '—', longest ? 'longest game ' + longest : '', '#8fc15b')}
        ${tile('Best rating jump', gains.length ? '+' + Math.max(0, Math.max(...gains)) : '—', 'in one online game', '#26c2a3')}
        ${tile('Biggest drop', gains.length ? '−' + Math.abs(Math.min(0, Math.min(...gains))) : '—', 'in one online game', '#ca3431')}
      </div>
      ${byLvl ? `<h3 class="st-sub">By opponent</h3><ul class="st-rows">${byLvl}</ul><p class="st-note">Wins, losses and draws, from games played since stats were added.</p>` : ''}
      ${quality}`;
  }

  let RAWOV = null, OLDOV = null;   // while another player's profile is drawn, their puzzle streaks / old rush best stand in for the local ones
  function puzRaw() {
    if (RAWOV) return RAWOV;
    try { return JSON.parse(localStorage.getItem('localPieces.puzzleStats2')) || {}; } catch (e) { return {}; }
  }
  /** Aggregate one difficulty across types (legacy + new keys). */
  function puzStat(diff) {
    const raw = puzRaw();
    const mine = S.puz[diff] || { s: 0, c: 0, m: 0, k: {} };
    let solved = mine.s || 0, missed = mine.m || 0, clean = mine.c || 0;
    let best = 0, streak = 0;
    const kinds = Object.assign(zeroKinds(), mine.k || {});
    // Legacy difficulty-only key
    const leg = raw[diff] || {};
    solved = Math.max(solved, leg.solved || 0);
    missed = Math.max(missed, leg.missed || 0);
    best = Math.max(best, leg.best || 0);
    streak = Math.max(streak, leg.streak || 0);
    // Per-type keys: easy:mate, etc.
    KIND_IDS.forEach((t) => {
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
    const kinds = zeroKinds();
    rows.forEach((r) => Object.keys(r.s.kinds).forEach((x) => { if (kinds[x] != null) kinds[x] += r.s.kinds[x]; }));
    const kTot = KIND_IDS.reduce((a, k) => a + (kinds[k] || 0), 0);
    const typeBest = Math.max(...KIND_IDS.map((k) => puzTypeStat(k).best), ...rows.map((r) => r.s.best));
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
        <p class="st-note">Streaks are tracked separately for every puzzle type — one never replaces another.</p>` : ''}
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
  const TABS = [['overview', 'Overview'], ['chess', 'Chess'], ['puzzles', 'Puzzles'], ['rush', 'Rush']];
  const TAB_IDS = new Set(TABS.map(([k]) => k));
  let tab = 'overview';
  function render() {
    if (!TAB_IDS.has(tab)) tab = 'overview';
    const nav = $('#st-nav');
    nav.innerHTML = TABS.map(([k, nm]) => `<button class="lb-tab${k === tab ? ' on' : ''}" data-st="${k}">${nm}</button>`).join('');
    nav.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { tab = b.dataset.st; render(); $('#board').scrollTop = 0; }; });
    $('#lb-records').classList.add('hidden');
    $('#st-body').classList.remove('hidden');
    const bodyFn = { overview, chess, puzzles, rush }[tab];
    $('#st-body').innerHTML = bodyFn ? bodyFn() : overview();
    document.querySelectorAll('[data-cm]').forEach((b) => { b.onclick = () => { chessMode = b.dataset.cm; render(); }; });
  }
  /** Everything another player needs to open your profile with all the tabs: the overview data plus a trimmed copy of your stats. */
  function selfCard() {
    const trim = (n) => ({ v: 2, d: selfData(), s: { since: S.since, caps: S.caps, q: S === OWN ? aqAll() : S.q, puz: S.puz, secs: S.secs, owc: S.owc, owb: S.owb, games: S.games.slice(-n.g), on: S.on.slice(-n.o), rush: S.rush.slice(-n.r) }, raw: puzRaw(), old: rushBestOld() });
    let n = { g: 80, o: 150, r: 40 }, c = trim(n);
    for (let i = 0; i < 4 && JSON.stringify(c).length > 44000; i++) { n = { g: n.g >> 1, o: n.o >> 1, r: n.r >> 1 }; c = trim(n); }
    return c;
  }
  /** Draws the Stats tabs (Overview, Chess, Puzzles, Rush) for any player into nav/body. card = selfCard() or what the server sent. */
  function mountProfile(nav, body, card, pfp, name, extra) {
    // extra (optional): { tabs: [[key, label]], first: key to open on, mount(key, body) fills the body of one of those tabs }
    const xt = extra && extra.tabs ? extra.tabs : [];
    let t = extra && extra.first ? extra.first : 'overview';
    const draw = () => {
      nav.innerHTML = TABS.concat(xt).map(([k, nm]) => `<button class="lb-tab${k === t ? ' on' : ''}" data-st="${k}">${nm}</button>`).join('');
      nav.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { t = b.dataset.st; draw(); }; });
      if (xt.some(([k]) => k === t)) { body.innerHTML = ''; extra.mount(t, body); return; }
      const mine = S, ro = RAWOV, oo = OLDOV;
      try {
        if (card.s) { S = Object.assign(blank(), card.s); RAWOV = card.raw || {}; OLDOV = card.old || 0; }
        body.innerHTML = t === 'overview' || !card.s ? (t === 'overview' ? viewHtml(card.d, pfp, name) : empty('This player has not shared these stats yet.')) : ({ chess, puzzles, rush }[t])();
      } finally { S = mine; RAWOV = ro; OLDOV = oo; }
      body.querySelectorAll('[data-cm]').forEach((b) => { b.onclick = () => { chessMode = b.dataset.cm; draw(); }; });
    };
    draw();
  }
  function open(t) { if (typeof t === 'string' && TAB_IDS.has(t)) tab = t; render(); LP.showPage('board'); }
  $('.mode[data-mode="board"]').addEventListener('click', () => open());

  /** Totals for the global leaderboards and the profile card other players can open. */
  function snapshot() {
    const d = selfData(), P = LP.profile, played = P && P.played ? P.played() : 0;
    return {
      cap: S.rush.reduce((m, r) => Math.max(m, r.score || 0), 0) || (typeof rushBestOld === 'function' ? rushBestOld() : 0), brill: aqSum('b'), best: aqSum('g'), secs: Math.round(S.secs || 0),
      elo: played ? d.avg : 0, ws: d.ws.b, perf: d.pf, taken: S.caps || 0, coins: LP.rewards && LP.rewards.tokens ? LP.rewards.tokens() : 0, prof: JSON.stringify(selfCard()),
    };
  }
  function addTime(secs) { touch(); S.secs += Math.max(0, secs || 0); save(); }
  LP.stats = { analysed, event, puzzle, open, render, snapshot, addTime, viewHtml, selfData, selfCard, mountProfile };
})();
