// tsp.js — decides what ORDER to hit the checkpoints in.
//
// distMatrix[i][j] = shortest road-network distance (meters) from
// checkpoint i to checkpoint j, already computed by graph.js's Dijkstra runs
// over the one-way-ignoring graph. Checkpoint 0 is always the start line.
//
// mode: "fixed"    -> just race the manifest in the order it was entered.
//       "optimize" -> find whichever order of the *other* checkpoints
//                      minimizes total distance (start stays fixed at 0).
// loop: true if the race finishes back at the start; false for a
//       point-to-point finish at whichever checkpoint ends up last.

const TSP_BRUTE_FORCE_LIMIT = 9; // total checkpoints, i.e. 8! permutations of the rest

function pathLength(distMatrix, order, loop) {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += distMatrix[order[i]][order[i + 1]];
  if (loop) total += distMatrix[order[order.length - 1]][order[0]];
  return total;
}

function findUnreachablePairs(distMatrix) {
  const n = distMatrix.length;
  const bad = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (!isFinite(distMatrix[i][j])) bad.push([i, j]);
    }
  }
  return bad;
}

function* permutations(arr) {
  if (arr.length <= 1) { yield arr; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

function bruteForceOrder(distMatrix, loop) {
  const n = distMatrix.length;
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  let bestOrder = [0, ...rest];
  let bestLen = pathLength(distMatrix, bestOrder, loop);
  for (const perm of permutations(rest)) {
    const order = [0, ...perm];
    const len = pathLength(distMatrix, order, loop);
    if (len < bestLen) { bestLen = len; bestOrder = order; }
  }
  return { order: bestOrder, totalDistance: bestLen };
}

function nearestNeighborOrder(distMatrix, loop) {
  const n = distMatrix.length;
  const visited = new Set([0]);
  const order = [0];
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1, bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      if (distMatrix[last][j] < bestDist) { bestDist = distMatrix[last][j]; best = j; }
    }
    order.push(best);
    visited.add(best);
  }
  return { order, totalDistance: pathLength(distMatrix, order, loop) };
}

// Standard 2-opt local search, adapted for a path that may or may not close
// into a loop, with position 0 held fixed as the start line.
function twoOptImprove(distMatrix, initialOrder, loop, maxPasses = 200) {
  let order = initialOrder.slice();
  const n = order.length;
  let improved = true;
  let passes = 0;

  const edge = (a, b) => distMatrix[a][b];

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = order[i - 1], b = order[i];
        const c = order[k], d = order[k + 1]; // d is undefined if k === n-1

        let delta;
        if (d === undefined) {
          if (!loop) {
            // Open end: reversing just swaps which node is the dangling end,
            // which costs nothing extra — only the (a,b)->(a,c) edge changes.
            delta = edge(a, c) - edge(a, b);
          } else {
            const start = order[0];
            delta = (edge(a, c) + edge(b, start)) - (edge(a, b) + edge(c, start));
          }
        } else {
          delta = (edge(a, c) + edge(b, d)) - (edge(a, b) + edge(c, d));
        }

        if (delta < -1e-6) {
          // reverse order[i..k]
          let lo = i, hi = k;
          while (lo < hi) { [order[lo], order[hi]] = [order[hi], order[lo]]; lo++; hi--; }
          improved = true;
        }
      }
    }
  }
  return { order, totalDistance: pathLength(distMatrix, order, loop) };
}

// Public entry point.
function solveOrder(distMatrix, { mode, loop }) {
  const n = distMatrix.length;
  if (n <= 2) {
    const order = Array.from({ length: n }, (_, i) => i);
    return { order, totalDistance: pathLength(distMatrix, order, loop) };
  }

  if (mode === "fixed") {
    const order = Array.from({ length: n }, (_, i) => i);
    return { order, totalDistance: pathLength(distMatrix, order, loop) };
  }

  // mode === "optimize"
  if (n <= TSP_BRUTE_FORCE_LIMIT) {
    return bruteForceOrder(distMatrix, loop);
  }
  const seed = nearestNeighborOrder(distMatrix, loop);
  return twoOptImprove(distMatrix, seed.order, loop);
}
