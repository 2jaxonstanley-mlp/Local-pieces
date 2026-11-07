/**
 * Menu sections: each group (Classic, Custom, Train ...) opens and closes like a dropdown, and remembers how you left it.
 * Also the Suggestions page (GitHub issue or email).
 */
(() => {
  'use strict';
  const LP = window.LP;
  const KEY = 'localPieces.menuOpen';
  const $ = (s) => document.querySelector(s);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  const groups = Array.from(document.querySelectorAll('.mgrp'));
  const state = read();
  function setOpen(g, open, remember) {
    g.classList.toggle('closed', !open);
    g.querySelector('.mgrp-h').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (remember) { state[g.dataset.g] = open ? 1 : 0; save(state); }
  }
  groups.forEach((g) => {
    setOpen(g, false, false);   // every section starts closed whenever the menu loads
    g.querySelector('.mgrp-h').addEventListener('click', () => setOpen(g, g.classList.contains('closed'), true));
  });
  /** The tour opens every group so it can point at each button. */
  LP.menuOpenAll = () => groups.forEach((g) => setOpen(g, true, false));

  /* ---- Suggestions ---- */
  const GH = 'https://github.com/2jaxonstanley-mlp/Chess/issues/new';
  function sgLinks() {
    const t = $('#sg-text').value.trim();
    const body = t + '\n\n(Sent from Local Pieces)';
    $('#sg-gh').href = GH + '?title=' + encodeURIComponent('Suggestion: ' + (t.split('\n')[0] || '').slice(0, 60)) + '&body=' + encodeURIComponent(body);
  }
  $('#sg-text').addEventListener('input', sgLinks);
  sgLinks();
  const sg = document.querySelector('.mode[data-mode="suggest"]');
  if (sg) sg.addEventListener('click', () => { LP.showPage('suggest'); });
  $('#sg-back').addEventListener('click', () => LP.showPage('menu'));
})();
