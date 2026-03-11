/**
 * Cờ Gánh (Ganh Chess) - Game Logic
 * OOP implementation with BoardTopology, GameState, and CoGanhGame.
 */

// ----- Board topology: adjacency map for 5x5 grid with diagonals -----
const BoardTopology = (() => {
  const PADDING = 10;
  const CELL = 20;

  /** Convert grid (x,y) to SVG (cx,cy) */
  function toSvg(x, y) {
    return [PADDING + x * CELL, PADDING + y * CELL];
  }

  /** Build adjacency: each point -> Set of connected neighbors */
  const ADJACENCY = new Map();
  const key = (x, y) => `${x},${y}`;

  // Horizontal lines: (i,j)-(i+1,j)
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 4; x++) {
      const a = key(x, y);
      const b = key(x + 1, y);
      if (!ADJACENCY.has(a)) ADJACENCY.set(a, new Set());
      if (!ADJACENCY.has(b)) ADJACENCY.set(b, new Set());
      ADJACENCY.get(a).add(b);
      ADJACENCY.get(b).add(a);
    }
  }
  // Vertical lines
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 4; y++) {
      const a = key(x, y);
      const b = key(x, y + 1);
      ADJACENCY.get(a).add(b);
      ADJACENCY.get(b).add(a);
    }
  }
  // Main diagonals (\): (0,0)-(2,2), (0,2)-(2,4), (2,0)-(4,2), (2,2)-(4,4)
  const mainDiags = [[0,0,2,2],[0,2,2,4],[2,0,4,2],[2,2,4,4]];
  for (const [x1,y1,x2,y2] of mainDiags) {
    for (let i = 0; i < 2; i++) {
      const a = key(x1 + i, y1 + i);
      const b = key(x1 + i + 1, y1 + i + 1);
      ADJACENCY.get(a).add(b);
      ADJACENCY.get(b).add(a);
    }
  }
  // Anti-diagonals (/): (0,2)-(2,0), (0,4)-(2,2), (2,2)-(4,0), (2,4)-(4,2)
  const antiDiags = [[0,2,2,0],[0,4,2,2],[2,2,4,0],[2,4,4,2]];
  for (const [x1,y1,x2,y2] of antiDiags) {
    const dx = x2 > x1 ? 1 : -1;
    const dy = y2 > y1 ? 1 : -1;
    for (let i = 0; i < 2; i++) {
      const ax = x1 + i * dx, ay = y1 + i * dy;
      const bx = x1 + (i + 1) * dx, by = y1 + (i + 1) * dy;
      const a = key(ax, ay);
      const b = key(bx, by);
      ADJACENCY.get(a).add(b);
      ADJACENCY.get(b).add(a);
    }
  }

  /** Get opposite neighbor: from P, neighbor A, return B such that P is between A and B on a line */
  function getOppositeNeighbor(px, py, ax, ay) {
    const bx = 2 * px - ax;
    const by = 2 * py - ay;
    if (bx < 0 || bx > 4 || by < 0 || by > 4) return null;
    const neighbors = ADJACENCY.get(key(px, py));
    if (!neighbors || !neighbors.has(key(bx, by))) return null;
    return [bx, by];
  }

  return {
    toSvg,
    key,
    getNeighbors(x, y) {
      return ADJACENCY.get(key(x, y)) || new Set();
    },
    /** Get jump target: from (fx,fy) over (mx,my) in direction to (tx,ty) */
    getJumpTarget(fx, fy, mx, my) {
      const tx = 2 * mx - fx;
      const ty = 2 * my - fy;
      if (tx < 0 || tx > 4 || ty < 0 || ty > 4) return null;
      const neighbors = this.getNeighbors(mx, my);
      if (!neighbors.has(key(tx, ty))) return null;
      return [tx, ty];
    },
    getOppositeNeighbor
  };
})();

// ----- Game state: pieces map, turn, selection -----
class GameState {
  constructor() {
    this.pieces = new Map(); // key(x,y) -> 'red' | 'blue'
    this.currentTurn = 'blue'; // Blue goes first
    this.selectedPiece = null; // [x,y] or null
    this.validMoves = new Set(); // Set of key(x,y)
    this.chainMove = false; // true after a capture: player can move again only if move captures
    this.chainMovePiece = null; // [x,y] - only this piece can make subsequent move when chainMove
    this._initPieces();
  }

