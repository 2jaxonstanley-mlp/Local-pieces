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
      { t: 'Welcome to Local Pieces v2.0', d: 'Tutorial is highly recommended. It shows where everything is, including things you would otherwise only find by accident. It only takes a minute, and you can skip it any time.' },
      { sel: '#acct', t: 'Your profile', d: 'Tap here to set your name, picture, a bio and a custom background that other players see on your profile. You can also switch comments off, and replay this tutorial from here.' },
      { sel: '#on-tab', t: 'Online Now', d: 'Shows how many players are online. Tap it to open the players list: a green dot means online, and you can watch live games. Tap anyone to open their profile (stats, comments, Add friend, Challenge).' },
      { sel: '#settings-btn', t: 'Settings', d: 'Turn legal move hints, move labels (Brilliant, Blunder and so on), board auto-flip and premoves on or off.' },
      { sel: '#news-btn', t: 'Update log', d: 'See what changed in each update, with the date. A red dot shows when there is something new.' },
      { sel: '#m2-side', t: 'The sidebar', d: 'Everything lives in the sidebar: Home, Classic, Puzzles, Variants, Currency, Leaderboards, Analysis and Discussion. Hover (or press and hold) an icon for a description. A red or gold dot on an icon means something is waiting.' },
      { sel: '#m2-daily', pre: () => LP.menuPane('home'), t: 'Daily Reward and day streak', d: 'Play for 10 minutes in a day to earn a reward: tokens and sometimes a free crate. When it is ready you will be asked when you open the app or return to the menu, and you can claim it once per day. The flame is your day streak: finish at least one game every day to grow it. Miss a whole day and it resets.' },
      { sel: '#m2-cont', t: 'Continue Playing', d: 'Leave a game halfway and it appears here (up to 5), with a picture of the board, whose turn it is, who you are playing and when the last move was. Tap a card to carry on.' },
      { sel: '#m2-fr', t: 'Friends', d: 'Add friends from their profile (from Online Now, a leaderboard, a comment or the Friends list). A green dot shows who is online. Open Friends to accept requests, challenge them, view their profile or send a message. A red dot means a new request or message.' },
      { sel: '#m2-hist', t: 'Game History', d: 'Your recent matches: the mode, who you played (a bot or a player, with their Elo), and a W, L or D. Your accuracy shows once you have analysed the game. Tap a row to watch the replay.' },
      { sel: '.m2-si[data-p="classic"]', pre: () => LP.menuPane('classic'), t: 'Classic', d: 'Untimed and timed chess. Everything starts here.' },
      { sel: '#m2-time', t: 'Time type', d: 'Pick Untimed, Super Bullet (10.1 seconds plus 0.1 per move, and it counts towards your Bullet rating), Bullet or Rapid.' },
      { sel: '#m2-playbtn', t: 'Play', d: 'One Play button: choose Local (two players on this device), Online (create a game, join with a code or pick an open game) or Bot (Dumb up to Stockfish). Online games let you queue premoves and chat.' },
      { sel: '.m2-si[data-p="puzzles"]', pre: () => LP.menuPane('puzzles'), t: 'Puzzles', d: 'Puzzles, Popular, Community Puzzles, Puzzle Rush, Capture Rush, Solo Chess and Puzzle Battle (two players, same puzzles). Rush lives here.' },
      { sel: '.m2-si[data-p="variants"]', pre: () => LP.menuPane('variants'), t: 'Variants', d: 'Custom gamemodes (Chess960, 3-Check, King of the Hill, Atomic, Horde, Racing Kings), Secret Queen, Immortal Snail, Gamblite, Guess Who, Chess Royale and Air Hockey.' },
      { sel: '.m2-si[data-p="currency"]', pre: () => LP.menuPane('currency'), t: 'Currency', d: 'Finish daily and weekly tasks to earn tokens, then spend them on crates in the Shop for boards, pieces and backgrounds. You can even design your own board.' },
      { sel: '.m2-si[data-p="leaderboards"]', pre: () => LP.menuPane('leaderboards'), t: 'Leaderboards and Stats', d: 'Global rankings (Elo, win streak, Puzzle Rush, Day streak and more): tap any player to open their profile. Stats shows your results by opponent, move quality from analysed games and your records.' },
      { sel: '.m2-si[data-p="analysis"]', pre: () => LP.menuPane('analysis'), t: 'Analysis', d: 'Analyze reviews a finished game like a lesson. Match History replays your last 50 games, and the Position Editor sets up any position to play or save.' },
      { sel: '.m2-si[data-p="learn"]', t: 'Learn', d: 'Chess lessons on a winding path. Use the thin arrows to move between topics, tap a pad to see its 10 levels, and finish each level to unlock the next. Redo the first tutorial lesson from the button at the top.' },
      { sel: '.m2-si[data-p="mistakes"]', t: 'Mistake Training', d: 'Analyze a game and your blunders and mistakes come back here as quick puzzles. Find a better move twice to clear each one and earn tokens. Keep a daily streak going.' },
      { sel: '.m2-si[data-p="discussion"]', t: 'Discussion', d: 'Two tabs: Feedback to send ideas and bug reports (you earn tokens), and Global Chat to talk with everyone online.' },
      { t: 'Profile comments', d: 'Every profile has a Comments tab where you can leave a message. If you do not want comments on yours, switch them off in your profile and you can still delete any comment you already have.' },
      { t: 'You are ready', pre: () => LP.menuPane('home'), d: 'Finish a game and tap Analyze game to save it and learn from it. You can replay this tutorial any time from your profile.' },
    ],
    game: [
      { sel: '#board', t: 'The board', d: 'Tap a piece to see where it can go, then tap a square to move. Dots show the legal moves.' },
      { sel: '#bottom-bar', t: 'Players', d: 'Names and the pieces each side has captured. The dot shows whose side it is.' },
      { sel: '#status', t: 'Status', d: 'Whose turn it is, and messages such as check, checkmate or a draw.' },
      { sel: '#controls', t: 'Controls', d: 'Flip turns the board around. Back and Forward step through the moves (Sandbox has real Undo and Redo). New game starts over. Some modes add Hint, Pause and more.' },
      { sel: () => { const s = $('#game .side'); return s && s.getBoundingClientRect().width > 0 ? s : $('#move-list'); }, t: 'Moves', d: 'Every move is listed here. When move labels are on, each move gets a mark like Brilliant, Good or Blunder.' },
      { t: 'Online games and more', d: 'In online games there is a Chat tab beside Moves with quick messages, and you can queue premoves by moving while it is your opponent\'s turn. You can drag pieces too. Finish a game and use Analyze game to review it.' },
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
      '<div class="tut-card" role="dialog" aria-live="polite"><div class="tut-bar"><i></i></div><img class="tut-mascot" alt=""><div class="tut-step"></div><h3></h3><p></p>' +
      '<div class="tut-dots"></div><div class="tut-btns"><button class="btn tut-skip">Skip</button><button class="btn tut-back">Back</button><button class="btn primary tut-next">Next</button></div></div>';
    document.body.appendChild(root);
    ui = { mas: root.querySelector('.tut-mascot'), bar: root.querySelector('.tut-bar i'), root, hole: root.querySelector('.tut-hole'), card: root.querySelector('.tut-card'), step: root.querySelector('.tut-step'), h: root.querySelector('h3'), p: root.querySelector('p'), dots: root.querySelector('.tut-dots'),
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
    if (steps[i].pre) { try { steps[i].pre(); } catch (e) { /* ignore */ } }
    while (steps[i].sel && !visible(targetOf(steps[i]))) {
      const nx = i + dir;
      if (nx < 0 || nx >= steps.length) { i = dir > 0 ? steps.length - 1 : 0; break; }
      i = nx;
      if (steps[i].pre) { try { steps[i].pre(); } catch (e) { /* ignore */ } }
    }
    run.i = i;
    const st = steps[i];
    const el = targetOf(st);
    const first = Array.isArray(el) ? el[0] : el;
    if (first && first.scrollIntoView) { try { first.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { /* ignore */ } }
    ui.step.textContent = (i + 1) + ' of ' + steps.length;
    ui.h.textContent = st.t;
    ui.p.textContent = st.d;
    ui.mas.src = 'lp-mascot-' + (i === 0 || i === steps.length - 1 ? 'happy' : 'think') + '.png';
    ui.bar.style.width = Math.round(((i + 1) / steps.length) * 100) + '%';
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
    const askLesson = run.part === 'menu';
    if (skipped && run.part === 'menu') { mark('game'); mark('puzzle'); }    // skipping the first tour skips the rest too
    run = null;
    if (LP.menuPane) LP.menuPane('home');
    if (ui) { ui.root.classList.remove('on'); }
    document.body.classList.remove('tut-open');
    if (LP.lesson && LP.lesson.ask && askLesson) setTimeout(() => LP.lesson.ask(), 450);   // the app tour is over: ask if this is a first game of chess
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
