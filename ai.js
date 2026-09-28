// ai.js — a simple but decent chess AI (negamax + alpha-beta + piece-square tables)
// Depends on the global `Engine`. Exposes global `AI`.

(function () {
  "use strict";

  const { legalMoves, applyMove, gameStatus, colorOf, typeOf } = Engine;

  const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  // Piece-square tables from White's point of view (row 0 = rank 8 / Black's side).
  const PST = {
    P: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [5, 5, 10, 25, 25, 10, 5, 5],
      [0, 0, 0, 20, 20, 0, 0, 0],
      [5, -5, -10, 0, 0, -10, -5, 5],
      [5, 10, 10, -20, -20, 10, 10, 5],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    N: [
      [-50, -40, -30, -30, -30, -30, -40, -50],
      [-40, -20, 0, 0, 0, 0, -20, -40],
      [-30, 0, 10, 15, 15, 10, 0, -30],
      [-30, 5, 15, 20, 20, 15, 5, -30],
      [-30, 0, 15, 20, 20, 15, 0, -30],
      [-30, 5, 10, 15, 15, 10, 5, -30],
      [-40, -20, 0, 5, 5, 0, -20, -40],
      [-50, -40, -30, -30, -30, -30, -40, -50],
    ],
    B: [
      [-20, -10, -10, -10, -10, -10, -10, -20],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-10, 0, 5, 10, 10, 5, 0, -10],
      [-10, 5, 5, 10, 10, 5, 5, -10],
      [-10, 0, 10, 10, 10, 10, 0, -10],
      [-10, 10, 10, 10, 10, 10, 10, -10],
      [-10, 5, 0, 0, 0, 0, 5, -10],
      [-20, -10, -10, -10, -10, -10, -10, -20],
    ],
    R: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [5, 10, 10, 10, 10, 10, 10, 5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [0, 0, 0, 5, 5, 0, 0, 0],
    ],
    Q: [
      [-20, -10, -10, -5, -5, -10, -10, -20],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-10, 0, 5, 5, 5, 5, 0, -10],
      [-5, 0, 5, 5, 5, 5, 0, -5],
      [0, 0, 5, 5, 5, 5, 0, -5],
      [-10, 5, 5, 5, 5, 5, 0, -10],
      [-10, 0, 5, 0, 0, 0, 0, -10],
      [-20, -10, -10, -5, -5, -10, -10, -20],
    ],
    K: [
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-20, -30, -30, -40, -40, -30, -30, -20],
      [-10, -20, -20, -20, -20, -20, -20, -10],
      [20, 20, 0, 0, 0, 0, 20, 20],
      [20, 30, 10, 0, 0, 10, 30, 20],
    ],
  };

  // Static evaluation from White's perspective (positive = good for White).
  function evaluate(s) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = s.board[r][c];
        if (!p) continue;
        const t = typeOf(p);
        if (colorOf(p) === "w") {
          score += VALUE[t] + PST[t][r][c];
        } else {
          score -= VALUE[t] + PST[t][7 - r][c]; // mirror table for Black
        }
      }
    }
    return score;
  }

  // Order captures first to make alpha-beta prune more.
  function orderMoves(moves) {
    return moves.slice().sort((a, b) => {
      const av = a.captured ? VALUE[typeOf(a.captured)] - VALUE[typeOf(a.piece)] / 10 : -1;
      const bv = b.captured ? VALUE[typeOf(b.captured)] - VALUE[typeOf(b.piece)] / 10 : -1;
      return bv - av;
    });
  }

  function search(s, depth, alpha, beta) {
    const status = gameStatus(s);
    if (status === "checkmate") return -100000 - depth; // side to move is mated
    if (status === "stalemate" || status === "draw50") return 0;
    if (depth === 0) {
      const sc = evaluate(s);
      return s.turn === "w" ? sc : -sc; // negamax: from side-to-move's view
    }
    let best = -Infinity;
    for (const m of orderMoves(legalMoves(s, s.turn))) {
      const val = -search(applyMove(s, m), depth - 1, -beta, -alpha);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Pick the best move for the side to move at the given search depth.
  function bestMove(s, depth) {
    let best = null;
    let bestVal = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    const moves = orderMoves(legalMoves(s, s.turn));
    for (const m of moves) {
      const val = -search(applyMove(s, m), depth - 1, -beta, -alpha);
      // small random tie-break so the AI isn't perfectly repetitive
      if (val > bestVal || (val === bestVal && Math.random() < 0.3)) {
        bestVal = val;
        best = m;
      }
      if (val > alpha) alpha = val;
    }
    return best;
  }

  window.AI = { bestMove, evaluate };
})();