  _initPieces() {
    // Red: 5 on row 0, 2 on edges of row 1, 1 at (4,2) right side of row 2
    const redPositions = [
      [0,0],[1,0],[2,0],[3,0],[4,0],
      [0,1],[4,1],
      [4,2]
    ];
    // Blue: symmetric mirror (5 on row 4, 2 on edges of row 3, 1 at (0,2) left side of row 2)
    const bluePositions = [
      [0,4],[1,4],[2,4],[3,4],[4,4],
      [0,3],[4,3],
      [0,2]
    ];
    for (const [x, y] of redPositions) {
      this.pieces.set(BoardTopology.key(x, y), 'red');
    }
    for (const [x, y] of bluePositions) {
      this.pieces.set(BoardTopology.key(x, y), 'blue');
    }
  }

  getPiece(x, y) {
    return this.pieces.get(BoardTopology.key(x, y)) || null;
  }

  isEmpty(x, y) {
    return !this.getPiece(x, y);
  }

  isEnemy(x, y) {
    const p = this.getPiece(x, y);
    return p && p !== this.currentTurn;
  }

  isOwnPiece(x, y) {
    return this.getPiece(x, y) === this.currentTurn;
  }

  /**
   * Count how many enemy pieces would be captured by moving from (fx,fy) to (tx,ty).
   * Includes: (1) jump-over capture, (2) gánh (landing between 2 enemies).
   */
  _countCaptures(fx, fy, tx, ty) {
    const captured = new Set();
    const key = BoardTopology.key;

    // Jump capture: piece at midpoint is enemy
    const mx = (fx + tx) / 2, my = (fy + ty) / 2;
    if (Number.isInteger(mx) && Number.isInteger(my) && this.isEnemy(mx, my)) {
      captured.add(key(mx, my));
    }

    // Gánh: landing at (tx,ty) between 2 enemies on a line
    const neighbors = BoardTopology.getNeighbors(tx, ty);
    for (const nKey of neighbors) {
      const [ax, ay] = nKey.split(',').map(Number);
      const opp = BoardTopology.getOppositeNeighbor(tx, ty, ax, ay);
      if (opp && this.isEnemy(ax, ay) && this.isEnemy(opp[0], opp[1])) {
        captured.add(nKey);
        captured.add(key(opp[0], opp[1]));
      }
    }
    return captured.size;
  }

  /** Compute valid destinations from (fx, fy). If chainMoveOnly, only moves that capture. */
  computeValidMoves(fx, fy, chainMoveOnly = false) {
    const moves = new Set();
    const neighbors = BoardTopology.getNeighbors(fx, fy);

    for (const nKey of neighbors) {
      const [nx, ny] = nKey.split(',').map(Number);
      if (this.isEmpty(nx, ny)) {
        const destKey = nKey;
        if (!chainMoveOnly || this._countCaptures(fx, fy, nx, ny) > 0) {
          moves.add(destKey);
        }
      } else if (this.isEnemy(nx, ny)) {
        const jump = BoardTopology.getJumpTarget(fx, fy, nx, ny);
        if (jump && this.isEmpty(jump[0], jump[1])) {
          const destKey = BoardTopology.key(jump[0], jump[1]);
          if (!chainMoveOnly || this._countCaptures(fx, fy, jump[0], jump[1]) > 0) {
            moves.add(destKey);
          }
        }
      }
    }
    return moves;
  }

  /** Check if any piece of current player has a capturing move */
  _hasAnyCapturingMove() {
    return this.getChainMovePieces().length > 0;
  }

  /** Pieces that can make a capturing move (when chainMove). Only the piece that just moved. */
  getChainMovePieces() {
    if (!this.chainMove || !this.chainMovePiece) return [];
    const [x, y] = this.chainMovePiece;
    if (!this.isOwnPiece(x, y) || this.computeValidMoves(x, y, true).size === 0) return [];
    return [[x, y]];
  }

  /** All valid destinations for chain move (union of all capturing moves) */
  getChainMoveDestinations() {
    const dests = new Set();
    for (const [x, y] of this.getChainMovePieces()) {
      for (const k of this.computeValidMoves(x, y, true)) {
        dests.add(k);
      }
    }
    return dests;
  }

  /** Pieces that can move to (tx,ty) with a capturing move (when chainMove) */
  getPiecesThatCanMoveTo(tx, ty) {
    const destKey = BoardTopology.key(tx, ty);
    const pieces = [];
    for (const [x, y] of this.getChainMovePieces()) {
      if (this.computeValidMoves(x, y, true).has(destKey)) {
        pieces.push([x, y]);
      }
    }
    return pieces;
  }

