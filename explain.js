/**
 * Explanations for Analyze: finds out WHAT went wrong (or what was good) in a move and says it in plain words, never in chess
 * notation. Works from the position before the move plus the lines the engine played out (analyzecore.js):
 *   ref = the move played, then the opponent's best replies    bl = the better move and what follows
 *
 * It looks for: free pieces, pieces moved into danger, ignored threats, pulled-away defenders, forks, pins, discovered
 * attacks, back-rank and smothered checkmates, missed captures, missed forks, missed checkmates, and falls back to
 * "your position went from X to Y". No DOM in here, so it can be tested from node.
 *
 * Squares are 0x88 numbers everywhere in this file; the lesson text and the returned `sq` / `thr` use 0-63 (rank * 8 + file).
 */
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const MR = root.MoveRating;
  const WH = 8, BL = 16;
  const MATE = 100000;
  const NAMES = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
  const VAL = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100 };
  const KN = [31, 33, 14, 18, -31, -33, -14, -18], KG = [1, -1, 16, -16, 15, 17, -15, -17], DG = [15, 17, -15, -17], OR = [1, -1, 16, -16];
  const on = (s) => !(s & 0x88);
  const nm = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
  const col = (p) => p & 24;
  const typ = (p) => p & 7;
  const foeOf = (c) => (c === WH ? BL : WH);
  const idx = (s) => (s >> 4) * 8 + (s & 7);
  const same = (a, b) => a.from === b.from && a.to === b.to && (a.promo || 0) === (b.promo || 0) && (a.q || 0) === (b.q || 0);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const listOf = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const withArticle = (w) => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w;

  const pname = (g, s) => (g.isSecretDisguised && g.isSecretDisguised(s) ? 'secret queen' : NAMES[g.effectiveType(s)] || NAMES[typ(g.board[s])] || 'piece');

  /* ------------------------------------------------------------------ attacks and exchanges */
  /** Squares of the pieces of colour c that attack square s on board B. */
  function attackers(B, s, c) {
    const out = [];
    const pd = c === WH ? -16 : 16;
    for (const df of [-1, 1]) { const a = s + pd + df; if (on(a) && B[a] === (c | 1)) out.push(a); }
    for (const d of KN) { const a = s + d; if (on(a) && B[a] === (c | 2)) out.push(a); }
    for (const d of KG) { const a = s + d; if (on(a) && B[a] === (c | 6)) out.push(a); }
    for (const d of DG) { let a = s + d; while (on(a)) { const p = B[a]; if (p) { if (col(p) === c && (typ(p) === 3 || typ(p) === 5)) out.push(a); break; } a += d; } }
    for (const d of OR) { let a = s + d; while (on(a)) { const p = B[a]; if (p) { if (col(p) === c && (typ(p) === 4 || typ(p) === 5)) out.push(a); break; } a += d; } }
    return out;
  }

  /** Static exchange: what the side moving the piece on `from` nets (in pawns) by taking on `to` and letting everything recapture. */
  function see(B0, from, to, ep) {
    const B = B0.slice();
    const mover = B[from], c = col(mover);
    const gain = [B[to] ? VAL[typ(B[to])] : (ep ? 1 : 0)];
    let cur = VAL[typ(mover)], side = foeOf(c), d = 0;
    B[to] = mover; B[from] = 0;
    if (ep) B[to + (c === WH ? -16 : 16)] = 0;
    for (;;) {
      const list = attackers(B, to, side);
      d++;
      gain[d] = cur - gain[d - 1];
      if (!list.length) break;
      let a = list[0], av = VAL[typ(B[a])];
      for (const x of list) { const v = VAL[typ(B[x])]; if (v < av) { av = v; a = x; } }
      cur = av; B[to] = B[a]; B[a] = 0; side = foeOf(side);
    }
    while (--d > 0) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    return gain[0];
  }

  /** Can the piece on `from` legally capture on `to` right now, with its side to move? */
  function legalCapture(g, from, to) {
    const c = MR.clone(g);
    c.turn = col(g.board[from]); c.ep = g.ep;
    return c.legalMovesFrom(from).find((m) => m.to === to) || null;
  }

  /** Pieces of colour `color` (not the king) that the other side can win material from right now: [{ sq, name, val, gain, from }] biggest first. */
  function hanging(g, color) {
    const foe = foeOf(color), out = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = g.board[s];
      if (!p || col(p) !== color || typ(p) === 6) continue;
      let best = 0, from = -1;
      for (const a of attackers(g.board, s, foe)) {
        const sc = see(g.board, a, s, false);
        if (sc > best && legalCapture(g, a, s)) { best = sc; from = a; }
      }
      if (best > 0) out.push({ sq: s, name: pname(g, s), val: VAL[typ(p)], gain: best, from });
    }
    return out.sort((a, b) => b.gain - a.gain || b.val - a.val);
  }

  /** Pins and skewers against `victim` made by the other side's long-range pieces: [{ s, x, z, kind }]. */
  function pinsOf(g, victim) {
    const B = g.board, foe = foeOf(victim), out = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = B[s];
      if (!p || col(p) !== foe) continue;
      const t = typ(p);
      if (t < 3 || t > 5) continue;
      const dirs = t === 3 ? DG : t === 4 ? OR : DG.concat(OR);
      for (const d of dirs) {
        let a = s + d;
        while (on(a) && !B[a]) a += d;
        if (!on(a) || col(B[a]) !== victim || typ(B[a]) === 6) continue;
        const x = a;
        let b = x + d;
        while (on(b) && !B[b]) b += d;
        if (!on(b) || col(B[b]) !== victim) continue;
        const xt = typ(B[x]), zt = typ(B[b]);
        if (zt === 6 || VAL[zt] - VAL[xt] >= 2) out.push({ s, x, z: b, kind: 'pin' });
        else if (VAL[xt] >= 5 && VAL[zt] >= 3 && VAL[xt] - VAL[zt] >= 2) out.push({ s, x, z: b, kind: 'skewer' });
      }
    }
    return out;
  }

  /** The piece on s (belonging to the side that just moved) attacks two or more valuable things of `victim`, and cannot just be taken. */
  function forkInfo(c, s, victim) {
    const Y = c.board[s];
    if (!Y || col(Y) === victim || typ(Y) === 6) return null;
    const yv = VAL[typ(Y)];
    const targets = [];
    const seen = new Set();
    for (const m of c.genPieceMoves(s)) {
      const t = c.board[m.to];
      if (!t || col(t) !== victim || seen.has(m.to)) continue;
      seen.add(m.to);
      const tv = VAL[typ(t)];
      const defended = attackers(c.board, m.to, victim).length > 0;
      if (typ(t) === 6 || tv > yv || (tv >= 1 && !defended)) targets.push({ sq: m.to, name: pname(c, m.to), val: tv });
    }
    if (targets.length < 2) return null;
    for (const a of attackers(c.board, s, victim)) {            // it can be taken: not a real fork unless the take loses material
      if (see(c.board, a, s, false) > 0 && legalCapture(c, a, s)) return null;
      if (see(c.board, a, s, false) === 0 && yv >= 3 && legalCapture(c, a, s)) return null;
    }
    return { to: s, name: pname(c, s), targets };
  }

  /* ------------------------------------------------------------------ describing moves in words */
  /** A move in plain words: { past: 'moved the knight from f3 to g5', inf: 'move ...', ger: 'moving ...', piece, victim, check, mate }. */
  function phrase(g, m) {
    const p = g.board[m.from];
    const piece = pname(g, m.from);
    const f = nm(m.from), t = nm(m.to);
    const vp = g.board[m.to];
    const victim = vp ? pname(g, m.to) : (m.flags === 2 ? 'pawn' : null);
    let verb, rest;
    if (m.flags === 4 || m.flags === 8) {
      const side = m.flags === 4 ? 'kingside' : 'queenside';
      verb = ['castled', 'castle', 'castling']; rest = ' ' + side;
    } else if (victim) {
      verb = ['took', 'take', 'taking'];
      rest = m.flags === 2 ? ` a pawn en passant on ${t} with the pawn from ${f}` : ` the ${victim} on ${t} with the ${piece}`;
    } else {
      verb = ['moved', 'move', 'moving'];
      rest = ` the ${piece} from ${f} to ${t}`;
    }
    if (m.promo) rest += (victim || m.flags === 4 ? ' and' : ',') + ` promoting it to ${withArticle(NAMES[m.promo] || 'queen')}`;
    let check = false, mate = false;
    try {
      const c = MR.clone(g);
      c.makeMove(c.legalMoves().find((x) => same(x, m)) || m);
      check = c.inCheck(c.turn); mate = check && !c.hasLegalMove();
    } catch (e) { /* plain words only */ }
    return { past: verb[0] + rest, inf: verb[1] + rest, ger: verb[2] + rest, piece, victim, check, mate, color: col(p) };
  }

  /** Walk a line [[from, to, promo, q], ...] from position g0: [{ m, pre, post, color, piece, victim, victimVal, check, mate, ph }]. */
  function walk(g0, keys) {
    const c = MR.clone(g0), out = [];
    for (const k of keys || []) {
      const m = c.legalMoves().find((x) => x.from === k[0] && x.to === k[1] && (x.promo || 0) === (k[2] || 0) && (x.q || 0) === (k[3] || 0));
      if (!m) break;
      const pre = MR.clone(c), color = c.turn;
      const vp = c.board[m.to];
      const ph = phrase(c, m);
      c.makeMove(m);
      out.push({ m, pre, post: MR.clone(c), color, piece: ph.piece, victim: ph.victim, victimVal: vp ? VAL[typ(vp)] : (m.flags === 2 ? 1 : 0), check: ph.check, mate: ph.mate, ph });
      if (!c.hasLegalMove()) break;
    }
    return out;
  }

  /* ------------------------------------------------------------------ evaluation in words */
  const EVW = [[0.9, 'winning'], [0.75, 'clearly better'], [0.6, 'slightly better'], [0.42, 'equal'], [0.28, 'slightly worse'], [0.1, 'clearly worse'], [-1, 'losing']];
  const evalWord = (wp) => (EVW.find((e) => wp >= e[0]) || EVW[EVW.length - 1])[1];
  function swing(vc, B, P) {
    const a = evalWord(MR.wp(B)), b = evalWord(MR.wp(P));
    if (a !== b) return ` That took ${vc.poss} position from ${a} to ${b}.`;
    return MR.wp(B) - MR.wp(P) > 0.04 ? ` That gave away part of ${vc.poss} ${a === 'equal' ? 'balance' : 'edge'}.` : '';
  }

  /** Why a move is good, as a short phrase that continues "... by": "winning the bishop for free", "giving check", ... ('' when nothing stands out). */
  function why(g, m) {
    if (!m) return '';
    try {
      const me = g.turn, foe = foeOf(me);
      const ph = phrase(g, m);
      if (ph.mate) return 'delivering checkmate';
      if (ph.victim && !(m.flags === 4 || m.flags === 8)) {
        const gain = see(g.board, m.from, m.to, m.flags === 2);
        const val = g.board[m.to] ? VAL[typ(g.board[m.to])] : 1;
        if (gain >= val) return 'winning it for free';
        if (gain > 0) return 'winning material in the exchange';
        return '';
      }
      if (m.flags === 4 || m.flags === 8) return 'getting the king to safety and the rook into play';
      if (m.promo) return 'promoting the pawn';
      const pre = hanging(g, me);
      const c = MR.clone(g);
      c.makeMove(c.legalMoves().find((x) => same(x, m)) || m);
      const after = hanging(c, me);
      if (pre.some((x) => x.sq === m.from) && !after.some((x) => x.sq === m.to)) return `moving the ${ph.piece} out of danger`;
      const saved = pre.find((x) => x.sq !== m.from && !after.some((y) => y.sq === x.sq));
      if (saved) return `defending the ${saved.name} on ${nm(saved.sq)} that was under attack`;
      const hits = hanging(c, foe).filter((x) => attackers(c.board, x.sq, me).indexOf(m.to) >= 0);
      if (ph.check) return hits.length ? `giving check and attacking the ${hits[0].name} on ${nm(hits[0].sq)}` : 'giving check';
      if (hits.length) return `attacking the ${hits[0].name} on ${nm(hits[0].sq)}`;
      if (g.fullmove <= 12 && (typ(g.board[m.from]) === 2 || typ(g.board[m.from]) === 3) && (m.from >> 4) === (me === WH ? 0 : 7)) return 'developing a piece';
      if (g.fullmove <= 10 && typ(g.board[m.from]) === 1 && ((m.to & 7) === 3 || (m.to & 7) === 4)) return 'taking space in the centre';
    } catch (e) { /* no reason found */ }
    return '';
  }

  const betterLine = (g, best, vc) => {
    if (!best) return '';
    const ph = phrase(g, best), w = why(g, best);
    return ` A better move was to ${ph.inf}${w ? ', ' + w : ''}.`;
  };

  /** 'back-rank checkmate', 'smothered checkmate' or '' for the mating step `st` against colour `victim`. */
  function mateKind(st, victim) {
    try {
      const c = st.post, ks = c.kingSquare(victim);
      if (ks < 0) return '';
      const t = typ(c.board[st.m.to]);
      const home = victim === WH ? 0 : 7, fw = victim === WH ? 16 : -16;
      if ((ks >> 4) === home && (t === 4 || t === 5) && (st.m.to >> 4) === (ks >> 4)) {
        let boxed = true;
        for (const d of [-1, 0, 1]) { const q = ks + fw + d; if (on(q) && !(c.board[q] && col(c.board[q]) === victim)) boxed = false; }
        if (boxed) return 'a back-rank checkmate';
      }
      if (t === 2) {
        let all = true;
        for (const d of KG) { const q = ks + d; if (on(q) && !(c.board[q] && col(c.board[q]) === victim)) all = false; }
        if (all) return 'a smothered checkmate';
      }
    } catch (e) { /* unknown */ }
    return '';
  }

  /* ------------------------------------------------------------------ what went wrong */
  /**
   * ctx = { g: position before the move, mv: the move played, p: stored analysis of it { b, bs, ps, ref, bl }, vc: voice, lead }
   * Returns { k, t, sq: [0-63], thr: { a, b } | null, bs: words for the better move }.
   */
  function mistake(ctx) {
    const { g, mv, p, vc } = ctx;
    const lead = ctx.lead || 'Mistake.';
    const me = g.turn, foe = foeOf(me);
    const S = vc.S, O = vc.opp;
    const c0 = MR.clone(g);
    const played = phrase(c0, mv);
    const best = p.b ? c0.legalMoves().find((x) => x.from === p.b.f && x.to === p.b.t && (x.promo || 0) === (p.b.p || 0) && (x.q || 0) === (p.b.q || 0)) : null;
    const bestPh = best ? phrase(c0, best) : null;
    const out = { k: 'generic', t: '', sq: best ? [idx(best.from), idx(best.to)] : [], thr: null, bs: bestPh ? bestPh.inf : '' };
    const B = p.bs, P = p.ps;
    const keys = p.ref && p.ref.length ? p.ref : [[mv.from, mv.to, mv.promo || 0, mv.q || 0]];
    const steps = walk(g, keys);
    const better = () => betterLine(g, best, vc);
    const sw = () => (Math.abs(B) < MATE - 100 && Math.abs(P) < MATE - 100 ? swing(vc, B, P) : '');
    /* out.q = what went wrong (shown while the player tries to find the fix); out.t = the same plus the better move */
    const fin = (body, tail) => { out.q = body + sw(); out.t = out.q + (tail === undefined ? better() : tail); return out; };

    /* a forced checkmate was available */
    if (B > MATE - 100 && P <= MATE - 100) {
      const n = Math.max(1, Math.ceil((MATE - B) / 2));
      out.k = 'win'; out.n = n;
      out.q = `${lead} ${S} had a forced checkmate in ${plural(n, 'move')}. ${S} ${played.past} instead.`;
      out.t = out.q + ` The way to start it was to ${bestPh ? bestPh.inf : 'look for forcing moves'}.`;
      return out;
    }
    /* the move walked into a forced checkmate */
    if (P < -MATE + 100 && B > -MATE + 100) {
      const n = Math.max(1, Math.ceil((MATE + P) / 2));
      out.k = 'mated'; out.n = n;
      const r1 = steps[1];
      if (n === 1 && r1 && r1.mate) {
        const kind = mateKind(r1, me) || 'checkmate';
        out.thr = { a: idx(r1.m.from), b: idx(r1.m.to) };
        return fin(`${lead} ${S} ${played.past}, which allowed ${kind} in one move: ${O} could ${r1.ph.inf}.`);
      }
      if (r1) out.thr = { a: idx(r1.m.from), b: idx(r1.m.to) };
      return fin(`${lead} ${S} ${played.past}, which allowed a forced checkmate in ${plural(n, 'move')}${r1 ? ' (it starts with ' + O + ' ' + r1.ph.ger + ')' : ''}.`);
    }

    const post0 = steps[0] && steps[0].post ? steps[0].post : null;
    const r1 = steps[1], r3 = steps[3];
    const preThreats = hanging(g, me);

    try {
      /* the opponent wins something right away */
      if (post0 && r1 && r1.color === foe && r1.victim) {
        const t = r1.m.to;
        const vsq = r1.m.flags === 2 ? t + (foe === WH ? -16 : 16) : t;
        const gain = see(post0.board, r1.m.from, t, r1.m.flags === 2);
        const free = gain >= r1.victimVal;
        const vname = r1.victim;
        const movedPiece = t === mv.to;
        const wasThreatened = preThreats.some((x) => x.sq === vsq);
        let reason = '';
        if (movedPiece) {
          reason = `${S} ${played.past}, where ${poss(vc)} ${vname} can be taken${free ? ' for free' : ` by ${O}'s ${r1.piece} in a trade that costs ${vc.me ? 'you' : 'them'} material`}.`;
        } else if (wasThreatened) {
          reason = `${S} ${played.past}, but that ignored a threat: ${O}'s ${r1.piece} was already attacking ${poss(vc)} ${vname} on ${nm(vsq)}${free ? ', and it was not protected well enough' : ''}.`;
        } else {
          const before = attackers(g.board, vsq, me), after = attackers(post0.board, vsq, me);
          const pulled = before.indexOf(mv.from) >= 0 && after.length < before.length;
          const between = (a, b) => {
            const fd = (b & 7) - (a & 7), rd = (b >> 4) - (a >> 4), arr = [];
            if (!(fd === 0 || rd === 0 || Math.abs(fd) === Math.abs(rd)) || typ(g.board[a]) === 2) return arr;
            const d = Math.sign(rd) * 16 + Math.sign(fd);
            for (let q = a + d; on(q) && q !== b; q += d) arr.push(q);
            return arr;
          };
          const opened = between(r1.m.from, t).indexOf(mv.from) >= 0;
          if (opened) reason = `${S} ${played.past}, which opened a line for ${O}'s ${r1.piece} to attack ${poss(vc)} ${vname} on ${nm(vsq)}.`;
          else if (pulled) reason = `${S} ${played.past}, but that piece was protecting ${poss(vc)} ${vname} on ${nm(vsq)}, so ${O} could take it${free ? ' for free' : ''}.`;
          else reason = `${S} ${played.past}, which left ${poss(vc)} ${vname} on ${nm(vsq)} ${attackers(post0.board, vsq, me).length ? 'without enough protection' : 'unprotected'}: ${O} could ${r1.ph.inf}.`;
        }
        out.k = 'hang'; out.sq = [idx(vsq)]; out.thr = { a: idx(r1.m.from), b: idx(t) };
        return fin(`${lead} ${reason}`);
      }
      /* the opponent's reply is a quiet move that wins something by force: fork, pin, new threat */
      if (post0 && r1 && r1.color === foe && !r1.victim) {
        const c2 = r1.post;
        const fork = forkInfo(c2, r1.m.to, me);
        const winsLater = (r3 && r3.color === foe && r3.victim) || B - P >= 150;
        if (fork && winsLater) {
          out.k = 'fork'; out.sq = [idx(r1.m.to)]; out.thr = { a: idx(r1.m.from), b: idx(r1.m.to) };
          return fin(`${lead} ${S} ${played.past}, which allowed a fork: ${O} could ${r1.ph.inf} and attack ${poss(vc)} ${listOf(fork.targets.map((x) => x.name))} at the same time.`);
        }
        const was = pinsOf(post0, me), now = pinsOf(c2, me);
        const np = now.find((x) => !was.some((y) => y.s === x.s && y.x === x.x && y.z === x.z));
        if (np && winsLater) {
          out.k = 'pin'; out.sq = [idx(np.x)]; out.thr = { a: idx(np.s), b: idx(np.x) };
          const xn = pname(c2, np.x), zn = pname(c2, np.z);
          return fin(`${lead} ${S} ${played.past}, which allowed ${O} to ${np.kind === 'pin' ? 'pin' : 'skewer'} ${poss(vc)} ${xn} against ${poss(vc)} ${zn}.`);
        }
        const hMid = hanging(post0, me), hNow = hanging(c2, me);
        const nt = hNow.find((x) => !hMid.some((y) => y.sq === x.sq && y.gain >= x.gain));
        if (nt && winsLater) {
          out.k = 'threat'; out.sq = [idx(nt.sq)]; out.thr = { a: idx(nt.from), b: idx(nt.sq) };
          return fin(`${lead} ${S} ${played.past}, which let ${O} ${r1.ph.inf} and threaten ${poss(vc)} ${nt.name} on ${nm(nt.sq)}, and it cannot be saved without losing something.`);
        }
        if (r3 && r3.color === foe && r3.victim) {
          out.k = 'hang'; out.sq = [idx(r3.m.to)]; out.thr = { a: idx(r1.m.from), b: idx(r1.m.to) };
          return fin(`${lead} ${S} ${played.past}, and after ${O} ${r1.ph.ger}, ${S} could not stop ${poss(vc)} ${r3.victim} on ${nm(r3.m.to)} from being lost.`);
        }
      }
    } catch (e) { /* fall through to the missed-chance checks */ }

    /* the opponent has nothing, but a better move was there */
    try {
      if (best) {
        const bsteps = walk(g, p.bl && p.bl.length ? p.bl : [[best.from, best.to, best.promo || 0, best.q || 0]]);
        const b0 = bsteps[0];
        if (b0 && b0.victim && best.to !== mv.to) {
          const gain = see(g.board, best.from, best.to, best.flags === 2);
          if (gain >= 1) {
            out.k = 'miss'; out.sq = [idx(best.from), idx(best.to)];
            return fin(`${lead} ${S} ${played.past}, but missed a chance to win ${withArticle(b0.victim)}${gain >= b0.victimVal ? ' for free' : ''}.`, ` ${S} could ${bestPh.inf}.`);
          }
        }
        if (b0 && b0.post) {
          const fk = forkInfo(b0.post, best.to, foe);
          if (fk) {
            out.k = 'miss'; out.sq = [idx(best.from), idx(best.to)];
            return fin(`${lead} ${S} ${played.past}, but missed a fork.`, ` ${S} could ${bestPh.inf} and attack ${O}'s ${listOf(fk.targets.map((x) => x.name))} at the same time.`);
          }
        }
        let net = 0;
        bsteps.slice(0, 4).forEach((st, i) => { if (st.victim) net += (i % 2 === 0 ? 1 : -1) * st.victimVal; });
        if (net >= 2) {
          const first = bsteps.find((st, i) => i % 2 === 0 && st.victim);
          out.k = 'miss'; out.sq = [idx(best.from), idx(best.to)];
          return fin(`${lead} ${S} ${played.past}, but there was a way to win material.`, ` ${S} could ${bestPh.inf}${first && first !== b0 ? ', and a few moves later take the ' + first.victim : ''}.`);
        }
        if (preThreats.length && !preThreats.some((x) => x.sq === mv.to)) {
          const th = preThreats[0];
          const addressed = (() => { try { const cc = MR.clone(g); cc.makeMove(cc.legalMoves().find((x) => same(x, best))); return !hanging(cc, me).some((x) => x.sq === th.sq); } catch (e) { return false; } })();
          if (addressed) {
            out.k = 'hang'; out.sq = [idx(th.sq)]; out.thr = { a: idx(th.from), b: idx(th.sq) };
            return fin(`${lead} ${S} ${played.past}, but ${poss(vc)} ${th.name} on ${nm(th.sq)} was under attack and still needed to be dealt with.`);
          }
        }
      }
    } catch (e) { /* generic text below */ }

    /* positional */
    const early = g.fullmove <= 10;
    const pt = typ(g.board[mv.from]);
    let because = '';
    if (early && pt === 5 && !played.victim) because = ` Bringing the queen out this early lets ${O} attack it and gain time.`;
    else if (early && (pt === 4 || pt === 6) && !(mv.flags === 4 || mv.flags === 8)) because = ` Early on it is usually better to develop knights and bishops and castle first.`;
    else if (pt === 6 && !(mv.flags === 4 || mv.flags === 8)) because = ` Moving the king by hand gives up the right to castle and can leave it exposed.`;
    return fin(`${lead} ${S} ${played.past}, but there was something stronger.${because}`);
  }
  const poss = (vc) => vc.poss;

  /* ------------------------------------------------------------------ what was good */
  function praise(ctx, rid) {
    const { g, mv, p, vc } = ctx;
    const S = vc.S;
    const ph = phrase(MR.clone(g), mv);
    let w = '';
    try { w = why(g, mv); } catch (e) { w = ''; }
    const body = `${S} ${ph.past}${w ? ', ' + w : ''}`;
    const f = p.facts || {};
    const sac = f.afterQs !== undefined && f.before !== undefined && f.afterQs <= f.before - 150;
    const bestAlt = p.b && !(p.b.f === mv.from && p.b.t === mv.to);
    const out = { k: 'praise', t: '', sq: [idx(mv.to)], thr: null, bs: ph.inf };
    switch (rid) {
      case 'brilliant': out.t = sac ? `Brilliant! ${body}. It gives up material on purpose and is still the best move, which is very hard to spot.` : `Brilliant! ${body}. It is a standout move that most players would miss.`; break;
      case 'great': out.t = `Great move! ${body}. It was the one move that kept ${vc.poss} advantage.`; break;
      case 'best': out.t = `${body}. That was the best move in this position.`; break;
      case 'good': out.t = `A good move. ${body}, which keeps things safe and solid.`; break;
      case 'interesting': out.t = `Interesting! ${body}. It takes a risk and it holds up.`; break;
      case 'novelty': out.t = `A novelty: ${body}. It leaves known opening theory and is still a sound move.`; break;
      case 'matewhite': case 'mateblack': out.t = `Checkmate! ${body}. That finishes the game.`; break;
      case 'book': out.k = 'book'; out.t = `${body}. It follows known opening theory.`; break;
      default: out.t = `${body}.`;
    }
    out.q = out.t;
    return out;
  }

  root.Explain = { mistake, praise, phrase, walk, why, hanging, see, attackers, forkInfo, pinsOf, evalWord, swing, mateKind, betterLine, pname, nm, idx, plural };
})();
