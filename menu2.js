/**
 * The v2.0 main menu: left sidebar, top bar, Home (Continue Playing + Game History), the Classic screen with its Play popup,
 * and the Discussion tabs (Feedback / Global Chat). The cards inside each section are the same buttons as before.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = LP.esc;
  const TKEY = 'localPieces.m2time';
  const menu = $('#menu');
  if (!menu) return;

  /* ------------------------------------------------------------------ sections */
  let cur = 'home';
  function setPane(p) {
    if (p === 'discussion') { LP.showPage('suggest'); return; }
    if (p === 'mistakes') { if (LP.mistakes) LP.mistakes.open(); return; }
    if (p === 'learn') { if (LP.learn) LP.learn.open(); return; }
    if (!$('.m2-pane[data-pane="' + p + '"]')) p = 'home';
    cur = p;
    $$('.m2-pane').forEach((x) => x.classList.toggle('on', x.dataset.pane === p));
    $$('.m2-si').forEach((x) => x.classList.toggle('on', x.dataset.p === p));
    if (p === 'home') renderHome(true);
    const main = $('.m2-main');
    if (main) main.scrollTop = 0;
  }
  $$('.m2-si').forEach((b) => b.addEventListener('click', () => setPane(b.dataset.p)));
  LP.menuPane = setPane;
  LP.menuOpenAll = () => {};

  /* ------------------------------------------------------------------ Classic: time type + Play */
  const TIMES = [
    { id: 'untimed', nm: 'Untimed', m: 'basic', tc: null, d: 'No clock. Take as long as you like.' },
    { id: 'sb', nm: 'Super Bullet (10.1s + 0.1s)', m: 'bullet', tc: { base: 10.1, inc: 0.1 }, d: 'Each side gets 10.1 seconds and 0.1 seconds back every move. Shares the Bullet rating.' },
    { id: 'b1', nm: 'Bullet · 1 minute', m: 'bullet', tc: { base: 60, inc: 0 }, d: 'Each side gets 1 minute. No extra time.' },
    { id: 'r5', nm: 'Rapid · 5 minutes + 2', m: 'rapid', tc: { base: 300, inc: 2 }, d: 'Each side gets 5 minutes and 2 seconds back every move.' },
    { id: 'r10', nm: 'Rapid · 10 minutes + 2', m: 'rapid', tc: { base: 600, inc: 2 }, d: 'Each side gets 10 minutes and 2 seconds back every move.' },
  ];
  const lastTime = () => { try { return localStorage.getItem(TKEY) || 'untimed'; } catch (e) { return 'untimed'; } };
  const pickTime = () => TIMES.find((t) => t.id === ($('#m2-time') || {}).value) || TIMES[0];
  function buildClassic() {
    const sel = $('#m2-time');
    if (!sel) return;
    sel.innerHTML = TIMES.map((t) => `<option value="${t.id}">${esc(t.nm)}</option>`).join('');
    sel.value = lastTime();
    const note = () => { $('#m2-tnote').textContent = pickTime().d; };
    sel.addEventListener('change', () => { try { localStorage.setItem(TKEY, sel.value); } catch (e) { /* ignore */ } note(); });
    note();
    $('#m2-playbtn').addEventListener('click', playPopup);
  }
  function playPopup() {
    const t = pickTime();
    LP.openSheet(`<h2>Play<span class="sub">${esc(t.nm)}</span></h2>
      <div class="stack">
        <button class="btn big m2-pl m2-pl-local" id="m2-p-local"><b>Local</b><small>Two players on this device.</small></button>
        <button class="btn big m2-pl m2-pl-online" id="m2-p-online"><b>Online</b><small>Create, join or find a game against a real player.</small></button>
        <button class="btn big m2-pl m2-pl-bot" id="m2-p-bot"><b>Bot</b><small>Play the computer, from Dumb up to Stockfish.</small></button>
        <button class="btn" id="m2-p-x">Cancel</button>
      </div>`, true);
    $('#m2-p-x').onclick = LP.closeSheet;
    $('#m2-p-local').onclick = () => { LP.closeSheet(); if (LP.classicPlay) LP.classicPlay('local', t.m, t.tc); };
    $('#m2-p-bot').onclick = () => { if (LP.classicPlay) LP.classicPlay('bot', t.m, t.tc); };
    $('#m2-p-online').onclick = () => { if (LP.onlinePlay) LP.onlinePlay(t.tc); };
  }

  /* ------------------------------------------------------------------ Home: Continue Playing */
  const iconOf = (key) => {
    const c = $('.mode[data-mode="' + key + '"]');
    const ic = c && $('.mode-ic', c);
    return { svg: ic ? ic.innerHTML : '', col: c ? (c.style.getPropertyValue('--accent') || '#8fc15b') : '#8fc15b' };
  };
  const ICON_KEY = { basic: 'basic', bullet: 'bullet', rapid: 'rapid', secret: 'secret', snail: 'snail', gamble: 'gamble', guess: 'guess', royale: 'royale', rush: 'rush', hockey: 'hockey', tas: 'tas', puzzle: 'puzzle', c960: 'custom', '3check': 'custom', koth: 'custom', atomic: 'custom', horde: 'custom', racing: 'custom', fen: 'custom' };
  const ago = (t) => (LP.saves ? LP.saves.ago(t) : '');

  function contHtml() {
    const list = LP.session ? LP.session.all() : [];
    const max = LP.session ? LP.session.MAX : 5;
    const sv = LP.saves;
    let h = `<div class="m2-sh"><h3>Continue Playing <b>${list.length}/${max}</b></h3>${list.length ? '<button class="m2-link" id="m2-manage" type="button">Manage</button>' : ''}</div>`;
    if (!list.length || !sv) return h + '<p class="m2-empty">No games in progress. Start one from Classic.</p>';
    h += '<div class="m2-cbox"><div class="m2-cards">' + list.map((s) => {
      const prog = sv.progress(s);
      const turn = prog.split(' \u00b7 ').slice(1).join(' \u00b7 ') || prog;
      const moves = prog.split(' \u00b7 ')[0];
      const k = ICON_KEY[s.kind === 'chess' ? (s.mode || 'basic') : s.kind] || 'basic';
      const ic = iconOf(k);
      return `<button class="m2-cc" type="button" data-id="${esc(s.id)}">
        <span class="m2-cth">${sv.mini(s) || '<i class="m2-nopic"></i>'}</span>
        <span class="m2-ci"><span class="m2-cm"><svg class="mi" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg><b>${esc(sv.modeOf(s))}</b></span>
          <span class="m2-turn"><i class="m2-tdot"></i>${esc(turn)}</span><span class="m2-pl">${esc(sv.who(s))}</span><small>${esc(moves)} \u00b7 ${esc(ago(s.date))}</small></span>
        <span class="m2-go">Resume</span>
      </button>`;
    }).join('') + '</div></div>';
    return h;
  }

  /* ------------------------------------------------------------------ Home: Game History */
  function acc(e, side) {
    try {
      if (!side || !LP.store) return null;
      const x = LP.store.get().find((z) => z && z.id === e.id);
      const an = x && x.an;
      if (!an || !an.done || !an.sum || !an.sum[side] || !an.sum[side].n) return null;
      return an.sum[side].acc;
    } catch (err) { return null; }
  }
  function histRow(e) {
    const p = e.payload || {};
    const me = e.human || p.human || (p.onl && p.onl.me) || null;
    const n = e.names || {};
    let opp;
    if (e.bots) opp = '<span class="m2-on"><b>Bots</b></span>';
    else if (e.level) {
      const el = LP.profile && LP.profile.botRating ? LP.profile.botRating(e.level) : null;
      opp = `<b>Bot · ${esc((LP.LEVEL_LABEL && LP.LEVEL_LABEL[e.level]) || e.level)}</b>${el ? ' <i>(' + el + ')</i>' : ''}`;
    } else if (p.onl) {
      const oc = p.onl.me === 'w' ? 'b' : 'w';
      opp = `<span class="m2-on"><b>${esc(n[oc] || 'Player')}</b>${p.onl.oe ? ' <i>(' + p.onl.oe + ')</i>' : ''}</span>`;
    } else if (e.kind === 'chess') opp = `<span class="m2-on"><b>${esc((n.w || 'White') + ' vs ' + (n.b || 'Black'))}</b></span>`;
    else opp = `<span class="m2-on"><b>${esc(e.modeLabel || e.mode || 'Match')}</b></span>`;
    let res = '', rc = 'n';
    if (me) {
      if (e.winner === me) { res = 'W'; rc = 'w'; } else if (e.winner) { res = 'L'; rc = 'l'; } else { res = 'D'; rc = 'd'; }
    }
    const ic = iconOf(ICON_KEY[e.mode] || ICON_KEY[p.mode2] || (e.kind === 'rush' ? 'rush' : e.kind === 'hockey' ? 'hockey' : 'basic'));
    return { id: e.id, ic, opp, res, rc, a: acc(e, me), label: e.modeLabel || e.mode || '', date: e.date };
  }
  function histHtml() {
    const all = LP.history ? LP.history.list() : [];
    let h = `<div class="m2-sh"><h3>Game History</h3>${all.length > 8 ? '<button class="m2-link" id="m2-allh" type="button">See all</button>' : ''}</div>`;
    if (!all.length) return h + '<p class="m2-empty">Finished matches show up here, with replays.</p>';
    const rows = all.slice(0, 8).map(histRow);
    const showAcc = rows.some((r) => r.a != null);
    h += '<div class="m2-hist">' + rows.map((r) => `<button class="m2-hr${showAcc ? ' acc' : ''}" type="button" data-id="${esc(r.id)}" style="--accent:${esc(r.ic.col)}">
      <span class="m2-hi"><svg class="mi" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${r.ic.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg></span>
      <span class="m2-ho">${r.opp}<small>${esc(r.label)} · ${esc(ago(r.date))}</small></span>
      ${showAcc ? `<span class="m2-ha">${r.a != null ? r.a + '%' : ''}</span>` : ''}
      <span class="m2-hres ${r.rc}">${r.res || '–'}</span></button>`).join('') + '</div>';
    return h;
  }

  let sig = '';
  function renderHome(force) {
    const c = $('#m2-cont'), hh = $('#m2-hist');
    if (!c || !hh) return;
    const list = LP.session ? LP.session.all() : [];
    const hs = LP.history ? LP.history.list() : [];
    const s = list.map((x) => x.id + x.date).join(',') + '|' + hs.slice(0, 8).map((x) => x.id).join(',') + '|' + hs.length;
    if (!force && s === sig) return;
    sig = s;
    c.innerHTML = contHtml();
    hh.innerHTML = histHtml();
    $$('.m2-cc', c).forEach((b) => b.addEventListener('click', () => { const x = LP.session.find(b.dataset.id); if (x) LP.saves.resume(x); }));
    const mg = $('#m2-manage'); if (mg) mg.addEventListener('click', () => LP.saves.open());
    $$('.m2-hr', hh).forEach((b) => b.addEventListener('click', () => { if (LP.history) LP.history.watch(b.dataset.id); }));
    const al = $('#m2-allh'); if (al) al.addEventListener('click', () => LP.history.show());
  }
  new MutationObserver(() => { if (menu.classList.contains('active')) renderHome(true); }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (menu.classList.contains('active') && cur === 'home' && !document.hidden) renderHome(false); }, 1500);
  LP.menuHome = () => renderHome(true);

  /* ------------------------------------------------------------------ Discussion: Feedback / Global Chat tabs */
  LP.discussionTabs = (page, active) => {
    const head = $('.game-header', page);
    if (!head || $('.dc-tabs', page)) return;
    const bar = document.createElement('div');
    bar.className = 'dc-tabs seg';
    bar.innerHTML = `<button type="button" data-t="feedback" class="lb-chip${active === 'feedback' ? ' on' : ''}">Feedback</button><button type="button" data-t="chat" class="lb-chip${active === 'chat' ? ' on' : ''}">Global Chat</button>`;
    head.after(bar);
    $('[data-t="feedback"]', bar).onclick = () => { if (active !== 'feedback') LP.showPage('suggest'); };
    $('[data-t="chat"]', bar).onclick = () => { if (active !== 'chat') { const c = $('.mode[data-mode="gchat"]'); if (c) c.click(); } };
  };
  const sg = $('#suggest');
  if (sg) LP.discussionTabs(sg, 'feedback');

  buildClassic();
  renderHome(true);
})();
