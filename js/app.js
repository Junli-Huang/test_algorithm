import { algorithms, keyOf } from "./algorithms.js";

const ROWS = 13;
const COLS = 19;
const DEFAULT_START = { row: 6, col: 2 };
const DEFAULT_END = { row: 6, col: 16 };
const BASE_STEP_DELAY = 120;

const PRESETS = {
  blank: { name: "白板", walls: [], weights: [] },
  weights: {
    name: "权重",
    walls: [],
    weights: [
      [6, 5], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13],
      [5, 9], [7, 9],
    ],
  },
  walls: {
    name: "障碍",
    walls: [
      [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6],
      [3, 12], [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12],
    ],
    weights: [],
  },
  mixed: {
    name: "权重 + 障碍",
    walls: [
      [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6],
      [3, 12], [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12],
    ],
    weights: [
      [6, 7], [6, 8], [6, 9], [6, 10], [6, 11],
      [5, 9], [7, 9], [8, 9], [9, 9],
    ],
  },
};

const elements = {
  grid: document.querySelector("#grid"),
  tabs: [...document.querySelectorAll(".algorithm-tab")],
  tools: [...document.querySelectorAll(".tool-button")],
  presets: [...document.querySelectorAll(".preset-button")],
  run: document.querySelector("#runButton"),
  step: document.querySelector("#stepButton"),
  reset: document.querySelector("#resetButton"),
  random: document.querySelector("#randomButton"),
  clear: document.querySelector("#clearButton"),
  speed: document.querySelector("#speedRange"),
  status: document.querySelector("#statusText"),
  current: document.querySelector("#currentMetric"),
  frontier: document.querySelector("#frontierMetric"),
  visited: document.querySelector("#visitedMetric"),
  cost: document.querySelector("#costMetric"),
  scoreLabel: document.querySelector("#scoreLabel"),
  scoreValue: document.querySelector("#scoreValue"),
  guideCards: [...document.querySelectorAll(".algorithm-card")],
};

let grid = createGrid();
let algorithm = "bfs";
let activeTool = "wall";
let iterator = null;
let isRunning = false;
let isDrawing = false;
let lastPaintedKey = null;
let runToken = 0;

function createGrid() {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => ({ row, col, type: "empty", weight: 1 }))
  );
}

function cellAt(position) { return grid[position.row][position.col]; }
function startCell() { return grid.flat().find(cell => cell.type === "start"); }
function endCell() { return grid.flat().find(cell => cell.type === "end"); }

function setDefaultEndpoints() {
  Object.assign(cellAt(DEFAULT_START), { type: "start", weight: 1 });
  Object.assign(cellAt(DEFAULT_END), { type: "end", weight: 1 });
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  grid = createGrid();
  for (const [row, col] of preset.walls) Object.assign(grid[row][col], { type: "wall", weight: Infinity });
  for (const [row, col] of preset.weights) Object.assign(grid[row][col], { type: "weight", weight: 5 });
  setDefaultEndpoints();
  elements.presets.forEach(button => button.classList.toggle("is-active", button.dataset.preset === presetKey));
  clearVisualization(`已载入「${preset.name}」预设 · 仍可继续自定义`);
}

function markMapAsCustom() {
  elements.presets.forEach(button => button.classList.remove("is-active"));
}

function renderGrid() {
  elements.grid.style.gridTemplateColumns = `repeat(${COLS}, var(--cell-size))`;
  elements.grid.replaceChildren();
  for (const cell of grid.flat()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `grid-cell ${cell.type}`;
    button.dataset.row = cell.row;
    button.dataset.col = cell.col;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", describeCell(cell));
    if (cell.type === "weight") button.textContent = cell.weight;
    elements.grid.append(button);
  }
}

function describeCell(cell) {
  const names = { empty: "空地", wall: "障碍", weight: `权重 ${cell.weight}`, start: "起点", end: "终点" };
  return `第 ${cell.row + 1} 行，第 ${cell.col + 1} 列，${names[cell.type]}`;
}

function clearVisualization(message = "过程已重置 · 可以继续编辑地图") {
  runToken += 1;
  iterator = null;
  isRunning = false;
  elements.run.textContent = "开始搜索";
  elements.current.textContent = "—";
  elements.frontier.textContent = "0";
  elements.visited.textContent = "0";
  elements.cost.textContent = "—";
  elements.scoreValue.textContent = "—";
  elements.status.textContent = message;
  renderGrid();
}

function initializeIterator() {
  const start = startCell();
  const end = endCell();
  if (!start || !end) {
    elements.status.textContent = "地图需要同时存在起点 S 和终点 E";
    return false;
  }
  iterator = algorithms[algorithm](grid, start, end);
  elements.status.textContent = `${algorithmName()} · 搜索已开始`;
  return true;
}

