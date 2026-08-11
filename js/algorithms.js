/**
 * 寻路算法生成器
 * ----------------
 * 三个算法都写成 Generator（生成器），而不是一次性返回最终路径。
 * 每处理一个节点便 yield 一份快照，界面层就能暂停、单步或按速度播放。
 *
 * 统一事件结构：
 * - current: 当前从 frontier 中取出的节点
 * - frontier: 已发现、但尚未正式处理的节点
 * - visited: 已经完成处理的节点
 * - scores: 节点目前已知的代价，用于在格子中显示状态变化
 * - done/path: 是否结束，以及结束时的最终路径
 */

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export const keyOf = ({ row, col }) => `${row},${col}`;

function reconstructPath(cameFrom, endKey, nodes) {
  const path = [];
  let cursor = endKey;
  while (cursor !== undefined) {
    path.push(nodes.get(cursor));
    cursor = cameFrom.get(cursor);
  }
  return path.reverse();
}

function neighbors(node, grid) {
  const result = [];
  for (const [dr, dc] of DIRECTIONS) {
    const row = node.row + dr;
    const col = node.col + dc;
    if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) continue;
    if (grid[row][col].type !== "wall") result.push(grid[row][col]);
  }
  return result;
}

function snapshot(current, frontierKeys, visited, scores, extra = {}) {
  return {
    current,
    frontier: [...frontierKeys],
    visited: [...visited],
    scores: Object.fromEntries(scores),
    done: false,
    path: [],
    phase: "idle",
    message: "准备搜索",
    frontierDetails: [],
    ...extra,
  };
}

/**
 * BFS（广度优先搜索）
 *
 * 核心思想：先进先出。先发现的节点先被处理，因此搜索会按“离起点几步”
 * 一层一层向外扩张。在所有边的代价都相同时，第一次到达终点的路径就是
 * 步数最少的路径。
 *
 * 注意：BFS 故意不读取 cell.weight。面对带权地图时，它找到的是最少步数，
 * 而不一定是最低总代价，这正是演示中与 Dijkstra 的关键差异。
 *
 * 时间复杂度：O(V + E)；空间复杂度：O(V)。
 */
export function* bfs(grid, start, end) {
  const nodes = new Map(grid.flat().map(node => [keyOf(node), node]));
  const startKey = keyOf(start);
  const endKey = keyOf(end);
  const queue = [start];
  const discovered = new Set([startKey]);
  const visited = new Set();
  const cameFrom = new Map();
  const distance = new Map([[startKey, 0]]);

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = keyOf(current);
    visited.add(currentKey);

    yield snapshot(current, queue.map(keyOf), visited, distance, {
      phase: "select",
      message: `从队列头部取出节点 (${current.col}, ${current.row})`,
      frontierDetails: queue.map(node => ({ key: keyOf(node), label: `(${node.col}, ${node.row})` })),
    });

    if (currentKey === endKey) {
      const path = reconstructPath(cameFrom, endKey, nodes);
      yield snapshot(current, queue.map(keyOf), visited, distance, {
        done: true,
        path,
        cost: path.length - 1,
        phase: "done",
        message: `到达终点，重建出 ${path.length - 1} 步路径`,
        frontierDetails: queue.map(node => ({ key: keyOf(node), label: `(${node.col}, ${node.row})` })),
      });
      return;
    }

    for (const next of neighbors(current, grid)) {
      const nextKey = keyOf(next);
      if (discovered.has(nextKey)) continue;
      discovered.add(nextKey); // 入队时标记，避免同一节点被重复加入队列。
      cameFrom.set(nextKey, currentKey);
      distance.set(nextKey, distance.get(currentKey) + 1);
      queue.push(next);
    }

    yield snapshot(current, queue.map(keyOf), visited, distance, {
      phase: "expand",
      message: `检查相邻格，将未发现节点加入队尾`,
      frontierDetails: queue.map(node => ({
        key: keyOf(node),
        label: `(${node.col}, ${node.row}) · d=${distance.get(keyOf(node))}`,
      })),
    });
  }

  yield snapshot(null, [], visited, distance, {
    done: true,
    noPath: true,
    phase: "noPath",
    message: "队列已空，没有可达路径",
  });
}