  selectPiece(x, y) {
    if (!this.isOwnPiece(x, y)) return false;
    if (this.chainMove) {
      if (!this.chainMovePiece || (x !== this.chainMovePiece[0] || y !== this.chainMovePiece[1])) return false;
    }
    if (this.chainMove && !this._hasAnyCapturingMove()) {
      this.chainMove = false;
      this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
      return false;
    }
    this.selectedPiece = [x, y];
    this.validMoves = this.computeValidMoves(x, y, this.chainMove);
    if (this.chainMove && this.validMoves.size === 0) {
      this.chainMove = false;
      this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
      return false;
    }
    return true;
  }

  moveTo(tx, ty) {
    const destKey = BoardTopology.key(tx, ty);
    if (!this.selectedPiece || !this.validMoves.has(destKey)) return false;
    const [fx, fy] = this.selectedPiece;

    // 1. Move our piece first
    this.pieces.delete(BoardTopology.key(fx, fy));
    this.pieces.set(destKey, this.currentTurn);

    // 2. Jump capture: remove piece we flew over (before sandwich check)
    const mx = (fx + tx) / 2, my = (fy + ty) / 2;
    let anyCapture = false;
    if (Number.isInteger(mx) && Number.isInteger(my) && this.isEnemy(mx, my)) {
      this.pieces.delete(BoardTopology.key(mx, my));
      anyCapture = true;
    }

    // 3. Gánh: after jump removal, check if we land between 2 enemies
    const captured = new Set();
    const neighbors = BoardTopology.getNeighbors(tx, ty);
    for (const nKey of neighbors) {
      const [ax, ay] = nKey.split(',').map(Number);
      const opp = BoardTopology.getOppositeNeighbor(tx, ty, ax, ay);
      if (opp && this.isEnemy(ax, ay) && this.isEnemy(opp[0], opp[1])) {
        captured.add(nKey);
        captured.add(BoardTopology.key(opp[0], opp[1]));
      }
    }
    for (const k of captured) {
      this.pieces.delete(k);
    }
    anyCapture = anyCapture || captured.size > 0;

    this.selectedPiece = null;
    this.validMoves = new Set();

    if (anyCapture) {
      this.chainMove = true;
      this.chainMovePiece = [tx, ty];
      if (!this._hasAnyCapturingMove()) {
        this.chainMove = false;
        this.chainMovePiece = null;
        this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
      }
    } else {
      this.chainMove = false;
      this.chainMovePiece = null;
      this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
    }
    return true;
  }

  clearSelection() {
    this.selectedPiece = null;
    this.validMoves = new Set();
  }

  /** Reset to initial state */
  reset() {
    this.pieces.clear();
    this.currentTurn = 'blue';
    this.selectedPiece = null;
    this.validMoves = new Set();
    this.chainMove = false;
    this.chainMovePiece = null;
    this._initPieces();
  }

  /** Clone state for AI simulation */
  clone() {
    const c = new GameState();
    c.pieces = new Map(this.pieces);
    c.currentTurn = this.currentTurn;
    c.selectedPiece = this.selectedPiece ? [...this.selectedPiece] : null;
    c.validMoves = new Set(this.validMoves);
    c.chainMove = this.chainMove;
    c.chainMovePiece = this.chainMovePiece ? [...this.chainMovePiece] : null;
    return c;
  }

  /** Get all moves for current player. Returns [{from:[x,y], to:[tx,ty]}, ...] */
  getAllMoves() {
    const moves = [];
    const chainOnly = this.chainMove;
    const piecesToCheck = this.chainMove && this.chainMovePiece
      ? [this.chainMovePiece]
      : (() => {
          const list = [];
          for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
            if (this.isOwnPiece(x, y)) list.push([x, y]);
          }
          return list;
        })();
    for (const [x, y] of piecesToCheck) {
      const dests = this.computeValidMoves(x, y, chainOnly);
      for (const k of dests) {
        const [tx, ty] = k.split(',').map(Number);
        moves.push({ from: [x, y], to: [tx, ty] });
      }
    }
    return moves;
  }

  /** Apply a move (mutates state). Returns true if valid. Handles chain by applying until turn switches. */
  applyMove(fx, fy, tx, ty) {
    this.selectedPiece = [fx, fy];
    this.validMoves = this.computeValidMoves(fx, fy, this.chainMove);
    if (!this.validMoves.has(BoardTopology.key(tx, ty))) return false;
    this.moveTo(tx, ty);
    while (this.chainMove && this._hasAnyCapturingMove()) {
      const chainPieces = this.getChainMovePieces();
      if (chainPieces.length === 0) break;
      const [px, py] = chainPieces[0];
      const dests = this.computeValidMoves(px, py, true);
      const destKey = dests.values().next().value;
      if (!destKey) break;
      const [dx, dy] = destKey.split(',').map(Number);
      this.selectedPiece = [px, py];
      this.validMoves = this.computeValidMoves(px, py, true);
      this.moveTo(dx, dy);
    }
    return true;
  }

  /** Count pieces for a side */
  countPieces(side) {
    let n = 0;
    for (const [, s] of this.pieces) {
      if (s === side) n++;
    }
    return n;
  }
}

