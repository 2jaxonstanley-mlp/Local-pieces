/**
 * One play popup for every game mode: Local / Online / Bot.
 *  - LP.play.popup({ title, sub, zero, local(), online(), bot(n) })  shows it. Bot asks "0 or 1 player" only when zero is true
 *    (modes that can have two computers play each other), otherwise it goes straight to choosing the computer. bot(n) gets 1 or 0.
 *  - Secret Queen, Immortal Snail, Gamblite, Guess Who, Chess Royale and Air Hockey open it from their Variants cards.
 *  - The old single "Custom" card is replaced by one card per Custom gamemode (Chess960, 3-Check, King of the Hill, Atomic, Horde,
 *    Racing Kings, Custom position). Their Online goes straight to Create / Join / Open games for that gamemode.
 *  - Online for Secret Queen, Immortal Snail, Gamblite, Guess Who, Chess Royale and Air Hockey is not built yet and says so.
 */
(() => {
  'use strict';
  const LP = (window.LP = window.LP || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** The Local / Online / Bot popup. */
  function popup(o) {
    const again = () => popup(o);
    LP.openSheet(`<h2>${esc(o.title)}${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}</h2>
      <div class="stack">
        <button class="btn big m2-pl m2-pl-local" id="pp-local"><b>Local</b><small>Two players on this device.</small></button>
        <button class="btn big m2-pl m2-pl-online" id="pp-online"><b>Online</b><small>Create, join or find a game against a real player.</small></button>
        <button class="btn big m2-pl m2-pl-bot" id="pp-bot"><b>Bot</b><small>Play the computer${o.zero ? ' or watch two computers' : ''}.</small></button>
        <button class="btn" id="pp-x">Cancel</button>
      </div>`, true);
    $('#pp-x').onclick = LP.closeSheet;
    $('#pp-local').onclick = () => o.local();
    $('#pp-online').onclick = () => o.online(again);
    $('#pp-bot').onclick = () => {
      if (!o.zero) { o.bot(1); return; }
      LP.openSheet(`<h2>Bot<span class="sub">How many players?</span></h2>
        <div class="stack">
          <button class="btn big" id="pb-1"><b>1 player</b><small>You against the computer.</small></button>
          <button class="btn big" id="pb-0"><b>0 players</b><small>Pick two computers and watch them play.</small></button>
          <div class="row"><button class="btn" id="pb-b">Back</button><button class="btn" id="pb-x">Cancel</button></div>
        </div>`, true);
      $('#pb-1').onclick = () => o.bot(1);
      $('#pb-0').onclick = () => o.bot(0);
      $('#pb-b').onclick = again;
      $('#pb-x').onclick = LP.closeSheet;
    };
  }
  /** Online is not built for this gamemode yet. */
  function soon(name, back) {
    LP.openSheet(`<h2>${esc(name)} online<span class="sub">Coming soon</span></h2>
      <p class="note">Playing ${esc(name)} against a real player online is not ready yet. Chess960, 3-Check, King of the Hill, Atomic, Horde, Racing Kings and Custom position already work online.</p>
      <div class="row"><button class="btn" id="so-b">Back</button><button class="btn primary" id="so-x">OK</button></div>`, true);
    $('#so-b').onclick = back;
    $('#so-x').onclick = LP.closeSheet;
  }

  /* ---------------------------------------------------------------- the chess variants with their own cards */
  const CHESS = { secret: 'Secret Queen', snail: 'Immortal Snail', gamble: 'Gamblite', guess: 'Guess Who', royale: 'Chess Royale' };
  function openChess(m) {
    const card = $('.mode[data-mode="' + m + '"] .mode-desc');
    popup({
      title: CHESS[m], sub: card ? card.textContent : '', zero: true,
      local: () => LP.variantPlay('local', m),
      bot: (n) => LP.variantPlay(n === 0 ? 'zero' : 'bot', m),
      online: (back) => soon(CHESS[m], back),
    });
  }
  function openHockey() {
    popup({
      title: 'Air Hockey', sub: 'Queens against queens, with a puck. First to 7.', zero: true,
      local: () => LP.hockeyStart(2),
      bot: (n) => LP.hockeyStart(n),
      online: (back) => soon('Air Hockey', back),
    });
  }
  /** A Custom gamemode: settings (if it has any) first, then the game starts. */
  function openVariant(vm) {
    const v = window.Chess.VARIANTS.find((x) => x[0] === vm);
    const again = () => openVariant(vm);
    const asParams = (go) => LP.variantParams(vm, go, again);
    popup({
      title: v[1], sub: v[2], zero: false,
      local: () => asParams((a, b) => { LP.closeSheet(); LP.customPlay('local', a, b); }),
      bot: () => asParams((a, b) => { LP.customPlay('bot', a, b); }),
      online: () => LP.onlineVariant(vm),
    });
  }

  /* ---------------------------------------------------------------- wire the cards */
  const ACCENT = { c960: '#e28fd6', '3check': '#f0a35e', koth: '#6fcf97', atomic: '#ef6a5a', horde: '#c9b458', racing: '#5ab0ff', fen: '#a8b0c0' };
  function cards() {
    const old = $('.mode[data-mode="custom"]');
    if (old && !old.dataset.split && window.Chess && window.Chess.VARIANTS) {
      old.dataset.split = '1';
      const ic = $('.mode-ic', old);
      window.Chess.VARIANTS.forEach((v) => {
        const b = document.createElement('button');
        b.className = 'mode'; b.type = 'button'; b.dataset.mode = 'v-' + v[0]; b.dataset.vm = v[0];
        b.style.setProperty('--accent', ACCENT[v[0]] || '#e28fd6');
        b.innerHTML = `<span class="mode-ic" aria-hidden="true">${ic ? ic.innerHTML : ''}</span><span class="mode-text"><span class="mode-name">${esc(v[1])}</span><span class="mode-desc">${esc(v[2])}</span></span><span class="mode-go" aria-hidden="true">&rsaquo;</span>`;
        old.parentNode.insertBefore(b, old);
      });
      old.style.display = 'none';   // kept (hidden) because Continue Playing and History borrow its icon
    }
  }
  cards();

  // captured before the cards' own click handlers so the popup replaces the old flows
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.mode');
    if (!b) return;
    const m = b.dataset.mode;
    if (CHESS[m]) { e.stopPropagation(); e.preventDefault(); if (LP.guard) LP.guard(() => openChess(m)); else openChess(m); }
    else if (m === 'hockey') { e.stopPropagation(); e.preventDefault(); openHockey(); }
    else if (b.dataset.vm) { e.stopPropagation(); e.preventDefault(); openVariant(b.dataset.vm); }
    else if (m === 'custom') { e.stopPropagation(); e.preventDefault(); }
  }, true);

  LP.play = { popup, soon };
})();