function applySnapshot(state) {
  renderGrid();
  const frontier = new Set(state.frontier);
  const visited = new Set(state.visited);
  const path = new Set(state.path.map(keyOf));
  const currentKey = state.current ? keyOf(state.current) : null;

  for (const button of elements.grid.children) {
    const key = `${button.dataset.row},${button.dataset.col}`;
    const cell = grid[Number(button.dataset.row)][Number(button.dataset.col)];
    if (!["wall", "start", "end"].includes(cell.type)) {
      if (visited.has(key)) button.classList.add("visited");
      if (frontier.has(key)) button.classList.add("frontier");
      if (path.has(key)) button.classList.add("path");
      if (key === currentKey) button.classList.add("current");
    }

    if (state.scores[key] !== undefined && !["wall", "start", "end"].includes(cell.type)) {
      const score = document.createElement("span");
      score.className = "cell-score";
      score.textContent = Math.round(state.scores[key]);
      button.append(score);
    }
  }

  elements.current.textContent = state.current ? `(${state.current.col}, ${state.current.row})` : "—";
  elements.frontier.textContent = new Set(state.frontier).size;
  elements.visited.textContent = state.visited.length;
  elements.scoreValue.textContent = currentKey && state.scores[currentKey] !== undefined ? Math.round(state.scores[currentKey]) : "—";

  if (state.done) {
    isRunning = false;
    elements.run.textContent = "重新运行";
    if (state.noPath) {
      elements.status.textContent = "搜索结束 · 没有可达路径";
    } else {
      elements.cost.textContent = state.cost;
      elements.status.textContent = `找到路径 · 访问 ${state.visited.length} 个节点 · 总代价 ${state.cost}`;
    }
  } else {
    elements.status.textContent = `正在考察 (${state.current.col}, ${state.current.row})`;
  }
}

function advanceOneStep() {
  if (!iterator && !initializeIterator()) return true;
  const result = iterator.next();
  if (result.done) return true;
  applySnapshot(result.value);
  return result.value.done;
}

async function toggleRun() {
  if (isRunning) {
    isRunning = false;
    runToken += 1;
    elements.run.textContent = "继续搜索";
    elements.status.textContent = "已暂停 · 可单步查看";
    return;
  }

  if (!iterator && !initializeIterator()) return;
  isRunning = true;
  elements.run.textContent = "暂停";
  const token = ++runToken;

  while (isRunning && token === runToken) {
    if (advanceOneStep()) break;
    await new Promise(resolve => setTimeout(resolve, BASE_STEP_DELAY / Number(elements.speed.value)));
  }
}

function paintCell(cell) {
  if (isRunning || keyOf(cell) === lastPaintedKey) return;
  lastPaintedKey = keyOf(cell);
  if ((activeTool === "wall" || activeTool === "weight") && ["start", "end"].includes(cell.type)) return;

  if (activeTool === "start" || activeTool === "end") {
    const previous = grid.flat().find(item => item.type === activeTool);
    if (previous) Object.assign(previous, { type: "empty", weight: 1 });
  }

  const changes = {
    wall: { type: "wall", weight: Infinity },
    weight: { type: "weight", weight: 5 },
    start: { type: "start", weight: 1 },
    end: { type: "end", weight: 1 },
    erase: { type: "empty", weight: 1 },
  };
  Object.assign(cell, changes[activeTool]);
  markMapAsCustom();
  clearVisualization("地图已修改 · 运行搜索查看变化");
}

function selectAlgorithm(next) {
  algorithm = next;
  for (const tab of elements.tabs) {
    const selected = tab.dataset.algorithm === algorithm;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", selected);
  }
  for (const card of elements.guideCards) card.classList.toggle("is-highlighted", card.dataset.guide === algorithm);
  elements.scoreLabel.textContent = algorithm === "bfs" ? "层级 distance" : algorithm === "dijkstra" ? "累计代价 g(n)" : "优先级 f(n)";
  clearVisualization(`已切换到 ${algorithmName()} · 地图保持不变`);
}

function algorithmName() { return { bfs: "BFS", dijkstra: "Dijkstra", astar: "A*" }[algorithm]; }

function randomizeMap() {
  grid = createGrid();
  for (const cell of grid.flat()) {
    const roll = Math.random();
    if (roll < .19) Object.assign(cell, { type: "wall", weight: Infinity });
    else if (roll < .29) Object.assign(cell, { type: "weight", weight: 5 });
  }
  setDefaultEndpoints();
  markMapAsCustom();
  clearVisualization("已生成随机地图 · 不保证一定存在路径");
}

elements.tabs.forEach(tab => tab.addEventListener("click", () => selectAlgorithm(tab.dataset.algorithm)));
elements.tools.forEach(button => button.addEventListener("click", () => {
  activeTool = button.dataset.tool;
  elements.tools.forEach(item => {
    const selected = item === button;
    item.classList.toggle("is-active", selected);
    item.setAttribute("aria-pressed", selected);
  });
}));
elements.presets.forEach(button => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
elements.run.addEventListener("click", toggleRun);
elements.step.addEventListener("click", () => { if (!isRunning) advanceOneStep(); });
elements.reset.addEventListener("click", () => clearVisualization());
elements.random.addEventListener("click", randomizeMap);
elements.clear.addEventListener("click", () => applyPreset("blank"));

elements.grid.addEventListener("pointerdown", event => {
  const button = event.target.closest(".grid-cell");
  if (!button) return;
  isDrawing = true;
  lastPaintedKey = null;
  paintCell(grid[Number(button.dataset.row)][Number(button.dataset.col)]);
});
elements.grid.addEventListener("pointerover", event => {
  if (!isDrawing) return;
  const button = event.target.closest(".grid-cell");
  if (button) paintCell(grid[Number(button.dataset.row)][Number(button.dataset.col)]);
});
window.addEventListener("pointerup", () => { isDrawing = false; lastPaintedKey = null; });
elements.grid.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const button = event.target.closest(".grid-cell");
  if (button) paintCell(grid[Number(button.dataset.row)][Number(button.dataset.col)]);
});

applyPreset("mixed");
selectAlgorithm("bfs");
