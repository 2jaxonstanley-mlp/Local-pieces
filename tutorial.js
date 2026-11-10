/**
 * First-time tour: dims the screen, spotlights one part of the app at a time and says what it is.
 *   - the menu tour runs the first time the app opens
 *   - a short tour of the board runs the first time a game opens, and another the first time a puzzle opens
 * Next / Back / Skip. "Replay tutorial" in the profile runs them all again. Only a flag is stored (localStorage).
 */
(() => {
  'use strict';
  const LP = window.LP;
  const KEY = 'localPieces.tutorial';
  const $ = (s) => document.querySelector(s);
  const all = (s) => Array.from(document.querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const seen = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const mark = (part) => { const s = seen(); s[part] = 1; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const clear = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  const TOURS = {
    menu: [
      { t: 'Welcome to Local Pieces', d: 'A quick tour of where everything is. It only takes a moment, and you can skip it any time.' },
      { sel: '#acct', t: 'Your profile', d: 'Tap here to set your name and picture and to see your ratings. Your rating changes when you play the computer.' },
      { sel: '#news-btn', t: 'Update log', d: 'See what changed in each update, with the date. A red dot shows when there is something new.' },
      { sel: '#settings-btn', t: 'Settings', d: 'Turn legal move hints, move labels (Brilliant, Blunder and so on) and board auto-flip on or off.' },
      { sel: () => document.querySelector('.mgrp[data-g="global"] .mgrp-h'), t: 'Menu sections', d: 'The menu is split into sections. Tap a section title to open or close it.' },
      { sel: () => document.querySelector('.mgrp[data-g="global"]'), t: 'Play online', d: 'Online Chess lets you play a friend on another device, timed or unlimited, with a code you share. When a game ends, Rematch starts a new one after a 3 second countdown with the colours swapped. Puzzle Battle is a 3 minute race on the same puzzles: highest score wins, and it ends early if one player is out of lives and the other is ahead. Leaderboards ranks every player.' },
      { sel: () => document.querySelector('.mode[data-mode="basic"]'), t: 'Classic', d: 'Normal chess with no clock, against a friend on one screen or against the computer at five levels. While it is your opponent\'s turn you can queue premoves (also online): tap a piece and a square, tap anywhere else to cancel them.' },
      { sel: () => [document.querySelector('.mode[data-mode="bullet"]'), document.querySelector('.mode[data-mode="rapid"]')], t: 'Bullet and Rapid', d: 'Timed chess. Bullet is 1 or 3 minutes each. Rapid is 5 or 10 minutes each, with 2 extra seconds every move.' },
      { sel: () => document.querySelector('.mgrp[data-g="custom"]'), t: 'Variants', d: 'Secret Queen hides a queen in your army. Capture Rush is a race to capture. Air Hockey is queens against queens with a puck, first to 7.' },
      { sel: () => document.querySelector('.mgrp[data-g="puzzles"]'), t: 'Puzzles', d: 'Puzzles give you a fresh challenge every time and Popular Puzzles are famous positions. Puzzle Rush gives you three lives to solve as many as you can, getting harder as you go, and Solo Chess is 30 capture puzzles against the clock.' },
      { sel: () => document.querySelector('.mgrp[data-g="analysis"]'), t: 'Analysis', d: 'Analyze reviews your saved games like a lesson, with a chance to try again from your mistakes. Match History replays your last 50 games, and the Position Editor sets up any position to play or save.' },
      { sel: () => document.querySelector('.mgrp[data-g="rewards"]'), t: 'Tasks and the Shop', d: 'Finish daily and weekly tasks to earn tokens, then spend them on crates in the Shop for new boards, pieces and accessories.' },
      { sel: () => document.querySelector('.mgrp[data-g="progress"]'), t: 'Stats', d: 'Your ratings, results, puzzle streaks and records, plus your personal records.' },
      { t: 'You are ready', d: 'Leave a game halfway and "Continue playing" appears at the top. Finish a game and tap Analyze game to save it and learn from it. You can replay this tour from your profile.' },
    ],
    game: [
      { sel: '#board', t: 'The board', d: 'Tap a piece to see where it can go, then tap a square to move. Dots show the legal moves.' },
      { sel: '#bottom-bar', t: 'Players', d: 'Names and the pieces each side has captured. The dot shows whose side it is.' },
      { sel: '#status', t: 'Status', d: 'Whose turn it is, and messages such as check, checkmate or a draw.' },
      { sel: '#controls', t: 'Controls', d: 'Flip turns the board around. Back and Forward step through the moves (Sandbox has real Undo and Redo). New game starts over. Some modes add Hint, Pause and more.' },
      { sel: () => { const s = $('#game .side'); return s && s.getBoundingClientRect().width > 0 ? s : $('#move-list'); }, t: 'Moves', d: 'Every move is listed here. When move labels are on, each move gets a mark like Brilliant, Good or Blunder.' },
    ],
    puzzle: [
      { sel: '#pz-board', t: 'The puzzle', d: 'White always moves first. Make your move on the board.' },
      { sel: '#pz-turn', t: 'The goal', d: 'What you have to do in this puzzle is shown here.' },
      { sel: '.pz-actions', t: 'Hint and Solution', d: 'A hint shows which piece to move. Solution plays the answer. Using either counts as a miss and ends your streak.' },
      { sel: '#pz-next', t: 'Next puzzle', d: 'Solved it, or want a different one? Tap here for a new puzzle.' },
    ],
  };

  let ui = null, run = null;

  function build() {
    const root = document.createElement('div');
    root.id = 'tut';
    root.className = 'tut';
    root.innerHTML = '<div class="tut-block"></div><div class="tut-hole"></div>' +
      '<div class="tut-card" role="dialog" aria-live="polite"><div class="tut-step"></div><h3></h3><p></p>' +
      '<div class="tut-dots"></div><div class="tut-btns"><button class="btn tut-skip">Skip</button><button class="btn tut-back">Back</button><button class="btn primary tut-next">Next</button></div></div>';
    document.body.appendChild(root);
    ui = { root, hole: root.querySelector('.tut-hole'), card: root.querySelector('.tut-card'), step: root.querySelector('.tut-step'), h: root.querySelector('h3'), p: root.querySelector('p'), dots: root.querySelector('.tut-dots'),
      skip: root.querySelector('.tut-skip'), back: root.querySelector('.tut-back'), next: root.querySelector('.tut-next') };
    ui.skip.onclick = () => finish(true);
    ui.back.onclick = () => go(run.i - 1);
    ui.next.onclick = () => (run.i >= run.steps.length - 1 ? finish(false) : go(run.i + 1));
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }

  const targetOf = (st) => { try { return typeof st.sel === 'function' ? st.sel() : st.sel ? $(st.sel) : null; } catch (e) { return null; } };
  /** The rectangle of a target: one element, or the union of several. */
  function rectOf(t) {
    const list = (Array.isArray(t) ? t : [t]).filter(Boolean);
    if (!list.length) return null;
    let l = 1e9, tp = 1e9, r = -1e9, b = -1e9;
    list.forEach((e) => { const q = e.getBoundingClientRect(); l = Math.min(l, q.left); tp = Math.min(tp, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
    return { left: l, top: tp, right: r, bottom: b, width: r - l, height: b - tp };
  }
  const visible = (t) => { const r = rectOf(t); return !!r && r.width > 2 && r.height > 2; };

  function place() {
    if (!run || !ui) return;
    const st = run.steps[run.i];
    const el = targetOf(st);
    const vw = window.innerWidth, vh = window.innerHeight;
    const card = ui.card;
    if (!visible(el)) {                                   // no target: a centred card on a plain dim
      ui.hole.style.cssText = 'left:50%;top:50%;width:0;height:0;';
      const ch0 = card.offsetHeight, cw0 = Math.min(card.offsetWidth, vw - 20);
      card.style.left = Math.max(10, (vw - cw0) / 2) + 'px';
      card.style.top = Math.max(10, (vh - ch0) / 2) + 'px';
      return;
    }
    const r = rectOf(el);
    const pad = 6;
    const x = Math.max(2, r.left - pad), y = Math.max(2, r.top - pad);
    const w = Math.min(vw - 4, r.width + pad * 2), h = Math.min(vh - 4, r.height + pad * 2);
    ui.hole.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    const ch = card.offsetHeight, cw = Math.min(card.offsetWidth, vw - 20);
    const below = vh - (y + h), above = y;
    let top;
    if (below >= ch + 14) top = y + h + 12;
    else if (above >= ch + 14) top = y - ch - 12;
    else top = Math.max(10, Math.min(vh - ch - 10, below > above ? y + h + 12 : y - ch - 12));   // big targets: overlap the lower part
    if (top + ch > vh - 8) top = Math.max(8, vh - ch - 8);
    card.style.top = top + 'px';
    card.style.left = Math.max(10, Math.min(vw - cw - 10, x + w / 2 - cw / 2)) + 'px';
  }

  function go(i, dir) {
    if (!run) return;
    const steps = run.steps;
    dir = dir || (i < run.i ? -1 : 1);
    i = Math.max(0, Math.min(steps.length - 1, i));
    // skip steps whose target is not on screen (for instance a hidden panel)
    while (steps[i].sel && !visible(targetOf(steps[i]))) {
      const nx = i + dir;
      if (nx < 0 || nx >= steps.length) { i = dir > 0 ? steps.length - 1 : 0; break; }
      i = nx;
    }
    run.i = i;
    const st = steps[i];
    const el = targetOf(st);
    const first = Array.isArray(el) ? el[0] : el;
    if (first && first.scrollIntoView) { try { first.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { /* ignore */ } }
    ui.step.textContent = (i + 1) + ' of ' + steps.length;
    ui.h.textContent = st.t;
    ui.p.textContent = st.d;
    ui.dots.innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    ui.back.classList.toggle('hidden', i === 0);
    ui.next.textContent = i >= steps.length - 1 ? 'Done' : 'Next';
    ui.skip.classList.toggle('hidden', i >= steps.length - 1);
    place();
    setTimeout(place, 60);
  }

  function finish(skipped) {
    if (!run) return;
    mark(run.part);
    if (skipped && run.part === 'menu') { mark('game'); mark('puzzle'); }    // skipping the first tour skips the rest too
    run = null;
    if (ui) { ui.root.classList.remove('on'); }
    document.body.classList.remove('tut-open');
  }

  function start(part) {
    if (run) return;
    if (!ui) build();
    if (part === 'menu' && LP.menuOpenAll) LP.menuOpenAll();
    run = { part, steps: TOURS[part], i: -1 };
    ui.root.classList.add('on');
    document.body.classList.add('tut-open');
    go(0);
  }

  /** Wait until nothing else is on screen (sheets, covers), then run the tour for this page. */
  function whenClear(part, pageId, tries) {
    if (seen()[part]) return;
    const page = $('#' + pageId);
    if (!page || !page.classList.contains('active')) return;
    const sheetOpen = !$('#sheet-bg').classList.contains('hidden');
    const cover = $('#cover');
    const covered = pageId === 'game' && cover && !cover.classList.contains('hidden');
    const toastBusy = false;
    if ((sheetOpen || covered || toastBusy) && (tries || 0) < 80) { setTimeout(() => whenClear(part, pageId, (tries || 0) + 1), 400); return; }
    if (!sheetOpen && !covered) setTimeout(() => { if (page.classList.contains('active') && !run && !seen()[part]) start(part); }, 500);
  }

  // first-time triggers
  const pages = ['game', 'puzzle'];
  pages.forEach((id) => {
    const el = $('#' + id);
    if (!el) return;
    new MutationObserver(() => { if (el.classList.contains('active')) whenClear(id, id, 0); }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  LP.tutorial = {
    replay() { clear(); LP.closeSheet(); LP.showPage('menu'); setTimeout(() => start('menu'), 250); },
    start,
    seen,
  };

  // the menu tour: the first time the app is opened
  const first = () => {
    if (seen().menu) return;
    const menu = $('#menu');
    if (menu && menu.classList.contains('active') && $('#sheet-bg').classList.contains('hidden')) setTimeout(() => { if (!run && !seen().menu) start('menu'); }, 700);
  };
  if (document.readyState === 'complete') first(); else window.addEventListener('load', first);
})();
