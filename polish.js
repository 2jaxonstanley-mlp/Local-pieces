/**
 * Small touches of polish on top of the sound system (prefs.js): the board pulses on a capture, glows red on check,
 * and a confetti burst appears when you win. All of it follows the Animations switch in Settings.
 */
(() => {
  'use strict';
  const LP = window.LP;
  if (!LP || !LP.fx || !LP.fx.play) return;
  const orig = LP.fx.play;
  const animOn = () => !(LP.prefs && LP.prefs.get && LP.prefs.get('anim') === false);
  function pulse(cls) {
    const b = document.getElementById('board');
    if (!b) return;
    b.classList.remove('fx-cap', 'fx-chk'); void b.offsetWidth; b.classList.add(cls);
    setTimeout(() => b.classList.remove(cls), 600);
  }
  function confetti() {
    const i = document.createElement('img');
    i.src = 'lp-confetti.png'; i.alt = ''; i.className = 'fx-confetti';
    document.body.appendChild(i);
    setTimeout(() => i.remove(), 1500);
  }
  LP.fx.play = function (name) {
    const r = orig.apply(this, arguments);
    try {
      if (animOn()) {
        if (name === 'capture') pulse('fx-cap');
        else if (name === 'check') pulse('fx-chk');
        else if (name === 'win') confetti();
      }
    } catch (e) { /* effects are optional */ }
    return r;
  };
})();
