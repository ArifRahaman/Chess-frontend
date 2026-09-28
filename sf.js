// sf.js — wrapper around Stockfish 16 (single-threaded WASM) running in a Web Worker.
// Exposes a global `Stockfish` with an async API. Talks UCI over postMessage.

(function () {
  "use strict";

  const ENGINE_URL = "engine/stockfish-nnue-16-single.js";

  let worker = null;
  let ready = false;
  let readyResolve = null;
  let readyPromise = new Promise((res) => (readyResolve = res));
  let onBestMove = null;
  let loadError = null;
  let watchdog = null;

  function post(cmd) {
    if (worker) worker.postMessage(cmd);
  }

  function handleLine(line) {
    if (typeof line !== "string") return;
    if (line === "uciok") {
      post("isready");
    } else if (line === "readyok") {
      if (!ready) {
        ready = true;
        readyResolve(true);
      }
    } else if (line.startsWith("bestmove")) {
      const parts = line.split(/\s+/);
      const best = parts[1]; // e.g. "e2e4" or "e7e8q" or "(none)"
      resolveBest(best && best !== "(none)" ? best : null);
    }
  }

  function resolveBest(value) {
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    if (onBestMove) {
      const cb = onBestMove;
      onBestMove = null;
      cb(value);
    }
  }

  // If the engine goes silent (e.g. a malformed position wedges it), recreate the
  // worker and report failure so the caller can fall back to the built-in engine.
  function selfHeal() {
    try { if (worker) worker.terminate(); } catch (e) {}
    worker = null;
    ready = false;
    readyPromise = new Promise((res) => (readyResolve = res));
    resolveBest(null);
  }

  function init() {
    if (worker) return readyPromise;
    try {
      worker = new Worker(ENGINE_URL);
    } catch (e) {
      loadError = e;
      return Promise.reject(e);
    }
    worker.onmessage = (ev) => handleLine(ev.data);
    worker.onerror = (ev) => {
      loadError = ev;
      if (onBestMove) {
        const cb = onBestMove;
        onBestMove = null;
        cb(null);
      }
    };
    post("uci");
    return readyPromise;
  }

  // Configure engine strength.
  //   skill: 0..20 (Stockfish "Skill Level"); lower = weaker, makes deliberate mistakes.
  function setStrength(skill) {
    post("setoption name Skill Level value " + skill);
  }

  // Ask for the best move from a FEN. Returns a Promise resolving to a UCI string (or null).
  //   opts: { movetime (ms), depth }
  function bestMove(fen, opts) {
    opts = opts || {};
    const budget = opts.depth ? 20000 : (opts.movetime || 1000) + 6000;
    return init().then(
      () =>
        new Promise((resolve) => {
          onBestMove = resolve;
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(selfHeal, budget); // never let a hang freeze the game
          post("position fen " + fen);
          if (opts.depth) {
            post("go depth " + opts.depth);
          } else {
            post("go movetime " + (opts.movetime || 1000));
          }
        })
    );
  }

  function newGame() {
    post("ucinewgame");
    post("isready");
  }

  function available() {
    return !loadError;
  }

  window.Stockfish = { init, setStrength, bestMove, newGame, available };
})();
