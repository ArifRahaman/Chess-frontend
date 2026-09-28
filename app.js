// app.js — UI and game flow. Depends on global `Engine` and `AI`.

(function () {
  "use strict";

  const E = Engine;

  // Filled glyphs for both sides; color comes from CSS. ︎ forces text (not emoji) rendering.
  const T = "︎";
  const GLYPH = {
    wK: "♚" + T, wQ: "♛" + T, wR: "♜" + T, wB: "♝" + T, wN: "♞" + T, wP: "♟" + T,
    bK: "♚" + T, bQ: "♛" + T, bR: "♜" + T, bB: "♝" + T, bN: "♞" + T, bP: "♟" + T,
  };
  const PIECE_ORDER = { Q: 5, R: 4, B: 3, N: 2, P: 1 };
  const PIECE_VALUE = { Q: 9, R: 5, B: 3, N: 3, P: 1 };

  // ---- DOM ----
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const historyEl = document.getElementById("history");
  const capturedWhiteEl = document.getElementById("capturedWhite");
  const capturedBlackEl = document.getElementById("capturedBlack");
  const promotionEl = document.getElementById("promotion");
  const promotionBox = document.getElementById("promotionBox");
  const modeSel = document.getElementById("mode");
  const sideSel = document.getElementById("side");
  const diffSel = document.getElementById("difficulty");
  const sideField = document.getElementById("sideField");
  const difficultyField = document.getElementById("difficultyField");

  // ---- Game state ----
  let state = E.startPosition();
  let history = []; // { state (before), move, san }
  let selected = null; // [r,c]
  let legalForSelected = [];
  let flipped = false;
  let mode = "ai"; // "ai" | "human"
  let humanColor = "w";
  let aiThinking = false;
  let lastMove = null; // { from, to }
  let useStockfish = false; // becomes true once Stockfish reports ready

  const engineCard = document.getElementById("engineCard");
  const engineNameEl = document.getElementById("engineName");
  const engineSubEl = document.getElementById("engineSub");

  // Rough playing strength per difficulty (approx. ELO) for each engine.
  const SKILL_ELO = { 1: "~800", 4: "~1350", 8: "~1900", 14: "~2500", 20: "~3000+" };
  const SKILL_LABEL = { 1: "Beginner", 4: "Easy", 8: "Medium", 14: "Hard", 20: "Maximum" };
  const BUILTIN_ELO = { 1: "~800", 4: "~900", 8: "~1100", 14: "~1300", 20: "~1300" };

  function updateEngineBadge() {
    if (!engineCard) return;
    const skill = parseInt(diffSel.value, 10);
    const label = SKILL_LABEL[skill] || "";
    if (useStockfish) {
      engineCard.classList.add("ok");
      engineCard.classList.remove("warn");
      engineNameEl.textContent = "Stockfish 16";
      engineSubEl.textContent = `${label} · strength ${SKILL_ELO[skill] || "?"} Elo`;
    } else if (window.Stockfish && !Stockfish.available()) {
      engineCard.classList.add("warn");
      engineCard.classList.remove("ok");
      engineNameEl.textContent = "Built-in engine";
      engineSubEl.textContent = `Stockfish failed to load · ${label} ${BUILTIN_ELO[skill] || ""} Elo`;
    } else {
      engineCard.classList.remove("ok", "warn");
      engineNameEl.textContent = "Loading Stockfish…";
      engineSubEl.textContent = "Using built-in engine until ready";
    }
  }

  // ---- Rendering ----
  function render() {
    boardEl.innerHTML = "";
    const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const checkColor = E.inCheck(state, state.turn) ? state.turn : null;
    let checkSq = null;
    if (checkColor) {
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          if (state.board[r][c] === checkColor + "K") checkSq = [r, c];
    }

    for (const r of rows) {
      for (const c of cols) {
        const sq = document.createElement("div");
        sq.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
        sq.dataset.r = r;
        sq.dataset.c = c;

        if (selected && selected[0] === r && selected[1] === c) sq.classList.add("selected");
        if (lastMove &&
            ((lastMove.from[0] === r && lastMove.from[1] === c) ||
             (lastMove.to[0] === r && lastMove.to[1] === c))) {
          sq.classList.add("last-move");
        }
        if (checkSq && checkSq[0] === r && checkSq[1] === c) sq.classList.add("in-check");

        // coordinate labels on the edges
        if ((flipped ? c === 7 : c === 0)) {
          const rank = document.createElement("span");
          rank.className = "coord rank";
          rank.textContent = 8 - r;
          sq.appendChild(rank);
        }
        if ((flipped ? r === 0 : r === 7)) {
          const file = document.createElement("span");
          file.className = "coord file";
          file.textContent = E.FILES[c];
          sq.appendChild(file);
        }

        const piece = state.board[r][c];
        if (piece) {
          const p = document.createElement("div");
          p.className = "piece " + (E.colorOf(piece) === "w" ? "white" : "black");
          p.textContent = GLYPH[piece];
          sq.appendChild(p);
        }

        // legal-move hints for the selected piece
        const hint = legalForSelected.find((m) => m.to[0] === r && m.to[1] === c);
        if (hint) {
          const dot = document.createElement("span");
          dot.className = "hint" + (piece || hint.enPassant ? " capture" : "");
          sq.appendChild(dot);
        }

        boardEl.appendChild(sq);
      }
    }

    renderCaptured();
    renderStatus();
  }

  function renderStatus() {
    const status = E.gameStatus(state);
    statusEl.classList.remove("check", "over", "thinking");
    if (aiThinking) {
      statusEl.textContent = "Computer is thinking…";
      statusEl.classList.add("thinking");
      return;
    }
    const mover = state.turn === "w" ? "White" : "Black";
    const other = state.turn === "w" ? "Black" : "White";
    if (status === "checkmate") {
      statusEl.textContent = "Checkmate — " + other + " wins";
      statusEl.classList.add("over");
    } else if (status === "stalemate") {
      statusEl.textContent = "Stalemate — draw";
      statusEl.classList.add("over");
    } else if (status === "draw50") {
      statusEl.textContent = "Draw (50-move rule)";
      statusEl.classList.add("over");
    } else if (status === "check") {
      statusEl.textContent = mover + " to move — check!";
      statusEl.classList.add("check");
    } else {
      statusEl.textContent = mover + " to move";
    }
  }

  function renderCaptured() {
    // count pieces on board, compare to full set to find captured
    const full = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
    const onBoard = { w: {}, b: {} };
    let material = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (!p) continue;
        const col = E.colorOf(p), t = E.typeOf(p);
        onBoard[col][t] = (onBoard[col][t] || 0) + 1;
        if (t !== "K") material += (col === "w" ? 1 : -1) * PIECE_VALUE[t];
      }
    }
    const capturedBy = (byColor, lostColor) => {
      const arr = [];
      for (const t of Object.keys(full)) {
        const missing = full[t] - (onBoard[lostColor][t] || 0);
        for (let i = 0; i < missing; i++) arr.push(lostColor + t);
      }
      arr.sort((a, b) => PIECE_ORDER[E.typeOf(b)] - PIECE_ORDER[E.typeOf(a)]);
      return arr;
    };
    // White captured black pieces -> show on white's tray (bottom)
    fillTray(capturedWhiteEl, capturedBy("w", "b"), material > 0 ? "+" + material : "");
    fillTray(capturedBlackEl, capturedBy("b", "w"), material < 0 ? "+" + -material : "");
  }

  function fillTray(el, pieces, adv) {
    el.innerHTML = "";
    for (const p of pieces) {
      const span = document.createElement("span");
      span.className = "cap " + (E.colorOf(p) === "w" ? "white" : "black");
      span.textContent = GLYPH[p];
      el.appendChild(span);
    }
    if (adv) {
      const a = document.createElement("span");
      a.className = "adv";
      a.textContent = adv;
      el.appendChild(a);
    }
  }

  function renderHistory() {
    historyEl.innerHTML = "";
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement("li");
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = i / 2 + 1 + ".";
      const white = document.createElement("span");
      white.className = "ply";
      white.textContent = history[i].san;
      const black = document.createElement("span");
      black.className = "ply";
      black.textContent = history[i + 1] ? history[i + 1].san : "";
      li.appendChild(num);
      li.appendChild(white);
      li.appendChild(black);
      historyEl.appendChild(li);
    }
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  // ---- Interaction ----
  function onSquareClick(r, c) {
    if (aiThinking) return;
    if (isGameOver()) return;
    if (mode === "ai" && state.turn !== humanColor) return;

    const piece = state.board[r][c];

    // clicking a legal destination
    if (selected) {
      const move = legalForSelected.find((m) => m.to[0] === r && m.to[1] === c);
      if (move) {
        if (move.promotion) {
          askPromotion(move);
        } else {
          commitMove(move);
        }
        return;
      }
    }

    // (re)select own piece
    if (piece && E.colorOf(piece) === state.turn) {
      selected = [r, c];
      legalForSelected = E.legalMoves(state, state.turn).filter(
        (m) => m.from[0] === r && m.from[1] === c
      );
    } else {
      selected = null;
      legalForSelected = [];
    }
    render();
  }

  function askPromotion(baseMove) {
    // group promotion moves by piece for this from/to
    const color = state.turn;
    promotionBox.innerHTML = "";
    for (const t of ["Q", "R", "B", "N"]) {
      const btn = document.createElement("button");
      btn.textContent = GLYPH[color + t];
      btn.className = E.colorOf(color + t) === "w" ? "white" : "black";
      btn.addEventListener("click", () => {
        promotionEl.hidden = true;
        commitMove(Object.assign({}, baseMove, { promotion: t }));
      });
      promotionBox.appendChild(btn);
    }
    promotionEl.hidden = false;
  }

  function commitMove(move) {
    const san = E.moveToSAN(state, move);
    history.push({ state: state, move: move, san: san });
    state = E.applyMove(state, move);
    lastMove = { from: move.from, to: move.to };
    selected = null;
    legalForSelected = [];
    if (window.Sound) Sound.forMove(move, E.gameStatus(state));
    render();
    renderHistory();

    if (mode === "ai" && !isGameOver() && state.turn !== humanColor) {
      triggerAI();
    }
  }

  // Difficulty select stores Stockfish skill (0-20). Map to a think-time too:
  // weaker levels also think less, which further reduces strength and feels snappier.
  function skillToMovetime(skill) {
    if (skill <= 1) return 200;
    if (skill <= 4) return 400;
    if (skill <= 8) return 700;
    if (skill <= 14) return 1100;
    return 1600;
  }

  function triggerAI() {
    aiThinking = true;
    renderStatus();
    const skill = parseInt(diffSel.value, 10);
    const fen = E.toFEN(state);
    const moverColor = state.turn;

    if (useStockfish) {
      Stockfish.setStrength(skill);
      Stockfish.bestMove(fen, { movetime: skillToMovetime(skill) }).then((uci) => {
        // ignore stale results (user started a new game / undid while thinking)
        if (!aiThinking || state.turn !== moverColor) return;
        const move = uci ? E.moveFromUCI(state, uci) : null;
        aiThinking = false;
        if (move) commitMove(move);
        else fallbackAI(skill); // engine returned nothing unexpectedly
      }).catch(() => {
        aiThinking = false;
        useStockfish = false;
        updateEngineBadge();
        fallbackAI(skill);
      });
    } else {
      // homemade engine fallback (depth derived from skill)
      setTimeout(() => fallbackAI(skill), 30);
    }
  }

  function fallbackAI(skill) {
    aiThinking = true;
    setTimeout(() => {
      const depth = skill >= 14 ? 4 : skill >= 8 ? 3 : 2;
      const move = AI.bestMove(state, depth);
      aiThinking = false;
      if (move) commitMove(move);
      else render();
    }, 10);
  }

  function isGameOver() {
    const s = E.gameStatus(state);
    return s === "checkmate" || s === "stalemate" || s === "draw50";
  }

  // ---- Controls ----
  function newGame() {
    state = E.startPosition();
    history = [];
    selected = null;
    legalForSelected = [];
    lastMove = null;
    aiThinking = false;
    promotionEl.hidden = true;
    mode = modeSel.value;
    humanColor = sideSel.value;
    flipped = mode === "ai" && humanColor === "b";
    if (useStockfish) Stockfish.newGame();
    render();
    renderHistory();
    if (mode === "ai" && state.turn !== humanColor) triggerAI();
  }

  function undo() {
    if (aiThinking || history.length === 0) return;
    // In AI mode, undo a full pair so it's the human's turn again.
    const steps = mode === "ai" && history.length >= 2 ? 2 : 1;
    for (let i = 0; i < steps && history.length; i++) {
      state = history.pop().state;
    }
    const prev = history[history.length - 1];
    lastMove = prev ? { from: prev.move.from, to: prev.move.to } : null;
    selected = null;
    legalForSelected = [];
    render();
    renderHistory();
  }

  function updateControlVisibility() {
    const ai = modeSel.value === "ai";
    sideField.style.display = ai ? "" : "none";
    difficultyField.style.display = ai ? "" : "none";
  }

  document.getElementById("newGame").addEventListener("click", newGame);
  document.getElementById("undo").addEventListener("click", undo);
  document.getElementById("flip").addEventListener("click", () => {
    flipped = !flipped;
    render();
  });
  modeSel.addEventListener("change", () => {
    updateControlVisibility();
    newGame();
  });
  sideSel.addEventListener("change", newGame);
  diffSel.addEventListener("change", updateEngineBadge); // strength label; applies on next AI move

  const soundBtn = document.getElementById("sound");
  let soundOn = true;
  try {
    const saved = localStorage.getItem("chessSound");
    if (saved !== null) soundOn = saved === "1";
  } catch (e) {}
  function applySound() {
    if (window.Sound) Sound.setEnabled(soundOn);
    soundBtn.textContent = "Sound: " + (soundOn ? "On" : "Off");
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    try { localStorage.setItem("chessSound", soundOn ? "1" : "0"); } catch (e) {}
  }
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    applySound();
  });

  // Unlock the Web Audio context on the first user gesture (autoplay policy).
  function unlockAudioOnce() {
    if (window.Sound) Sound.unlock();
    window.removeEventListener("pointerdown", unlockAudioOnce);
    window.removeEventListener("keydown", unlockAudioOnce);
  }
  window.addEventListener("pointerdown", unlockAudioOnce);
  window.addEventListener("keydown", unlockAudioOnce);

  // ---- Boot ----
  boardEl.addEventListener("click", (e) => {
    const sq = e.target.closest(".square");
    if (!sq) return;
    onSquareClick(parseInt(sq.dataset.r, 10), parseInt(sq.dataset.c, 10));
  });

  updateControlVisibility();
  updateEngineBadge();
  applySound();
  render();
  renderHistory();

  // Load Stockfish in the background; fall back to the built-in engine if it fails.
  if (window.Stockfish) {
    Stockfish.init()
      .then(() => {
        useStockfish = true;
        updateEngineBadge();
        // If it's already the AI's turn and it was waiting on the built-in path, nudge it.
      })
      .catch(() => {
        useStockfish = false;
        updateEngineBadge();
      });
  } else {
    updateEngineBadge();
  }
})();
