/**
 * The mod menu, in the style of a Geometry Dash mod menu. It is hidden: open the Update log, scroll to the very first update (the one at the
 * bottom) and tap the first and the last letter of its title (either order, within a few seconds). A round mod button then floats on top
 * of every screen (drag it anywhere). Tap the circle to open a small panel with all the mods; tap it again (or the cross) to close it.
 * This panel is the only place mods are switched on. "Turn mod menu off" hides the circle until the secret is used again.
 *
 * Categories are drop-downs, one per part of the game. For now there is only Hockey:
 *   spd      piece speed multiplier for each side, 1x to 15x (it multiplies the speed percentage the pieces already have)
 *   any      move anywhere: your piece goes to any square at any moment, even while gliding and even on the other side (never the computer)
 *   slow     game speed, 10% to 100% (slowPick is the speed the Slow motion switch uses)    norm: your own piece keeps moving at normal speed while slowed
 *   puckT    show the puck's path this many seconds ahead (0 = off)       plTraj: show where the pieces are heading
 *   pk puck speed  slide puck slide (friction)  psize puck size  gw goal width  xp extra pucks  sz piece sizes  gh ghost pieces (50% see-through, the puck passes through)
 *   tm AI teammates (stay on their back row, fast, defend the goal)  inst instant move (no glide)
 *   Buttons (hockey.js provides them through LP.mods.hook): Rewind 1s (a live match goes back about a second, points included), Stop puck, Place puck
 * hockey.js reads LP.mods.hk while it plays, and notes every mod that was used so the match shows as Modded in History.
 *
 * Classic (a second drop-down, for Classic games):
 *   timed  bots use timed-mode speed (they answer in about 0.5 to 2 seconds, like Bullet and Rapid). Classic and Sandbox only: timed games already do
 *   Both sides  you play the computer's turns too, so it never moves (a game vs the computer)
 *   Hint   shows the best moves for the side to move (a button; app.js provides it through LP.mods.hook('classic'))
 *   Tools  Move pieces (tap a piece, then any square) and Paint tile (tap a square to put the chosen colour + piece type on it, Empty clears it).
 *          A tool is switched on by tapping it and off by tapping it again. While one is on, normal moves are switched off.
 *          The tool is never saved: it is off again every time a game starts. An edit does not reset the game: it is written into the next move,
 *          so replays and Back show the piece appearing out of nowhere on that move.
 * The Classic mods work in Classic, Bullet, Rapid and Sandbox.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const KEY = 'localPieces.mods';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const defHk = () => ({ spd: [1, 1], any: false, slow: 1, slowPick: 0.5, norm: true, puckT: 0, plTraj: false, pk: 1, slide: 1, psize: 1, gw: 3, xp: 0, sz: [1, 1], gh: [false, false], tm: [false, false], inst: false });
  const defCl = () => ({ timed: false, color: 'w', piece: 0 });
  let st = { unlocked: false, pos: { x: 0.92, y: 0.34 }, hk: defHk(), cl: defCl(), open: { hockey: true, classic: true } };
  let tool = '';                                   // '', 'move' or 'paint' (Classic tools; never saved)
  const subs = [];
  const hooks = {};
  const SZ = 50;                                   // the round button, in pixels

  function clean(h) {
    const d = defHk();
    if (!h || typeof h !== 'object') return d;
    const n = (v, a, b, f) => (typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : f);
    return {
      spd: [0, 1].map((i) => n(h.spd && h.spd[i], 1, 15, 1)),
      any: !!h.any,
      slow: n(h.slow, 0.1, 1, 1),
      slowPick: n(h.slowPick, 0.1, 0.95, 0.5),
      norm: h.norm !== false,
      puckT: n(h.puckT, 0, 5, 0),
      plTraj: !!h.plTraj,
      pk: n(h.pk, 0.5, 3, 1),
      slide: n(h.slide, 0.25, 5.5, 1),
      psize: n(h.psize, 0.5, 2.5, 1),
      gw: n(h.gw, 1, 8, 3),
      xp: Math.round(n(h.xp, 0, 5, 0)),
      sz: [0, 1].map((i) => n(h.sz && h.sz[i], 0.5, 2.5, 1)),
      gh: [0, 1].map((i) => !!(h.gh && h.gh[i])),
      tm: [0, 1].map((i) => !!(h.tm && h.tm[i])),
      inst: !!h.inst,
    };
  }
  function cleanCl(c) {
    const d = defCl();
    if (!c || typeof c !== 'object') return d;
    return { timed: !!c.timed, color: c.color === 'b' ? 'b' : 'w', piece: Math.round(clamp(+c.piece || 0, 0, 6)) };
  }
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === 'object') {
      st.unlocked = !!v.unlocked;
      st.hk = clean(v.hk);
      st.cl = cleanCl(v.cl);
      if (v.pos && isFinite(v.pos.x) && isFinite(v.pos.y)) st.pos = { x: clamp(v.pos.x, 0, 1), y: clamp(v.pos.y, 0, 1) };
      if (v.open && typeof v.open === 'object') st.open = Object.assign({ hockey: true, classic: true }, v.open);
    }
  } catch (e) { /* defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* best effort */ } };
  const fire = () => subs.forEach((f) => { try { f(); } catch (e) { /* a listener must not break the others */ } });
  const LOCKED = defHk();
  const LOCKED_CL = Object.assign(defCl(), { tool: '' });

  const xs = (v) => (Math.round(v * 10) / 10) + '×';
  const pct = (v) => Math.round(v * 100) + '%';

  /* ------------------------------------------------------------------ the circle and the panel */
  let btn = null, panel = null, poll = 0;

  function placeBtn() {
    if (!btn) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    btn.style.left = clamp(st.pos.x * (vw - SZ), 0, Math.max(0, vw - SZ)) + 'px';
    btn.style.top = clamp(st.pos.y * (vh - SZ), 0, Math.max(0, vh - SZ)) + 'px';
    placePanel();
  }
  function placePanel() {
    if (!panel || panel.classList.contains('hidden')) return;
    const vw = window.innerWidth, vh = window.innerHeight, r = btn.getBoundingClientRect();
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    panel.style.left = clamp(r.left + r.width / 2 - pw / 2, 8, Math.max(8, vw - pw - 8)) + 'px';
    let top = r.bottom + 8;
    if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 8);
    panel.style.top = top + 'px';
  }

  function build() {
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'mm-btn'; btn.type = 'button'; btn.className = 'mm-btn';
    btn.setAttribute('aria-label', 'Mod menu');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4L8.6 6.6a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.3.4.5.4h4c.3 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>';
    panel = document.createElement('div');
    panel.id = 'mm-panel'; panel.className = 'mm-panel hidden';
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // drag the circle anywhere; a tap without movement opens or closes the panel
    let drag = null;
    btn.addEventListener('pointerdown', (e) => {
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, bx: btn.offsetLeft, by: btn.offsetTop, moved: false };
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    btn.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 7) return;
      drag.moved = true;
      const vw = window.innerWidth, vh = window.innerHeight;
      const l = clamp(drag.bx + dx, 0, vw - SZ), t = clamp(drag.by + dy, 0, vh - SZ);
      st.pos = { x: (vw - SZ) > 0 ? l / (vw - SZ) : 0, y: (vh - SZ) > 0 ? t / (vh - SZ) : 0 };
      placeBtn();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved; drag = null;
      if (moved) save(); else toggle();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', () => { drag = null; });
    window.addEventListener('resize', placeBtn);
    placeBtn();
  }

  function row(label, id, min, max, step, val, out) {
    return `<div class="mm-row"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><output id="${id}-o">${out}</output></div>`;
  }
  const sw = (label, id, on, note) => `<label class="mm-sw"><span>${label}${note ? `<small id="${id}-n">${note}</small>` : ''}</span><input type="checkbox" id="${id}"${on ? ' checked' : ''}><i></i></label>`;
  const pick = (label, id, opts, val) => `<div class="mm-pick"><span>${label}</span><select id="${id}">${opts.map((o) => `<option value="${o[0]}"${String(o[0]) === String(val) ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
  const PIECE_OPTS = [[0, 'Empty'], [1, 'Pawn'], [2, 'Knight'], [3, 'Bishop'], [4, 'Rook'], [5, 'Queen'], [6, 'King']];
  const sub = (id, title, body) => `<details class="mm-sub" id="mm-d-${id}"${st.open[id] ? ' open' : ''}><summary>${title}</summary><div class="mm-in">${body}</div></details>`;
  const slideTxt = (v) => (v >= 5.5 ? 'Endless' : xs(v));

  function paint() {
    const h = st.hk;
    const pieces = row('White speed', 'mm-sw', 1, 15, 0.5, h.spd[0], xs(h.spd[0]))
      + row('Black speed', 'mm-sb', 1, 15, 0.5, h.spd[1], xs(h.spd[1]))
      + row('White size', 'mm-zw', 0.5, 2.5, 0.1, h.sz[0], xs(h.sz[0]))
      + row('Black size', 'mm-zb', 0.5, 2.5, 0.1, h.sz[1], xs(h.sz[1]))
      + sw('White ghost', 'mm-gw', h.gh[0], '50% see-through, the puck passes through')
      + sw('Black ghost', 'mm-gb', h.gh[1], '50% see-through, the puck passes through')
      + sw('Move anywhere', 'mm-any', h.any, 'players only')
      + sw('Instant move', 'mm-inst', h.inst, 'no glide, players only')
      + sw('AI teammate (White)', 'mm-tw', h.tm[0], 'guards the bottom row, very fast')
      + sw('AI teammate (Black)', 'mm-tb', h.tm[1], 'guards the top row, very fast');
    const puck = row('Puck speed', 'mm-pk', 0.5, 3, 0.25, h.pk, xs(h.pk))
      + row('Puck slide', 'mm-sl', 0.25, 5.5, 0.25, h.slide, slideTxt(h.slide))
      + row('Puck size', 'mm-ps', 0.5, 2.5, 0.1, h.psize, xs(h.psize))
      + row('Extra pucks', 'mm-xp', 0, 5, 1, h.xp, String(h.xp))
      + '<div class="mm-two"><button type="button" class="mm-act" id="mm-stop">Stop puck</button><button type="button" class="mm-act" id="mm-place">Place puck</button></div>';
    const arena = row('Goal width', 'mm-gw2', 1, 8, 0.5, h.gw, h.gw + ' sq');
    const time = sw('Slow motion', 'mm-slow', h.slow < 1)
      + row('Game speed', 'mm-sp', 10, 95, 5, Math.round((h.slow < 1 ? h.slow : h.slowPick) * 100), pct(h.slow < 1 ? h.slow : h.slowPick))
      + sw('My piece stays normal speed', 'mm-norm', h.norm)
      + '<button type="button" class="mm-act" id="mm-rw">Rewind 1s</button>';
    const view = row('Puck path', 'mm-puck', 0, 5, 0.5, h.puckT, h.puckT ? h.puckT + 's' : 'Off')
      + sw('Show piece paths', 'mm-pl', h.plTraj);
    panel.innerHTML = `<div class="mm-head"><b>Mod menu</b><button type="button" class="mm-x" id="mm-x" aria-label="Close">&times;</button></div>
      <div class="mm-body">
        <details class="mm-cat" id="mm-hk"${st.open.hockey ? ' open' : ''}>
          <summary>Hockey</summary>
          <div class="mm-subs">
            ${sub('pieces', 'Pieces', pieces)}
            ${sub('puck', 'Puck', puck)}
            ${sub('arena', 'Arena', arena)}
            ${sub('time', 'Time', time)}
            ${sub('view', 'Trajectories', view)}
            <button type="button" class="mm-link" id="mm-rs">Reset Hockey mods</button>
          </div>
        </details>
        <details class="mm-cat" id="mm-cls"${st.open.classic ? ' open' : ''}>
          <summary>Classic</summary>
          <div class="mm-subs">
            <div class="mm-in mm-flat">
              ${sw('Bots use timed-mode speed', 'mm-ct', st.cl.timed, 'Classic and Sandbox; timed games already do')}
              ${sw('Both sides', 'mm-cb', false, 'play the computer\'s turns too')}
              <button type="button" class="mm-act" id="mm-hint">Hint</button>
              <button type="button" class="mm-act mm-tool" id="mm-mv">Move pieces</button>
              <button type="button" class="mm-act mm-tool" id="mm-pt">Paint tile</button>
              <div class="mm-two">
                ${pick('Colour', 'mm-pc', [['w', 'White'], ['b', 'Black']], st.cl.color)}
                ${pick('Piece', 'mm-pp', PIECE_OPTS, st.cl.piece)}
              </div>
              <small class="mm-note" id="mm-cn"></small>
            </div>
            <button type="button" class="mm-link" id="mm-rc">Reset Classic mods</button>
          </div>
        </details>
        <button type="button" class="mm-link off" id="mm-off">Turn mod menu off</button>
      </div>`;
    const $ = (q) => panel.querySelector(q);
    const bind = (id, fn, out, fmt) => {
      const el = $('#' + id);
      el.oninput = el.onchange = () => { fn(el); if (out) $('#' + out).textContent = fmt(el); save(); fire(); };
    };
    const hk = st.hk, v = (e) => +e.value;
    bind('mm-sw', (e) => { hk.spd[0] = clamp(v(e), 1, 15); }, 'mm-sw-o', (e) => xs(v(e)));
    bind('mm-sb', (e) => { hk.spd[1] = clamp(v(e), 1, 15); }, 'mm-sb-o', (e) => xs(v(e)));
    bind('mm-zw', (e) => { hk.sz[0] = clamp(v(e), 0.5, 2.5); }, 'mm-zw-o', (e) => xs(v(e)));
    bind('mm-zb', (e) => { hk.sz[1] = clamp(v(e), 0.5, 2.5); }, 'mm-zb-o', (e) => xs(v(e)));
    bind('mm-gw', (e) => { hk.gh[0] = e.checked; });
    bind('mm-gb', (e) => { hk.gh[1] = e.checked; });
    bind('mm-any', (e) => { hk.any = e.checked; });
    bind('mm-inst', (e) => { hk.inst = e.checked; });
    bind('mm-tw', (e) => { hk.tm[0] = e.checked; });
    bind('mm-tb', (e) => { hk.tm[1] = e.checked; });
    bind('mm-pk', (e) => { hk.pk = clamp(v(e), 0.5, 3); }, 'mm-pk-o', (e) => xs(v(e)));
    bind('mm-sl', (e) => { hk.slide = clamp(v(e), 0.25, 5.5); }, 'mm-sl-o', (e) => slideTxt(v(e)));
    bind('mm-ps', (e) => { hk.psize = clamp(v(e), 0.5, 2.5); }, 'mm-ps-o', (e) => xs(v(e)));
    bind('mm-xp', (e) => { hk.xp = Math.round(clamp(v(e), 0, 5)); }, 'mm-xp-o', (e) => String(Math.round(v(e))));
    bind('mm-gw2', (e) => { hk.gw = clamp(v(e), 1, 8); }, 'mm-gw2-o', (e) => v(e) + ' sq');
    bind('mm-slow', (e) => { hk.slow = e.checked ? hk.slowPick : 1; });
    bind('mm-sp', (e) => { const x = clamp(v(e) / 100, 0.1, 0.95); hk.slowPick = x; if (hk.slow < 1) hk.slow = x; }, 'mm-sp-o', (e) => e.value + '%');
    bind('mm-norm', (e) => { hk.norm = e.checked; });
    bind('mm-puck', (e) => { hk.puckT = clamp(v(e), 0, 5); }, 'mm-puck-o', (e) => (v(e) ? e.value + 's' : 'Off'));
    bind('mm-pl', (e) => { hk.plTraj = e.checked; });
    const keep = (id) => { const d = $('#mm-d-' + id); d.addEventListener('toggle', () => { st.open[id] = d.open; save(); placePanel(); }); };
    ['pieces', 'puck', 'arena', 'time', 'view'].forEach(keep);
    $('#mm-hk').addEventListener('toggle', () => { st.open.hockey = $('#mm-hk').open; save(); placePanel(); });
    bind('mm-ct', (e) => { st.cl.timed = e.checked; });
    bind('mm-cb', (e) => { const k = hooks.classic; if (k && k.setBoth) k.setBoth(e.checked); });
    bind('mm-pc', (e) => { st.cl.color = e.value === 'b' ? 'b' : 'w'; });
    bind('mm-pp', (e) => { st.cl.piece = Math.round(clamp(+e.value, 0, 6)); });
    $('#mm-cls').addEventListener('toggle', () => { st.open.classic = $('#mm-cls').open; save(); placePanel(); });
    $('#mm-hint').onclick = () => { const k = hooks.classic; if (k && k.hint) { close(); k.hint(); } };
    $('#mm-mv').onclick = () => setTool(tool === 'move' ? '' : 'move');
    $('#mm-pt').onclick = () => setTool(tool === 'paint' ? '' : 'paint');
    $('#mm-rc').onclick = () => { st.cl = defCl(); setTool('', true); save(); fire(); paint(); };
    const call = (name) => () => { const k = hooks.hockey; if (k && k[name]) k[name](); };
    $('#mm-rw').onclick = call('rewind');
    $('#mm-stop').onclick = call('stop');
    $('#mm-place').onclick = () => { const k = hooks.hockey; if (k && k.place) { k.place(); close(); } };
    $('#mm-rs').onclick = () => { st.hk = defHk(); save(); fire(); paint(); };
    $('#mm-x').onclick = close;
    $('#mm-off').onclick = () => { st.unlocked = false; tool = ''; btn.classList.remove('tool'); close(); save(); fire(); btn.classList.add('hidden'); };
    refreshState();
    placePanel();
  }
  /** Things that depend on what is going on in the game right now: is there a match to rewind, and can this match use move anywhere? */
  function refreshState() {
    if (!panel || panel.classList.contains('hidden')) return;
    const k = hooks.hockey, s = k && k.state ? k.state() : { live: false };
    const rw = panel.querySelector('#mm-rw');
    if (rw) { rw.disabled = !s.canRewind; rw.textContent = s.live ? 'Rewind 1s' : 'Rewind 1s (start a match first)'; }
    ['#mm-stop', '#mm-place'].forEach((id) => { const b = panel.querySelector(id); if (b) b.disabled = !s.live; });
    const c = hooks.classic, cs = c && c.state ? c.state() : { live: false };
    const ch = panel.querySelector('#mm-hint');
    if (ch) ch.disabled = !cs.canHint;
    const cb = panel.querySelector('#mm-cb');
    if (cb) { cb.disabled = !cs.canBoth; cb.checked = !!(cs.canBoth && cs.both); }
    const cbn = panel.querySelector('#mm-cb-n');
    if (cbn) cbn.textContent = cs.live && !cs.canBoth ? 'needs a computer opponent' : 'play the computer\'s turns too';
    [['#mm-mv', 'move', 'Move pieces'], ['#mm-pt', 'paint', 'Paint tile']].forEach((t) => {
      const b = panel.querySelector(t[0]);
      if (!b) return;
      b.disabled = !cs.live && tool !== t[1];
      b.classList.toggle('on', tool === t[1]);
      b.textContent = t[2] + (tool === t[1] ? ': on (tap to turn off)' : '');
    });
    const cn = panel.querySelector('#mm-cn');
    if (cn) cn.textContent = cs.live ? (tool === 'move' ? 'Tap a piece, then any square. Normal moves are off.' : tool === 'paint' ? 'Tap squares to place the chosen piece. Normal moves are off.' : '') : 'Start a Classic, timed or Sandbox game (not 0 player) to use these.';
    const n = panel.querySelector('#mm-any-n');
    if (n) n.textContent = s.live && s.players === 0 ? 'not in a 0 player match' : 'players only';
    const n2 = panel.querySelector('#mm-inst-n');
    if (n2) n2.textContent = s.live && s.players === 0 ? 'not in a 0 player match' : 'no glide, players only';
  }
  function open() {
    build();
    btn.classList.remove('hidden');
    panel.classList.remove('hidden');
    btn.classList.add('open');
    paint();
    clearInterval(poll);
    poll = setInterval(refreshState, 400);
  }
  function close() {
    if (!panel) return;
    panel.classList.add('hidden');
    btn.classList.remove('open');
    clearInterval(poll);
  }
  /** Switch a Classic tool on (and close the panel so the board is free) or off. `quiet` skips closing. */
  function setTool(t, quiet) {
    tool = t || '';
    if (btn) btn.classList.toggle('tool', !!tool);
    if (tool && !quiet) close();
    refreshState();
    fire();
  }
  function toggle() { if (panel && !panel.classList.contains('hidden')) close(); else open(); }

  LP.mods = {
    /** The secret was used: show the circle (it stays on every screen from now on) and open the panel. */
    open() {
      st.unlocked = true; save();
      try { LP.closeSheet(); } catch (e) { /* no sheet */ }
      open();
      btn.classList.add('pop');
      setTimeout(() => btn.classList.remove('pop'), 700);
      fire();
    },
    unlocked: () => st.unlocked,
    /** The Hockey settings in force (always the plain defaults until the menu has been unlocked). */
    get hk() { return st.unlocked ? st.hk : LOCKED; },
    /** The Classic settings in force: { timed, color: 'w'|'b', piece: 0-6 (0 = Empty), tool: '' | 'move' | 'paint' } (plain defaults until unlocked). */
    get cl() { return st.unlocked ? Object.assign({}, st.cl, { tool }) : LOCKED_CL; },
    /** Switch the Classic tool off (a new game started, or the game was left). */
    clearTool() { if (tool) setTool('', true); },
    on(fn) { subs.push(fn); },
    /** A part of the game registers what its mod buttons can do: LP.mods.hook('hockey', { rewind(), state() }). */
    hook(name, obj) { hooks[name] = obj; },
  };
  if (st.unlocked) {
    const show = () => { build(); btn.classList.remove('hidden'); };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
})();
