# something_chess

**A small post-game chess study room.** Load a finished PGN or a FEN position, step through the moves, explore legal continuations, and ask Stockfish to compare candidate lines in your browser.

## Use

1. Open `index.html` from a static web host.
2. Load a finished game's PGN or paste a FEN position.
3. Select a move, explore the position on the board, and choose an analysis depth.
4. Start analysis. The page sends the position to Stockfish in your browser; it does not send the position to a game service.

This is a post-game study tool. Do not use engine recommendations during a live game.

## Run locally

Serve this folder with any static HTTP server. The chess rules library and Stockfish Lite Single engine are loaded from pinned jsDelivr URLs, so an internet connection is needed on first load. Stockfish runs in a browser Web Worker; its WebAssembly network is about 1.7 MB.

## Publish

The included GitHub Actions workflow publishes the repository root to GitHub Pages whenever `main` is updated. In the repository settings, choose **Pages → Build and deployment → GitHub Actions** once to enable deployment.

## Third-party software

- [chess.js 1.4.0](https://github.com/jhlywa/chess.js) — BSD-2-Clause
- [Stockfish.js 19.0.1](https://github.com/nmrugg/stockfish.js) — GPL-3.0; loaded from jsDelivr at runtime. See the [engine license](https://github.com/nmrugg/stockfish.js/blob/master/Copying.txt).

## License

The project-specific source in this repository is provided under the MIT License. Third-party software remains under its own license.