/** 一个教学用的最小优先队列。数组实现直观，规模较小时足够清晰。 */
class MinPriorityQueue {
  items = [];

  push(node, priority) {
    this.items.push({ node, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  pop() { return this.items.shift(); }
  get length() { return this.items.length; }
  keys() { return this.items.map(item => keyOf(item.node)); }
  details() {
    return this.items.map(item => ({
      key: keyOf(item.node),
      label: `(${item.node.col}, ${item.node.row}) · p=${Math.round(item.priority)}`,
    }));
  }
}

/**
 * Dijkstra 最短路径
 *
 * g(n) 表示从起点走到 n 的当前最低已知代价。算法每次从优先队列中取出
 * g 最小的节点；因为所有权重非负，该节点被正式访问时，它的最低代价已经
 * 确定。若后来发现一条更便宜的路线，就更新 g 并重新放入队列（松弛操作）。
 *
 * 本 Demo 中普通格代价为 1，紫色权重格代价为 5。
 * 使用二叉堆时复杂度通常为 O((V + E) log V)；这里为可读性使用排序数组。
 */
export function* dijkstra(grid, start, end) {
  return yield* weightedSearch(grid, start, end, () => 0, "dijkstra");
}

/**
 * A* 搜索
 *
 * A* 与 Dijkstra 的松弛过程相同，但优先级改为 f(n) = g(n) + h(n)：
 * - g(n)：已经付出的真实代价；
 * - h(n)：从 n 到终点的估计代价。
 *
 * 四方向网格使用曼哈顿距离 |dx| + |dy|。它不会高估实际剩余代价，属于
 * admissible heuristic，因此 A* 仍能保证最优，同时通常比 Dijkstra 更聚焦。
 */
export function* astar(grid, start, end) {
  const manhattan = node => Math.abs(node.row - end.row) + Math.abs(node.col - end.col);
  return yield* weightedSearch(grid, start, end, manhattan, "astar");
}

function* weightedSearch(grid, start, end, heuristic, mode) {
  const nodes = new Map(grid.flat().map(node => [keyOf(node), node]));
  const startKey = keyOf(start);
  const endKey = keyOf(end);
  const queue = new MinPriorityQueue();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, heuristic(start)]]);
  const cameFrom = new Map();
  const visited = new Set();
  queue.push(start, fScore.get(startKey));

  while (queue.length > 0) {
    const { node: current } = queue.pop();
    const currentKey = keyOf(current);
    if (visited.has(currentKey)) continue; // 跳过优先队列中已经过期的重复项。
    visited.add(currentKey);

    yield snapshot(current, queue.keys(), visited, fScore, {
      phase: "select",
      message: `从优先队列取出评分最低的节点 (${current.col}, ${current.row})`,
      gScore: Object.fromEntries(gScore),
      frontierDetails: queue.details(),
    });

    if (currentKey === endKey) {
      const path = reconstructPath(cameFrom, endKey, nodes);
      yield snapshot(current, queue.keys(), visited, fScore, {
        done: true,
        path,
        cost: gScore.get(endKey),
        gScore: Object.fromEntries(gScore),
        phase: "done",
        message: `到达终点，重建最低代价路径`,
        frontierDetails: queue.details(),
      });
      return;
    }

    for (const next of neighbors(current, grid)) {
      const nextKey = keyOf(next);
      if (visited.has(nextKey)) continue;
      const tentativeG = gScore.get(currentKey) + next.weight;

      // 松弛：只有找到更便宜的到达方式时，才改写父节点和分数。
      if (tentativeG < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentativeG);
        const priority = tentativeG + heuristic(next);
        fScore.set(nextKey, priority);
        queue.push(next, priority);
      }
    }

    yield snapshot(current, queue.keys(), visited, fScore, {
      gScore: Object.fromEntries(gScore),
      phase: "relax",
      message: mode === "astar"
        ? "计算邻居的 g(n) 与 f(n)，更新更优路线"
        : "计算邻居的新代价，更新更便宜的路线",
      frontierDetails: queue.details(),
    });
  }

  yield snapshot(null, [], visited, fScore, {
    done: true,
    noPath: true,
    gScore: Object.fromEntries(gScore),
    phase: "noPath",
    message: "优先队列已空，没有可达路径",
  });
}

export const algorithms = { bfs, dijkstra, astar };

