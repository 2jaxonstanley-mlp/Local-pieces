2 player local chess game 👇
https://2jaxonstanley-mlp.github.io/Local-pieces/

## Stockfish level (optional)

The "Stockfish" computer level (after Insane) and the Stockfish second opinion in Analyze need two files in the same folder as `index.html`:
`stockfish.js` and `stockfish.wasm`. Get them with `npm install stockfish`, then copy the lite single-threaded build
(`node_modules/stockfish/…-lite-single.js` and the matching `.wasm`) and rename them to `stockfish.js` / `stockfish.wasm`.
Without them the game still works: the Stockfish level plays like Insane and Analyze uses the built-in engine.

## Third-party

This project can use Stockfish (https://github.com/official-stockfish/Stockfish),
via the browser build from https://github.com/nmrugg/stockfish.js
(npm package: stockfish). Stockfish is licensed under the GNU GPL.
Source: https://github.com/official-stockfish/Stockfish
