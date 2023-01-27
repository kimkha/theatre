
class MazeData {
  constructor(width, height) {
    this.nodeWidth = width;
    this.nodeHeight = height;
    this.realWidth = width * 2 + 1;
    this.realHeight = height * 2 + 1;
    // Falsy array, nodes = unvisited, wall = blocked
    this.arr = Array.from({ length: this.realHeight }, () => Array.from({ length: this.realWidth }, () => false ));
  }

  toDisplayNodes() {
    const result = [];
    for (let y = 0; y < this.nodeHeight; y++) {
      const realY = y * 2 + 1;
      result[y] = [];
      for (let x = 0; x < this.nodeWidth; x++) {
        const realX = x * 2 + 1;
        const topBorder = !this.arr[realY - 1][realX];
        const bottomBorder = !this.arr[realY + 1][realX];
        const leftBorder = !this.arr[realY][realX - 1];
        const rightBorder = !this.arr[realY][realX + 1];

        const displayNode = new DisplayNode(x, y);
        displayNode.setBorder(topBorder, rightBorder, bottomBorder, leftBorder);
        result[y].push(displayNode);
      }
    }
    return result;
  }

  findWalkableNodes(x, y) {
    const realX = x * 2 + 1;
    const realY = y * 2 + 1;

    const result = [];
    if (this.#isPassedWall(realX - 1, realY)) {
      result.push({ x: x - 1, y });
    }
    if (this.#isPassedWall(realX + 1, realY)) {
      result.push({ x: x + 1, y });
    }
    if (this.#isPassedWall(realX, realY - 1)) {
      result.push({ x, y: y - 1 });
    }
    if (this.#isPassedWall(realX, realY + 1)) {
      result.push({ x, y: y + 1 });
    }
    return result;
  }

  fastTrack(prevPos, currPos) {
    const walkable = this.findWalkableNodes(currPos.x, currPos.y).filter(pos => pos.x !== prevPos.x || pos.y !== prevPos.y);
    if (walkable.length !== 1) {
      // Maybe the end of block or may need to choose next
      return [currPos];
    } else {
      // Only one node next
      const nextPos = walkable[0];
      const stack = this.fastTrack(currPos, nextPos);
      stack.unshift(currPos);
      return stack;
    }
  }

  #isNode(realX, realY) {
    return realX >= 0 && realY >= 0 && realX < this.realWidth && realY < this.realHeight && realX % 2 === 1 && realY % 2 === 1;
  }

  #isWall(realX, realY) {
    return realX >= 0 && realY >= 0 && realX < this.realWidth && realY < this.realHeight && (realX % 2 !== 1 || realY % 2 !== 1);
  }

  #isPassedWall(realX, realY) {
    return this.#isWall(realX, realY) && this.arr[realY][realX];
  }

  #makePath(realXFrom, realYFrom, realXTo, realYTo) {
    const realX = (realXTo + realXFrom) / 2;
    const realY = (realYTo + realYFrom) / 2;
    if (this.#isWall(realX, realY) || this.arr[realY][realX]) {
      this.arr[realY][realX] = true;
    }
  }

  #markVisited(realX, realY) {
    if (!this.arr[realY][realX]) {
      this.arr[realY][realX] = true;
      return true;
    }
    return false;
  }

  #isUnvisited(realX, realY) {
    return this.#isNode(realX, realY) && !this.arr[realY][realX];
  }

  #findAdjacentUnvisitedNodes(x, y) {
    const realX = x * 2 + 1;
    const realY = y * 2 + 1;

    const result = [];
    if (this.#isUnvisited(realX - 2, realY)) {
      result.push({ x: x - 1, y });
    }
    if (this.#isUnvisited(realX + 2, realY)) {
      result.push({ x: x + 1, y });
    }
    if (this.#isUnvisited(realX, realY - 2)) {
      result.push({ x, y: y - 1 });
    }
    if (this.#isUnvisited(realX, realY + 2)) {
      result.push({ x, y: y + 1 });
    }
    return result;
  }

  visit(x, y) {
    const realX = x * 2 + 1;
    const realY = y * 2 + 1;

    // Mark node as visited
    const justVisited = this.#markVisited(realX, realY);
    if (!justVisited) {
      return;
    }

    // Find all adjacent unvisited nodes
    while (true) {
      const nodes = this.#findAdjacentUnvisitedNodes(x, y);
      if (nodes.length === 0) {
        break;
      }
      const selectedNode = nodes[Math.floor(Math.random() * nodes.length)];
      const realXFrom = selectedNode.x * 2 + 1;
      const realYFrom = selectedNode.y * 2 + 1;
      this.#makePath(realX, realY, realXFrom, realYFrom);
      this.visit(selectedNode.x, selectedNode.y);
    }
  }
}