// ----- Computer AI: 2-step lookahead minimax -----
const COMPUTER_SIDE = 'red';
const HUMAN_SIDE = 'blue';

class CoGanhAI {
  static CAPTURE_BONUS = 15; // Bonus per captured piece to prefer high-capture moves

  /** Evaluate state for computer (red). Positive = good for computer. */
  static evaluate(state) {
    const blue = state.countPieces('blue');
    const red = state.countPieces('red');
    if (red === 0) return -100;
    if (blue === 0) return 100;
    return red - blue;
  }

  /** Get best move for computer. Prefers moves that capture more enemies. Thinks 2 steps ahead. */
  static getBestMove(state) {
    const moves = state.getAllMoves();
    if (moves.length === 0) return null;

    // Sort by capture count (desc) so we try high-capture moves first; tie-break by score
    const movesWithCaptures = moves.map(move => ({
      move,
      captureCount: state._countCaptures(move.from[0], move.from[1], move.to[0], move.to[1])
    }));
    movesWithCaptures.sort((a, b) => b.captureCount - a.captureCount);

    let bestScore = -Infinity;
    let bestMove = moves[0];

    for (const { move, captureCount } of movesWithCaptures) {
      const humanBefore = state.countPieces(HUMAN_SIDE);
      const child = state.clone();
      child.applyMove(move.from[0], move.from[1], move.to[0], move.to[1]);
      const humanAfter = child.countPieces(HUMAN_SIDE);
      const totalCaptures = humanBefore - humanAfter;

      let score;
      if (child.countPieces(HUMAN_SIDE) === 0) {
        score = 100;
      } else {
        const oppMoves = child.getAllMoves();
        if (oppMoves.length === 0) {
          score = this.evaluate(child);
        } else {
          let minOppScore = Infinity;
          for (const oppMove of oppMoves) {
            const grandChild = child.clone();
            grandChild.applyMove(oppMove.from[0], oppMove.from[1], oppMove.to[0], oppMove.to[1]);
            const s = this.evaluate(grandChild);
            minOppScore = Math.min(minOppScore, s);
          }
          score = minOppScore;
        }
      }

      score += totalCaptures * this.CAPTURE_BONUS;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }
}

// ----- Game controller: view + event handling -----
class CoGanhGame {
  constructor() {
    this.state = new GameState();
    this.mode = '2players'; // '2players' | 'vsComputer'
    this.gameOver = null; // 'blue' | 'red' when game ended
    this.cellsEl = document.getElementById('cells');
    this.turnEl = document.getElementById('turnIndicator');
    this.modeBtn = document.getElementById('modeBtn');
    this.gameOverOverlay = document.getElementById('gameOverOverlay');
    this.gameOverMessage = document.getElementById('gameOverMessage');
    this.cellElements = new Map(); // key(x,y) -> SVG circle element
    this._createCells();
    this._render();
    this._bindEvents();
  }

  _reset() {
    this.gameOver = null;
    this.gameOverOverlay.classList.remove('visible');
    this.state.reset();
    this._render();
    if (this.mode === 'vsComputer' && this.state.currentTurn === COMPUTER_SIDE) {
      setTimeout(() => this._computerMove(), 400);
    }
  }

  _switchMode() {
    this.mode = this.mode === '2players' ? 'vsComputer' : '2players';
    this.modeBtn.textContent = this.mode === '2players' ? '2 players' : 'vs computer';
    this._reset();
  }

  _checkGameOver() {
    if (this.gameOver) return;
    const blue = this.state.countPieces('blue');
    const red = this.state.countPieces('red');
    if (red === 0) {
      this.gameOver = 'blue';
    } else if (blue === 0) {
      this.gameOver = 'red';
    } else {
      return;
    }
    let msg;
    if (this.mode === 'vsComputer') {
      msg = this.gameOver === HUMAN_SIDE ? 'Player win' : 'Computer win';
    } else {
      msg = this.gameOver === 'blue' ? 'Blue win' : 'Red win';
    }
    this.gameOverMessage.textContent = msg;
    this.gameOverOverlay.classList.add('visible');
  }

  _computerMove() {
    if (this.state.currentTurn !== COMPUTER_SIDE || this.mode !== 'vsComputer') return;
    const move = CoGanhAI.getBestMove(this.state);
    if (!move) return;
    this.state.selectPiece(move.from[0], move.from[1]);
    this.state.moveTo(move.to[0], move.to[1]);
    this._render();
    if (this.state.chainMove && this.state.currentTurn === COMPUTER_SIDE && this.state._hasAnyCapturingMove()) {
      setTimeout(() => this._computerMove(), 250);
    }
  }

