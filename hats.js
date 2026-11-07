/**
 * Accessory artwork, drawn as little SVG pictures (no emoji). Each one is 64 x 40 with the bit that touches the head along the
 * bottom edge. shop.js reads window.LP_HATS = { id: svg } and this file also writes one CSS rule per hat:
 *   [data-hat="top"] { --hat-img: url("data:image/svg+xml,...") }
 * so anything with a data-hat attribute can draw it as a background.
 */
(() => {
  'use strict';
  const star = (x, y, r, fill) => `<path d="M${x} ${y - r}L${x + r * 0.32} ${y - r * 0.32}L${x + r} ${y}L${x + r * 0.32} ${y + r * 0.32}L${x} ${y + r}L${x - r * 0.32} ${y + r * 0.32}L${x - r} ${y}L${x - r * 0.32} ${y - r * 0.32}Z" fill="${fill}" stroke="none"/>`;
  const H = {
    grad: `<path d="M16 23V31C16 36 48 36 48 31V23L32 29Z" fill="#34343e"/><path d="M32 5L62 17L32 29L2 17Z" fill="#23232b"/><path d="M32 17L54 19" fill="none" stroke="#f2c24a" stroke-width="1.8"/><rect x="52" y="19" width="5" height="12" rx="1.5" fill="#f2c24a"/>`,
    sun: `<ellipse cx="32" cy="31" rx="30" ry="6.2" fill="#e7c978"/><path d="M16 31C16 11 48 11 48 31Z" fill="#f2d98e"/><path d="M16.4 25H47.6L48 31H16Z" fill="#c9473d"/><path d="M10 32C22 35 42 35 54 32" fill="none" stroke="#c9a550" stroke-width="1"/>`,
    hard: `<path d="M10 33C10 9 54 9 54 33Z" fill="#f6c61a"/><rect x="28" y="6" width="8" height="27" rx="3" fill="#e3ad0b"/><rect x="5" y="32" width="54" height="5" rx="2.5" fill="#f6c61a"/>`,
    top: `<ellipse cx="32" cy="34" rx="27" ry="4.6" fill="#1c1c22"/><path d="M18 34V9C18 4 46 4 46 9V34Z" fill="#27272e"/><ellipse cx="32" cy="9" rx="14" ry="3.2" fill="#383840"/><path d="M18 26H46V32H18Z" fill="#b5212c"/>`,
    helm: `<path d="M11 35C11 13 21 6 32 6C43 6 53 13 53 35Z" fill="#9ba5b1"/><path d="M29.5 6H34.5V31H29.5Z" fill="#c9d0d8"/><rect x="8" y="30" width="48" height="6" rx="2.5" fill="#6c7683"/><circle cx="16" cy="33" r="1.4" fill="#cfd6de" stroke="none"/><circle cx="48" cy="33" r="1.4" fill="#cfd6de" stroke="none"/>`,
    crown: `<path d="M9 35L6 11L21 22L32 6L43 22L58 11L55 35Z" fill="#f4c52e"/><rect x="9" y="30" width="46" height="6" fill="#d9a615"/><circle cx="32" cy="25" r="3" fill="#e0245e"/><circle cx="19" cy="27" r="2.2" fill="#2f7bf0"/><circle cx="45" cy="27" r="2.2" fill="#2f7bf0"/><circle cx="6" cy="10" r="2.4" fill="#f4c52e"/><circle cx="32" cy="5" r="2.4" fill="#f4c52e"/><circle cx="58" cy="10" r="2.4" fill="#f4c52e"/>`,
    halo: `<ellipse cx="32" cy="22" rx="20" ry="6.5" fill="none" stroke="#fff3b0" stroke-opacity=".55" stroke-width="7"/><ellipse cx="32" cy="22" rx="20" ry="6.5" fill="none" stroke="#f6c53a" stroke-opacity="1" stroke-width="3.6"/>`,
    wizard: `<path d="M13 35C22 31 25 19 37 3C38 16 44 29 52 35Z" fill="#5d40b3"/><ellipse cx="32" cy="35" rx="30" ry="4.6" fill="#4a3396"/><path d="M19 31C29 34 40 34 46 31L47 34C40 37 27 37 18 34Z" fill="#f1c244" stroke="none"/>${star(31, 21, 3.4, '#ffe58a')}${star(40, 27, 2.2, '#ffe58a')}`,
    pirate: `<path d="M3 31C13 23 19 7 32 7C45 7 51 23 61 31C49 37 15 37 3 31Z" fill="#202027"/><path d="M5 30C16 35 48 35 59 30" fill="none" stroke="#e4b63e" stroke-width="1.6"/><circle cx="32" cy="19" r="5.2" fill="#f4f1ea"/><rect x="29" y="22" width="6" height="4" rx="1" fill="#f4f1ea"/><circle cx="30" cy="19" r="1.4" fill="#202027" stroke="none"/><circle cx="34" cy="19" r="1.4" fill="#202027" stroke="none"/>`,
    cowboy: `<path d="M17 33C15 11 22 8 32 13C42 8 49 11 47 33Z" fill="#b57c44"/><path d="M2 22C8 36 22 35 32 35C42 35 56 36 62 22C56 31 46 31 32 31C18 31 8 31 2 22Z" fill="#9b6a3a"/><rect x="17.5" y="26" width="29" height="4.4" fill="#5c3a1c"/><circle cx="32" cy="28.2" r="1.7" fill="#e4b63e" stroke="none"/>`,
    party: `<path d="M32 3L47 36H17Z" fill="#ff6fa8"/><path d="M24.6 19H39.4L43.2 27H20.8Z" fill="#ffe14d" stroke="none"/><ellipse cx="32" cy="36" rx="15" ry="2.6" fill="#e5508f"/><circle cx="32" cy="4" r="4.2" fill="#fff08a"/>`,
    horns: `<path d="M16 36C9 29 9 16 15 5C18 16 22 24 29 31Z" fill="#d9332e"/><path d="M48 36C55 29 55 16 49 5C46 16 42 24 35 31Z" fill="#d9332e"/>`,
    antlers: `<g fill="none" stroke="#2a1b10" stroke-opacity=".7" stroke-width="5.4"><path d="M26 36C22 26 20 17 13 7M21 22L9 20M18 14L18 4"/><path d="M38 36C42 26 44 17 51 7M43 22L55 20M46 14L46 4"/></g><g fill="none" stroke="#9a6a38" stroke-width="3"><path d="M26 36C22 26 20 17 13 7M21 22L9 20M18 14L18 4"/><path d="M38 36C42 26 44 17 51 7M43 22L55 20M46 14L46 4"/></g>`,
  };
  const wrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><g stroke="#15151b" stroke-opacity=".6" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;
  const svgs = {};
  let css = '';
  Object.keys(H).forEach((id) => {
    svgs[id] = wrap(H[id]);
    css += `[data-hat="${id}"]{--hat-img:url("data:image/svg+xml,${encodeURIComponent(svgs[id])}")}\n`;
  });
  const st = document.createElement('style');
  st.id = 'hat-art';
  st.textContent = css;
  document.head.appendChild(st);
  window.LP_HATS = svgs;
})();
