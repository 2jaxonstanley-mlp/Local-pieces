/**
 * Two small extras:
 *   - the update log ("What's new" button on the menu): newest first, each entry has a date and short bullet points
 *   - a bar at the bottom of the screen when the internet disconnects: "Internet disconnected. Retrying in 5s"
 * To add an update, put a new entry at the TOP of LOG below.
 */
(() => {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const esc = LP.esc;

  /* ------------------------------------------------------------------ update log */
  const LOG = (LP.UPDATES && LP.UPDATES.log) || [];
  const SEEN = 'localPieces.logSeen';
  const seen = () => { try { return localStorage.getItem(SEEN) || ''; } catch (e) { return ''; } };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = (d) => { const p = d.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; };
  const monthOf = (d) => { const p = d.split('-'); return LONG[+p[1] - 1] + ' ' + p[0]; };

  /* ---- tags: each point gets a kind (New, Fix, Removed) and areas (Bots, Analyze...), from its first words or from "fix: " style prefixes */
  const AREAS = [
    ['Bots', /\b(bot|bots|computer|computers|insane|godly|patricia|brilliant|stockfish|copycat|engine)\b/i],
    ['Analyze', /\b(analy[sz]|rating|ratings|eval bar|graph|position editor|import)/i],
    ['Puzzles', /\b(puzzle|puzzles|rush|battle|capture rush|solo)\b/i],
    ['Hockey', /\bhockey\b/i],
    ['Shop', /\b(shop|board|boards|piece set|hat|accessor|token|stickman|bunny)/i],
    ['Online', /\b(online|global|leaderboard|friend|spectat)/i],
    ['Settings', /\b(settings|accessib|vibration)/i],
  ];
  function tagItem(raw) {
    let text = String(raw), kind = '';
    const m = /^(new|fix|removed|change):\s*/i.exec(text);
    if (m) { kind = m[1].toLowerCase(); text = text.slice(m[0].length); }
    else if (/^(new|added|add)\b/i.test(text)) kind = 'new';
    else if (/^fix/i.test(text)) kind = 'fix';
    else if (/^remov/i.test(text)) kind = 'removed';
    const areas = AREAS.filter((x) => x[1].test(text)).map((x) => x[0]).slice(0, 2);
    return { text, kind, areas };
  }
  const KIND = { new: 'New', fix: 'Fix', removed: 'Removed' };
  const FILTERS = [['all', 'All'], ['new', 'New'], ['fix', 'Fixes']].concat(AREAS.map((x) => [x[0], x[0]]));
  const SHOW = 5;
  const GO = {
    analyze: () => LP.analyze && LP.analyze.show && LP.analyze.show(),
    lesson: () => LP.lesson && LP.lesson.start(),
    settings: () => LP.openSettings && LP.openSettings(),
  };

  function paintDot() {
    const b = $('#news-btn');
    if (b) b.classList.toggle('unread', !!LOG.length && seen() !== LOG[0].id);
  }
  /** How many entries at the top of the log have not been opened yet. */
  function unreadCount() {
    const i = LOG.findIndex((u) => u.id === seen());
    return i < 0 ? Math.min(1, LOG.length) : i;
  }
  const markSeen = () => { try { localStorage.setItem(SEEN, LOG[0].id); } catch (e) { /* ignore */ } paintDot(); };

  function openLog() {
    const n = unreadCount();
    markSeen();
    // the very first update's title hides a secret: its first and last letters are buttons (see mods.js)
    const keyed = (t) => { const a = Array.from(t); return a.length < 2 ? esc(t) : `<span class="log-k" data-k="0">${esc(a[0])}</span>${esc(a.slice(1, -1).join(''))}<span class="log-k" data-k="1">${esc(a[a.length - 1])}</span>`; };
    const tagged = LOG.map((u) => u.items.map(tagItem));
    const entry = (u, i) => {
      const items = tagged[i];
      const li = (t, k) => `<li class="log-li${k >= SHOW ? ' more hidden' : ''}" data-kind="${t.kind}" data-areas="${t.areas.join(',')}">${t.kind ? `<span class="tg tg-${t.kind}">${KIND[t.kind]}</span>` : ''}${t.areas.map((a) => `<span class="tg">${a}</span>`).join('')}<span class="lt">${esc(t.text)}</span></li>`;
      const head = `${u.img ? `<img class="log-img" src="${esc(u.img)}" alt="" onerror="this.remove()">` : ''}<span class="log-tt"><b>${i === LOG.length - 1 ? keyed(u.title) : esc(u.title)}</b><time datetime="${u.date}">${fmtDate(u.date)}${i < n ? ' <span class="tg tg-new">NEW</span>' : ''}</time></span>`;
      const body = `<ul>${items.map((t, k) => li(t, k)).join('')}</ul>${items.length > SHOW ? `<button type="button" class="log-more">Show ${items.length - SHOW} more</button>` : ''}` +
        (u.try && u.try.length ? `<div class="log-try">${u.try.map((t) => `<button type="button" class="btn" data-go="${esc(t.go)}">Try it: ${esc(t.t)}</button>`).join('')}</div>` : '');
      return i < 3 || i < n
        ? `<section class="log-entry${i < n ? ' new' : ''}" data-i="${i}"><div class="log-head">${head}</div>${body}</section>`
        : `<details class="log-entry log-old" data-i="${i}"><summary class="log-head">${head}</summary>${body}</details>`;
    };
    let month = '', html = '';
    LOG.forEach((u, i) => {
      const m = monthOf(u.date);
      if (m !== month) { month = m; html += `<div class="log-month" data-m="${m}">${m}</div>`; }
      html += entry(u, i);
    });
    const soon = (LP.UPDATES && LP.UPDATES.soon) || [];
    LP.openSheet(`<h2>Update log<span class="sub">What changed, newest first.</span></h2>
      <input type="search" id="log-q" class="text-in set-search" placeholder="Search the update log" autocomplete="off">
      <div class="seg log-filters" id="log-f">${FILTERS.map((f, i) => `<button type="button" data-f="${f[0]}"${i ? '' : ' class="on"'}>${f[1]}</button>`).join('')}</div>
      <div class="log-list" id="log-list">${n ? '<div class="log-new-h">WHATS NEW!</div>' : ''}${soon.length ? `<details class="log-soon"><summary>Coming soon</summary><ul>${soon.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}${html}<p class="note hidden" id="log-none">Nothing matches.</p></div>
      <button class="btn wide" id="log-x">Close</button>`, true);
    $('#log-x').onclick = LP.closeSheet;
    // filter + search
    let f = 'all';
    const apply = () => {
      const q = ($('#log-q').value || '').trim().toLowerCase(), active = f !== 'all' || !!q;
      let any = false;
      document.querySelectorAll('#log-list .log-entry').forEach((en) => {
        let vis = 0;
        en.querySelectorAll('.log-li').forEach((li) => {
          const okF = f === 'all' || (f === 'new' && li.dataset.kind === 'new') || (f === 'fix' && li.dataset.kind === 'fix') || li.dataset.areas.split(',').includes(f);
          const okQ = !q || li.textContent.toLowerCase().includes(q) || (en.querySelector('.log-tt b').textContent.toLowerCase().includes(q));
          const hit = okF && okQ;
          li.classList.toggle('nomatch', !hit);
          if (hit) vis++;
        });
        en.classList.toggle('hidden', !vis);
        if (active) { en.querySelectorAll('.log-li.more').forEach((li) => li.classList.remove('hidden')); const mb = en.querySelector('.log-more'); if (mb) mb.classList.add('hidden'); if (en.tagName === 'DETAILS' && vis) en.open = true; }
        else { en.querySelectorAll('.log-li.more').forEach((li) => li.classList.add('hidden')); const mb = en.querySelector('.log-more'); if (mb) { mb.classList.remove('hidden'); mb.textContent = 'Show ' + en.querySelectorAll('.log-li.more').length + ' more'; } if (en.tagName === 'DETAILS') en.open = false; }
        if (vis) any = true;
      });
      document.querySelectorAll('#log-list .log-month').forEach((mh) => {
        let el = mh.nextElementSibling, shown = false;
        while (el && !el.classList.contains('log-month')) { if (el.classList.contains('log-entry') && !el.classList.contains('hidden')) shown = true; el = el.nextElementSibling; }
        mh.classList.toggle('hidden', !shown);
      });
      const ns = $('#log-none'); if (ns) ns.classList.toggle('hidden', any);
      const so = document.querySelector('.log-soon'); if (so) so.classList.toggle('hidden', active);
    };
    $('#log-q').oninput = apply;
    document.querySelectorAll('#log-f button').forEach((b) => { b.onclick = () => { f = b.dataset.f; document.querySelectorAll('#log-f button').forEach((x) => x.classList.toggle('on', x === b)); apply(); }; });
    document.querySelectorAll('.log-more').forEach((b) => { b.onclick = (e) => { e.preventDefault(); const en = b.closest('.log-entry'); en.querySelectorAll('.log-li.more').forEach((li) => li.classList.remove('hidden')); b.remove(); }; });
    document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { const fn = GO[b.dataset.go]; LP.closeSheet(); if (fn) setTimeout(fn, 120); }; });
    const got = [0, 0];
    document.querySelectorAll('.log-k').forEach((el) => {
      el.addEventListener('click', () => {
        const k = +el.dataset.k, now = Date.now();
        got[k] = now;
        if (now - got[1 - k] < 6000 && LP.mods) { got[0] = got[1] = 0; LP.mods.open(); }
      });
    });
  }
  const nb = $('#news-btn');
  if (nb) nb.addEventListener('click', openLog);
  paintDot();
  LP.updateLog = { open: openLog, entries: LOG };

  /* ---- the "What's new" card: shown once, the first time the game is opened after an update (not for brand new players) */
  function popup() {
    try {
      if (!LOG.length || !localStorage.getItem(SEEN) || seen() === LOG[0].id) return;
      if (LP.prefs && LP.prefs.get('newsPopup') === false) return;
      if (document.body.classList.contains('tut-open') || ($('#sheet-bg') && !$('#sheet-bg').classList.contains('hidden'))) return;
    } catch (e) { return; }
    const u = LOG[0], items = u.items.map(tagItem).slice(0, 4);
    markSeen();
    LP.openSheet(`<h2>What's new<span class="sub">${esc(u.title)} · ${fmtDate(u.date)}</span></h2>
      <ul class="log-pop">${items.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul>
      <div class="row"><button class="btn" id="wn-x">Close</button><button class="btn primary" id="wn-all">See all updates</button></div>`, true);
    $('#wn-x').onclick = LP.closeSheet;
    $('#wn-all').onclick = () => { LP.closeSheet(); setTimeout(openLog, 120); };
  }
  setTimeout(popup, 1800);

  /* ------------------------------------------------------------------ connection bar */
  const bar = document.createElement('div');
  bar.id = 'netbar';
  bar.className = 'netbar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span class="nb-dot" aria-hidden="true"></span><span class="nb-text"></span><button class="nb-btn" type="button">Retry now</button>';
  document.body.appendChild(bar);
  const txt = bar.querySelector('.nb-text');
  const web = /^https?:/.test(location.protocol);
  let offline = false, timer = 0, secs = 0, tries = 0, hideT = 0, beat = 0;

  const show = (cls, text) => { clearTimeout(hideT); bar.className = 'netbar show ' + cls; txt.textContent = text; };
  const hide = () => { bar.className = 'netbar'; };
  function paint() { show('off', 'Internet disconnected. Retrying in ' + secs + 's'); }
  function schedule(n) {
    clearInterval(timer);
    secs = n;
    paint();
    timer = setInterval(() => { secs--; if (secs <= 0) { clearInterval(timer); probe(); } else paint(); }, 1000);
  }
  function goOffline() {
    if (offline) return;
    offline = true; tries = 0;
    schedule(5);
  }
  function goOnline() {
    if (!offline) return;
    offline = false; clearInterval(timer);
    show('on', 'Back online');
    hideT = setTimeout(hide, 2000);
  }
  /** Ask our own server for a tiny answer. Any answer at all (even an error page) means the network works. */
  function ping() {
    if (!web) return Promise.resolve(navigator.onLine !== false);
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(() => ctl && ctl.abort(), 6000);
    return fetch(location.pathname + '?ping=' + Date.now(), { method: 'HEAD', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(() => { clearTimeout(to); return true; }, () => { clearTimeout(to); return false; });
  }
  function probe() {
    clearInterval(timer);
    show('off', 'Internet disconnected. Reconnecting...');
    ping().then((ok) => {
      if (ok) goOnline();
      else { tries++; schedule(Math.min(30, 5 + tries * 5)); }
    });
  }
  bar.querySelector('.nb-btn').addEventListener('click', () => { if (offline) probe(); });
  window.addEventListener('offline', goOffline);
  window.addEventListener('online', () => { if (offline) probe(); });
  // some disconnects never raise an event (wifi with no internet), so check now and then
  clearInterval(beat);
  beat = setInterval(() => { if (!offline && !document.hidden) ping().then((ok) => { if (!ok) goOffline(); }); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !offline) ping().then((ok) => { if (!ok) goOffline(); }); });
  if (navigator.onLine === false) goOffline();
  LP.net = { simulateOffline: goOffline, isOffline: () => offline };
})();