  _createCells() {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const [cx, cy] = BoardTopology.toSvg(x, y);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', 3);
        circle.setAttribute('class', 'cell');
        circle.dataset.x = x;
        circle.dataset.y = y;
        this.cellsEl.appendChild(circle);
        this.cellElements.set(BoardTopology.key(x, y), circle);
      }
    }
  }

  _render() {
    let text;
    if (this.mode === 'vsComputer') {
      text = this.state.currentTurn === HUMAN_SIDE ? 'Player turn' : 'Computer turn';
    } else {
      text = this.state.currentTurn === 'red' ? 'Red turn' : 'Blue turn';
    }
    if (this.state.chainMove) text += ' (capture again)';
    this.turnEl.textContent = text;
    this.turnEl.className = 'turn-indicator ' + this.state.currentTurn;

    // When chain move and no selection: highlight all pieces that can capture + their destinations
    const chainPieces = this.state.chainMove && !this.state.selectedPiece
      ? this.state.getChainMovePieces()
      : [];
    const chainDests = this.state.chainMove && !this.state.selectedPiece
      ? this.state.getChainMoveDestinations()
      : new Set();

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const key = BoardTopology.key(x, y);
        const el = this.cellElements.get(key);
        const piece = this.state.getPiece(x, y);
        const isSelected = this.state.selectedPiece
          ? this.state.selectedPiece[0] === x && this.state.selectedPiece[1] === y
          : chainPieces.some(([px, py]) => px === x && py === y);
        const isValidDest = this.state.validMoves.has(key) || chainDests.has(key);

        el.classList.remove('piece-red', 'piece-blue', 'selected', 'valid-dest');
        if (piece) {
          el.classList.add('piece-' + piece);
        }
        if (isSelected) el.classList.add('selected');
        if (isValidDest) el.classList.add('valid-dest');

        // Cursor: pointer for own pieces and valid destinations
        const isOwn = piece === this.state.currentTurn;
        const isEmptyAndValidDest = !piece && isValidDest;
        el.style.cursor = (isOwn || isEmptyAndValidDest) ? 'pointer' : 'default';
      }
    }
    this._checkGameOver();
  }

  _bindEvents() {
    document.getElementById('resetBtn').addEventListener('click', () => this._reset());
    this.modeBtn.addEventListener('click', () => this._switchMode());

    this.cellsEl.addEventListener('click', (e) => {
      if (this.gameOver) return;
      if (this.mode === 'vsComputer' && this.state.currentTurn === COMPUTER_SIDE) return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      const x = parseInt(cell.dataset.x, 10);
      const y = parseInt(cell.dataset.y, 10);

      if (this.state.isOwnPiece(x, y)) {
        if (this.state.chainMove && this.state.getChainMovePieces().some(([px, py]) => px === x && py === y)) {
          this.state.chainMove = false;
          this.state.currentTurn = this.state.currentTurn === 'red' ? 'blue' : 'red';
          this.state.clearSelection();
        } else {
          this.state.selectPiece(x, y);
        }
      } else if (this.state.validMoves.has(BoardTopology.key(x, y))) {
        this.state.moveTo(x, y);
      } else if (this.state.chainMove && !this.state.selectedPiece) {
        const pieces = this.state.getPiecesThatCanMoveTo(x, y);
        if (pieces.length > 0) {
          this.state.selectedPiece = pieces[0];
          this.state.validMoves = this.state.computeValidMoves(pieces[0][0], pieces[0][1], true);
          this.state.moveTo(x, y);
        } else {
          const isChainDest = this.state.getChainMoveDestinations().has(BoardTopology.key(x, y));
          if (!isChainDest) {
            this.state.chainMove = false;
            this.state.currentTurn = this.state.currentTurn === 'red' ? 'blue' : 'red';
          }
          this.state.clearSelection();
        }
      } else {
        if (this.state.chainMove) {
          const isChainDest = this.state.getChainMoveDestinations().has(BoardTopology.key(x, y));
          if (!isChainDest) {
            this.state.chainMove = false;
            this.state.currentTurn = this.state.currentTurn === 'red' ? 'blue' : 'red';
          }
        }
        this.state.clearSelection();
      }
      this._render();
      if (this.mode === 'vsComputer' && this.state.currentTurn === COMPUTER_SIDE) {
        setTimeout(() => this._computerMove(), 400);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CoGanhGame();
});
