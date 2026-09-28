// engine.js — chess rules and game logic (no dependencies, plain script)
// Exposes a global `Engine` object.

(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function inside(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function colorOf(piece) {
    return piece ? piece[0] : null;
  }
  function typeOf(piece) {
    return piece ? piece[1] : null;
  }
  function enemy(color) {
    return color === "w" ? "b" : "w";
  }
  function squareName(r, c) {
    return FILES[c] + (8 - r);
  }

  function startPosition() {
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let c = 0; c < 8; c++) {
      board[0][c] = "b" + back[c];
      board[1][c] = "bP";
      board[6][c] = "wP";
      board[7][c] = "w" + back[c];
    }
    return {
      board,
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null, // [r,c] square a pawn may capture onto
      halfmove: 0, // for 50-move rule
      fullmove: 1,
    };
  }

  function cloneState(s) {
    return {
      board: s.board.map((row) => row.slice()),
      turn: s.turn,
      castling: { ...s.castling },
      enPassant: s.enPassant ? [...s.enPassant] : null,
      halfmove: s.halfmove,
      fullmove: s.fullmove,
    };
  }

  const KNIGHT_MOVES = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_MOVES = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Pseudo-legal moves for a single piece (ignores leaving own king in check).
  function pseudoMoves(s, r, c) {
    const piece = s.board[r][c];
    if (!piece) return [];
    const color = colorOf(piece);
    const type = typeOf(piece);
    const moves = [];
    const add = (tr, tc, extra) => {
      moves.push(Object.assign({ from: [r, c], to: [tr, tc], piece, captured: s.board[tr][tc] }, extra || {}));
    };

    if (type === "P") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const promoRow = color === "w" ? 0 : 7;
      // one forward
      if (inside(r + dir, c) && !s.board[r + dir][c]) {
        if (r + dir === promoRow) {
          for (const p of ["Q", "R", "B", "N"]) add(r + dir, c, { promotion: p });
        } else {
          add(r + dir, c);
          // two forward
          if (r === startRow && !s.board[r + 2 * dir][c]) add(r + 2 * dir, c, { double: true });
        }
      }
      // diagonal captures + en passant
      for (const dc of [-1, 1]) {
        const tr = r + dir, tc = c + dc;
        if (!inside(tr, tc)) continue;
        const target = s.board[tr][tc];
        if (target && colorOf(target) === enemy(color)) {
          if (tr === promoRow) {
            for (const p of ["Q", "R", "B", "N"]) add(tr, tc, { promotion: p });
          } else {
            add(tr, tc);
          }
        }
        if (s.enPassant && s.enPassant[0] === tr && s.enPassant[1] === tc) {
          moves.push({ from: [r, c], to: [tr, tc], piece, captured: s.board[r][tc], enPassant: true });
        }
      }
    } else if (type === "N") {
      for (const [dr, dc] of KNIGHT_MOVES) {
        const tr = r + dr, tc = c + dc;
        if (inside(tr, tc) && colorOf(s.board[tr][tc]) !== color) add(tr, tc);
      }
    } else if (type === "K") {
      for (const [dr, dc] of KING_MOVES) {
        const tr = r + dr, tc = c + dc;
        if (inside(tr, tc) && colorOf(s.board[tr][tc]) !== color) add(tr, tc);
      }
    } else {
      const dirs = type === "B" ? BISHOP_DIRS : type === "R" ? ROOK_DIRS : BISHOP_DIRS.concat(ROOK_DIRS);
      for (const [dr, dc] of dirs) {
        let tr = r + dr, tc = c + dc;
        while (inside(tr, tc)) {
          const target = s.board[tr][tc];
          if (!target) {
            add(tr, tc);
          } else {
            if (colorOf(target) === enemy(color)) add(tr, tc);
            break;
          }
          tr += dr;
          tc += dc;
        }
      }
    }
    return moves;
  }

  // Is square (r,c) attacked by any piece of `byColor`?
  function isSquareAttacked(s, r, c, byColor) {
    const dir = byColor === "w" ? -1 : 1; // pawns of byColor move in this direction
    for (const dc of [-1, 1]) {
      const pr = r - dir, pc = c + dc;
      if (inside(pr, pc) && s.board[pr][pc] === byColor + "P") return true;
    }
    for (const [dr, dc] of KNIGHT_MOVES) {
      const pr = r + dr, pc = c + dc;
      if (inside(pr, pc) && s.board[pr][pc] === byColor + "N") return true;
    }
    for (const [dr, dc] of KING_MOVES) {
      const pr = r + dr, pc = c + dc;
      if (inside(pr, pc) && s.board[pr][pc] === byColor + "K") return true;
    }
    for (const [dr, dc] of BISHOP_DIRS) {
      let pr = r + dr, pc = c + dc;
      while (inside(pr, pc)) {
        const p = s.board[pr][pc];
        if (p) {
          if (colorOf(p) === byColor && (typeOf(p) === "B" || typeOf(p) === "Q")) return true;
          break;
        }
        pr += dr; pc += dc;
      }
    }
    for (const [dr, dc] of ROOK_DIRS) {
      let pr = r + dr, pc = c + dc;
      while (inside(pr, pc)) {
        const p = s.board[pr][pc];
        if (p) {
          if (colorOf(p) === byColor && (typeOf(p) === "R" || typeOf(p) === "Q")) return true;
          break;
        }
        pr += dr; pc += dc;
      }
    }
    return false;
  }

  function findKing(s, color) {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) if (s.board[r][c] === color + "K") return [r, c];
    return null;
  }

  function inCheck(s, color) {
    const k = findKing(s, color);
    if (!k) return false;
    return isSquareAttacked(s, k[0], k[1], enemy(color));
  }

  // Apply a move and return a NEW state (does not mutate input).
  function applyMove(s, move) {
    const ns = cloneState(s);
    const { from, to, piece } = move;
    const color = colorOf(piece);
    const type = typeOf(piece);

    ns.board[from[0]][from[1]] = null;
    if (move.enPassant) ns.board[from[0]][to[1]] = null;
    ns.board[to[0]][to[1]] = move.promotion ? color + move.promotion : piece;

    // castling: relocate the rook
    if (type === "K" && Math.abs(to[1] - from[1]) === 2) {
      const row = from[0];
      if (to[1] === 6) {
        ns.board[row][5] = ns.board[row][7];
        ns.board[row][7] = null;
      } else if (to[1] === 2) {
        ns.board[row][3] = ns.board[row][0];
        ns.board[row][0] = null;
      }
    }

    if (type === "K") {
      if (color === "w") { ns.castling.wK = false; ns.castling.wQ = false; }
      else { ns.castling.bK = false; ns.castling.bQ = false; }
    }
    const touch = (r, c) => {
      if (r === 7 && c === 0) ns.castling.wQ = false;
      if (r === 7 && c === 7) ns.castling.wK = false;
      if (r === 0 && c === 0) ns.castling.bQ = false;
      if (r === 0 && c === 7) ns.castling.bK = false;
    };
    touch(from[0], from[1]);
    touch(to[0], to[1]);

    ns.enPassant = null;
    if (type === "P" && Math.abs(to[0] - from[0]) === 2) {
      ns.enPassant = [(from[0] + to[0]) / 2, from[1]];
    }

    if (type === "P" || move.captured) ns.halfmove = 0;
    else ns.halfmove++;
    if (color === "b") ns.fullmove++;
    ns.turn = enemy(color);
    return ns;
  }

  function castlingMoves(s, color) {
    const moves = [];
    const row = color === "w" ? 7 : 0;
    if (s.board[row][4] !== color + "K") return moves;
    if (inCheck(s, color)) return moves;
    const R = s.castling;
    const foe = enemy(color);
    // king side
    if ((color === "w" ? R.wK : R.bK) &&
        !s.board[row][5] && !s.board[row][6] && s.board[row][7] === color + "R" &&
        !isSquareAttacked(s, row, 5, foe) && !isSquareAttacked(s, row, 6, foe)) {
      moves.push({ from: [row, 4], to: [row, 6], piece: color + "K", castle: "K" });
    }
    // queen side
    if ((color === "w" ? R.wQ : R.bQ) &&
        !s.board[row][3] && !s.board[row][2] && !s.board[row][1] && s.board[row][0] === color + "R" &&
        !isSquareAttacked(s, row, 3, foe) && !isSquareAttacked(s, row, 2, foe)) {
      moves.push({ from: [row, 4], to: [row, 2], piece: color + "K", castle: "Q" });
    }
    return moves;
  }

  // All fully-legal moves for the side to move (or a given color).
  function legalMoves(s, color) {
    color = color || s.turn;
    const pseudo = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (colorOf(s.board[r][c]) === color) pseudo.push.apply(pseudo, pseudoMoves(s, r, c));
    pseudo.push.apply(pseudo, castlingMoves(s, color));
    return pseudo.filter((m) => !inCheck(applyMove(s, m), color));
  }

  function gameStatus(s) {
    const moves = legalMoves(s, s.turn);
    const check = inCheck(s, s.turn);
    if (moves.length === 0) return check ? "checkmate" : "stalemate";
    if (s.halfmove >= 100) return "draw50";
    return check ? "check" : "normal";
  }

  // Standard Algebraic Notation for a move made in state s.
  function moveToSAN(s, move) {
    const type = typeOf(move.piece);
    if (type === "K" && Math.abs(move.to[1] - move.from[1]) === 2) {
      return move.to[1] === 6 ? "O-O" : "O-O-O";
    }
    const dest = squareName(move.to[0], move.to[1]);
    const capture = !!move.captured || !!move.enPassant;
    let san = "";
    if (type === "P") {
      if (capture) san += FILES[move.from[1]] + "x";
      san += dest;
      if (move.promotion) san += "=" + move.promotion;
    } else {
      san += type;
      const others = legalMoves(s, colorOf(move.piece)).filter(
        (m) =>
          typeOf(m.piece) === type &&
          m.to[0] === move.to[0] && m.to[1] === move.to[1] &&
          !(m.from[0] === move.from[0] && m.from[1] === move.from[1])
      );
      if (others.length) {
        const sameFile = others.some((m) => m.from[1] === move.from[1]);
        const sameRank = others.some((m) => m.from[0] === move.from[0]);
        if (!sameFile) san += FILES[move.from[1]];
        else if (!sameRank) san += 8 - move.from[0];
        else san += squareName(move.from[0], move.from[1]);
      }
      if (capture) san += "x";
      san += dest;
    }
    const ns = applyMove(s, move);
    const st = gameStatus(ns);
    if (st === "checkmate") san += "#";
    else if (inCheck(ns, ns.turn)) san += "+";
    return san;
  }

  // Full FEN string for the position (what UCI engines like Stockfish expect).
  function toFEN(s) {
    let rows = [];
    for (let r = 0; r < 8; r++) {
      let row = "";
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = s.board[r][c];
        if (!p) {
          empty++;
        } else {
          if (empty) { row += empty; empty = 0; }
          const letter = typeOf(p);
          row += colorOf(p) === "w" ? letter : letter.toLowerCase();
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    const placement = rows.join("/");
    const turn = s.turn;
    let castle = "";
    if (s.castling.wK) castle += "K";
    if (s.castling.wQ) castle += "Q";
    if (s.castling.bK) castle += "k";
    if (s.castling.bQ) castle += "q";
    if (!castle) castle = "-";
    const ep = s.enPassant ? squareName(s.enPassant[0], s.enPassant[1]) : "-";
    return `${placement} ${turn} ${castle} ${ep} ${s.halfmove} ${s.fullmove}`;
  }

  // Find the legal move object matching a UCI string like "e2e4" or "e7e8q".
  function moveFromUCI(s, uci) {
    const files = "abcdefgh";
    const fc = files.indexOf(uci[0]);
    const fr = 8 - parseInt(uci[1], 10);
    const tc = files.indexOf(uci[2]);
    const tr = 8 - parseInt(uci[3], 10);
    const promo = uci[4] ? uci[4].toUpperCase() : null;
    return legalMoves(s).find(
      (m) =>
        m.from[0] === fr && m.from[1] === fc &&
        m.to[0] === tr && m.to[1] === tc &&
        (promo ? m.promotion === promo : !m.promotion)
    ) || null;
  }

  window.Engine = {
    toFEN,
    moveFromUCI,
    FILES,
    startPosition,
    cloneState,
    colorOf,
    typeOf,
    enemy,
    squareName,
    pseudoMoves,
    legalMoves,
    applyMove,
    inCheck,
    isSquareAttacked,
    gameStatus,
    moveToSAN,
  };
})();
