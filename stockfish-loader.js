/*
 * Stockfish.js loader. The GPL-3.0 engine is served from jsDelivr at runtime.
 * This wrapper keeps the engine files on the same-origin browser worker while
 * pointing the WebAssembly loader at the matching pinned CDN release.
 */
const engineBase = 'https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/';
self.Module = self.Module || {};
self.Module.locateFile = (file) => new URL(file, engineBase).href;
importScripts(`${engineBase}stockfish-19-lite-single.js`);
