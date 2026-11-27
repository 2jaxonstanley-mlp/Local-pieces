/**
 * In-game quest bar: a small collapsed pill at the top of the game panel ("Quests: 2 left").
 * - Shows only while a real game (not Sandbox, not bot vs bot) is on screen and a quest that game can move is unfinished.
 * - Tap it to open the list with live progress. Capture quests move on every capture; play/win quests move when the game ends.
 * - Tapping the list asks before leaving the game for the Tasks page.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP || !LP.rewards || !LP.rewards.openQuests) return;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => LP.esc(String(t == null ? '' : t));
  const panel = $('#game .panel'), game = $('#game');
  if (!panel || !game) return;

  const box = document.createElement('div');
  box.id = 'qd'; box.className = 'qd hidden';
  panel.insertBefore(box, panel.firstChild);
  let open = false;

  /** Which quests the game on screen can actually move (the rules mirror when shop.js counts them). */
  function relevant(q, c) {
    switch (q.ev) {
      case 'capture': return true;
      case 'play': case 'win': return !c.online;
      case 'hardwin': return c.ai && !c.online;
      case 'secret': return c.mode === 'secret' && !c.online;
      case 'onlinegame': case 'onlinewin': return c.online;
      default: return false;
    }
  }
  let sig = '';
  function draw(force) {
    if (!game.classList.contains('active')) { box.classList.add('hidden'); return; }
    const c = LP.gameCtx ? LP.gameCtx() : {};
    if (c.bots || c.tas) { box.classList.add('hidden'); return; }
    const list = LP.rewards.openQuests().filter((q) => relevant(q, c));
    if (!list.length) { box.classList.add('hidden'); sig = ''; return; }
    const now = open + '|' + list.map((q) => q.scope + q.text + q.p).join(',');
    box.classList.remove('hidden');
    if (now === sig && !force) return;   // nothing changed: leave the buttons alone so a tap is never lost
    sig = now;
    box.innerHTML = `<button class="qd-top" type="button" aria-expanded="${open}"><span class="qd-t">&#127942; Quests</span><span class="qd-n">${list.length} left</span><span class="qd-c" aria-hidden="true">${open ? '&#9652;' : '&#9662;'}</span></button>`
      + (open ? `<ul class="qd-list">${list.map((q) => `<li><button class="qd-row" type="button"><span class="qd-tx"><small>${q.scope}</small>${esc(q.text)}</span><span class="qd-pg"><b>${q.p}/${q.n}</b><i style="--w:${Math.round(100 * q.p / q.n)}%"></i></span></button></li>`).join('')}</ul>` : '');
    box.querySelector('.qd-top').onclick = () => { open = !open; draw(true); };
    box.querySelectorAll('.qd-row').forEach((b) => {
      b.onclick = () => {
        LP.openSheet('<h2>Open the Tasks page?<span class="sub">This leaves your game.</span></h2><div class="stack"><button class="btn big primary" id="qd-go">Open Tasks</button><button class="btn" id="qd-no">Stay in the game</button></div>', true);
        $('#qd-no').onclick = LP.closeSheet;
        $('#qd-go').onclick = () => { LP.closeSheet(); LP.rewards.openTasks(); };
      };
    });
  }
  LP.rewards.onChange(() => draw());
  new MutationObserver(() => { open = false; draw(true); }).observe(game, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (game.classList.contains('active')) draw(); }, 1500);   // a game can start after the page opens (names, sides), so look again now and then
})();
