/**
 * Spectating: watch a game from the Players list or a profile.
 * Online games are read from the games table, games against the computer from bot_games. A poll waits for Realtime news
 * (see online.js), so a move shows up as soon as it is played. The board and move list are the replay viewer (app.js spectateSet).
 *
 *   LP.spectate.watch(pl, name, backPage)   pl = what the player list says they are doing: { k: 'game' | 'bot', id, ... }
 *   LP.spectate.stop()                      stops watching; returns the page to go back to
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP) return;
  const N = () => LP.onlineApi;
  let cur = null;   // { k, id, u, back }

  const toast = (t) => { if (LP.chessOnline && LP.chessOnline.toast) LP.chessOnline.toast(t); else try { alert(t); } catch (e) { /* ignore */ } };

  async function watch(pl, name, back) {
    if (!pl || !pl.id || !N() || !N().url()) { toast('That game cannot be watched.'); return; }
    if (pl.k === 'live') { stop(); if (LP.live) LP.live.watch(pl, name, back || 'menu'); return; }   // modes with no move list: variants, rushes, puzzles, hockey
    stop();
    const my = (cur = { k: pl.k === 'bot' ? 'bot' : 'game', id: pl.id, u: '', back: back || 'menu', opened: false, fails: 0 });
    const first = await N().get({ a: 'spec', k: my.k, id: my.id });
    if (cur !== my) return;
    if (!first || first.error || !first.moves) {
      cur = null;
      toast(first && first.error && first.error !== 'No connection' ? first.error : 'Could not open that game. Check your connection.');
      if (LP.players && LP.players.show && my.back === 'pl-page') LP.players.show();
      return;
    }
    my.opened = true; my.u = first.upd;
    // put the player you picked at the bottom: they are White in a game against the computer when side = 'w', and so on
    const flip = first.k === 'bot' ? first.side === 'b' : !!(first.names && name && first.names.b === name && first.names.w !== name);
    LP.spectateSet(first, { flip });
    if (first.status === 'over' || first.status === 'cancelled') return;
    loop(my);
  }

  async function loop(my) {
    while (cur === my) {
      const r = await N().get({ a: 'spec', k: my.k, id: my.id, u: my.u, wait: 1 });
      if (cur !== my) return;
      if (!r || r.error) {
        if (r && r.error && r.error !== 'No connection') { toast(r.error); return; }   // not available any more: stay on the last position
        await N().sleep(2000);
        continue;
      }
      my.u = r.upd;
      LP.spectateSet(r);
      if (r.status === 'over' || r.status === 'cancelled') return;
      if (r.k === 'bot' && r.live === false) {   // the player closed the game without finishing it
        if (++my.fails > 12) { toast('This player has left the game.'); return; }
      } else my.fails = 0;
      await N().sleep(100);
    }
  }

  function stop() {
    const back = cur ? cur.back : 'menu';
    cur = null;
    return back;
  }

  LP.spectate = { watch, stop, cur: () => (cur && cur.opened ? { k: cur.k, id: cur.id } : null) };
})();