class DisplayNode {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  setBorder(top, right, bottom, left) {
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    this.left = left;
  }

  render(cellSize) {
    const el = createEl('div', 'cell');
    el.style.width = cellSize + 'px';
    el.style.height = cellSize + 'px';
    if (this.y === 0 && this.top) el.classList.add('top-border');
    if (this.x === 0 && this.left) el.classList.add('left-border');
    if (this.right) el.classList.add('right-border');
    if (this.bottom) el.classList.add('bottom-border');
    return el;
  }
}

class GamePlay {
  cellSize = 20; // in pixels
  renderedCells = [];
  current;
  walkables = [];

  constructor() {
    const innerWidth = window.innerWidth - 50;
    const innerHeight = window.innerHeight - 50;
    const offsetCellSize = this.cellSize + 2; // border = 1
    this.width = Math.floor(innerWidth / offsetCellSize);
    this.height = Math.floor(innerHeight / offsetCellSize);

    this.gameUi = document.getElementById('app');
  }

  start() {
    this.#generate();
    this.#showMaze();

    const { x, y } = this.#randomStartPoint();
    this.#markCurrent(x, y);
    this.#markFinish(this.width - 1 - x, this.height - 1 - y);
  }

  #randomStartPoint() {
    const firstHalf = Math.floor(this.width / 2);
    const secondHalf = Math.floor(this.height / 2);
    const max = firstHalf + secondHalf;
    const num = Math.floor(Math.random() * max);
    if (num <= firstHalf) {
      return {
        x: 0,
        y: num,
      };
    } else {
      return {
        x: num - firstHalf,
        y: 0,
      };
    }
  }

  #generate() {
    this.maze = new MazeData(this.width, this.height);

    // Init current as the middle node
    const midWidth = Math.floor(this.width / 2);
    const midHeight = Math.floor(this.height / 2);
    this.maze.visit(midWidth, midHeight);
  }

  #showMaze() {
    const nodes = this.maze.toDisplayNodes();
    for (let y = 0; y < nodes.length; y++) {
      const row = nodes[y];
      const rowEl = createEl('div', 'row');
      for (let x = 0; x < row.length; x++) {
        const node = row[x];
        const cellEl = node.render(this.cellSize);
        rowEl.appendChild(cellEl);
        cellEl.addEventListener('click', () => this.#mayGoNext(x, y));
        this.renderedCells.push(cellEl);
      }
      this.gameUi.appendChild(rowEl);
    }
  }

  #mayGoNext(x, y) {
    const nextPos = this.walkables.find(pos => pos.x === x && pos.y === y);
    if (!nextPos) {
      return;
    }
    const stack = this.maze.fastTrack(this.current, nextPos);
    this.#unmarkCurrent();
    stack.forEach((pos, index) => {
      const node = this.#getRenderedCell(pos.x, pos.y);
      node.style.animationDelay = `${100 * index}ms`;
      node.classList.add('step');
    });
    const end = stack[stack.length - 1];
    setTimeout(() => {
      this.#markCurrent(end.x, end.y);
      stack.forEach(pos => this.#getRenderedCell(pos.x, pos.y).classList.remove('step'));
    }, 100 * stack.length);
  }

  #getRenderedCell(x, y) {
    return this.renderedCells[y * this.width + x];
  }

  #unmarkCurrent() {
    if (this.current) {
      const node = this.#getRenderedCell(this.current.x, this.current.y);
      node.classList.remove('current');
    }
    if (this.walkables.length) {
      this.walkables.forEach(pos => this.#getRenderedCell(pos.x, pos.y).classList.remove('walkable'));
    }
  }

  #markCurrent(x, y) {
    this.current = { x, y };
    this.#getRenderedCell(x, y).classList.add('current');
    this.walkables = this.maze.findWalkableNodes(x, y);
    this.walkables.forEach(pos => this.#getRenderedCell(pos.x, pos.y).classList.add('walkable'));
  }

  #markFinish(x, y) {
    this.#getRenderedCell(x, y).classList.add('finish');
  }
}

function createEl(tagName, className) {
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  return el;
}

function newGame() {
  new GamePlay().start();
}

newGame();
