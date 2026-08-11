import assert from "node:assert/strict";
import { astar, bfs, dijkstra } from "../js/algorithms.js";

function makeGrid(weights) {
  return weights.map((row, rowIndex) => row.map((weight, col) => ({
    row: rowIndex,
    col,
    type: weight === Infinity ? "wall" : weight > 1 ? "weight" : "empty",
    weight,
  })));
}

function finish(generator) {
  let last;
  for (const state of generator) last = state;
  return last;
}

// 直线路径中间放一个高权重格：BFS 选择更少的步数，不关心代价。
// Dijkstra 与 A* 会绕开高权重格，选择步数稍多但总成本更低的路线。
const grid = makeGrid([
  [1, 1, 1, 1],
  [1, 9, 9, 1],
  [1, 1, 1, 1],
]);
const start = grid[1][0];
const end = grid[1][3];

const bfsResult = finish(bfs(grid, start, end));
const dijkstraResult = finish(dijkstra(grid, start, end));
const astarResult = finish(astar(grid, start, end));

assert.equal(bfsResult.cost, 3, "BFS 应找到 3 步直线路径");
assert.equal(dijkstraResult.cost, 5, "Dijkstra 应绕开权重格，总代价为 5");
assert.equal(astarResult.cost, 5, "A* 应得到与 Dijkstra 相同的最优代价");
assert.equal(bfsResult.phase, "done", "BFS 结束快照应驱动伪代码高亮");
assert.equal(dijkstraResult.phase, "done", "Dijkstra 结束快照应驱动伪代码高亮");
assert.equal(astarResult.phase, "done", "A* 结束快照应驱动伪代码高亮");
assert.ok([...bfs(grid, start, end)].some(state => state.phase === "select" && state.frontierDetails), "BFS 应输出队列教学状态");
assert.ok([...astar(grid, start, end)].some(state => state.phase === "relax" && state.frontierDetails), "A* 应输出优先队列教学状态");
assert.deepEqual(astarResult.path.map(node => [node.row, node.col]), dijkstraResult.path.map(node => [node.row, node.col]));

// 完全封闭的终点必须明确返回 noPath，不能误报成功。
const blocked = makeGrid([[1, Infinity, 1]]);
const noPath = finish(astar(blocked, blocked[0][0], blocked[0][2]));
assert.equal(noPath.noPath, true);

console.log("算法测试通过：BFS、Dijkstra、A* 的路径选择符合预期。");

