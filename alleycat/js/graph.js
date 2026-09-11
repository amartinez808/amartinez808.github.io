// graph.js — turns the raw OSM ways from overpass.js into an undirected
// routing graph, and provides Dijkstra shortest paths over it.
//
// Undirected is the whole point: an alleycat ignores oneway restrictions, so
// every OSM way segment becomes a two-directional edge no matter what its
// tags say.

class MinHeap {
  constructor() { this._a = []; }
  get size() { return this._a.length; }
  push(priority, value) {
    this._a.push([priority, value]);
    let i = this._a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._a[parent][0] <= this._a[i][0]) break;
      [this._a[parent], this._a[i]] = [this._a[i], this._a[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this._a[0];
    const last = this._a.pop();
    if (this._a.length > 0) {
      this._a[0] = last;
      let i = 0;
      const n = this._a.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < n && this._a[l][0] < this._a[smallest][0]) smallest = l;
        if (r < n && this._a[r][0] < this._a[smallest][0]) smallest = r;
        if (smallest === i) break;
        [this._a[smallest], this._a[i]] = [this._a[i], this._a[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

function buildGraph(ways) {
  const nodes = new Map(); // id -> {lat, lon}
  const adj = new Map();   // id -> [{to, weight, wayName, highway, wayId}]

  function ensureNode(id, lat, lon) {
    if (!nodes.has(id)) nodes.set(id, { lat, lon });
  }
  function addEdge(a, b, weight, wayName, highway, wayId, hazards) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ to: b, weight, wayName, highway, wayId, hazards: hazards || [] });
  }

  for (const way of ways) {
    const { nodeIds, coords } = way;
    const n = Math.min(nodeIds.length, coords.length);
    for (let i = 0; i < n - 1; i++) {
      const aId = nodeIds[i], bId = nodeIds[i + 1];
      const aC = coords[i], bC = coords[i + 1];
      ensureNode(aId, aC.lat, aC.lon);
      ensureNode(bId, bC.lat, bC.lon);
      if (aId === bId) continue;
      const w = haversine(aC.lat, aC.lon, bC.lat, bC.lon);
      if (w <= 0) continue;
      addEdge(aId, bId, w, way.name, way.highway, way.id, way.hazards);
      addEdge(bId, aId, w, way.name, way.highway, way.id, way.hazards);
    }
  }

  return { nodes, adj };
}

function pathHazards(graph, path) {
  const totals = new Map();
  for (let i = 0; i < path.length - 1; i++) {
    const edge = edgeBetween(graph, path[i], path[i + 1]);
    if (!edge) continue;
    for (const label of edge.hazards || []) {
      totals.set(label, (totals.get(label) || 0) + edge.weight);
    }
  }
  return [...totals.entries()]
    .map(([label, meters]) => ({ label, meters }))
    .sort((a, b) => b.meters - a.meters);
}

// Nearest graph node to a raw {lat, lon}. Linear scan — fine for the node
// counts a single-race bounding box produces; see README if you need this to
// scale to a much larger area.
function nearestNode(graph, lat, lon, allowedNodeIds = null) {
  let bestId = null, bestDist = Infinity;
  for (const [id, c] of graph.nodes) {
    if (allowedNodeIds && !allowedNodeIds.has(id)) continue;
    const d = haversine(lat, lon, c.lat, c.lon);
    if (d < bestDist) { bestDist = d; bestId = id; }
  }
  return bestId === null ? null : { id: bestId, dist: bestDist };
}

// Park paths, parking aisles, and private campuses often form tiny islands in
// OpenStreetMap. Snapping a checkpoint to the geometrically closest island
// makes an otherwise valid city route look disconnected. The largest
// connected component is the through-going street network and is the safe
// default snap target; the UI still reports how far each exact race pin is
// from that network.
function largestConnectedComponent(graph) {
  const visited = new Set();
  let largest = new Set();

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue;
    const component = new Set();
    const stack = [nodeId];
    visited.add(nodeId);
    while (stack.length) {
      const current = stack.pop();
      component.add(current);
      for (const edge of graph.adj.get(current) || []) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        stack.push(edge.to);
      }
    }
    if (component.size > largest.size) largest = component;
  }
  return largest;
}

// Single-source Dijkstra. If `targets` (a Set of node ids) is given, stops
// early once every target has been settled — a nice speedup when we only
// care about distances between a handful of checkpoints on a big graph.
function dijkstra(graph, sourceId, targets = null) {
  const dist = new Map([[sourceId, 0]]);
  const prev = new Map();
  const settled = new Set();
  const heap = new MinHeap();
  heap.push(0, sourceId);

  const remaining = targets ? new Set(targets) : null;
  if (remaining) remaining.delete(sourceId);

  while (heap.size > 0) {
    const [d, u] = heap.pop();
    if (settled.has(u)) continue;
    settled.add(u);
    if (remaining) {
      remaining.delete(u);
      if (remaining.size === 0) break;
    }
    const edges = graph.adj.get(u);
    if (!edges) continue;
    for (const e of edges) {
      if (settled.has(e.to)) continue;
      const nd = d + e.weight;
      if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
        heap.push(nd, e.to);
      }
    }
  }
  return { dist, prev };
}

// Reconstruct the node-id path from a Dijkstra `prev` map.
function reconstructPath(prev, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];
  if (!prev.has(targetId)) return null;
  const path = [targetId];
  let cur = targetId;
  while (cur !== sourceId) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    path.push(cur);
  }
  path.reverse();
  return path;
}

// Look up the edge actually used between two adjacent nodes in a path, so we
// can recover the street name/highway type for the cue sheet.
function edgeBetween(graph, a, b) {
  const edges = graph.adj.get(a);
  if (!edges) return null;
  // Prefer the shortest matching edge in case of parallel ways.
  let best = null;
  for (const e of edges) {
    if (e.to === b && (!best || e.weight < best.weight)) best = e;
  }
  return best;
}
