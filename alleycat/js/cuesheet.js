// cuesheet.js — turns a stitched node-path (plus where the checkpoints fall
// along it) into an old-school alleycat cue sheet: a short list of streets
// and turns rather than a spoken turn-by-turn.
//
// This is best-effort. OSM street names are inconsistent (missing on a lot
// of minor ways, split across differently-named segments at intersections),
// so treat the cue sheet as a helpful sketch of the route, not gospel —
// the map + polyline is the source of truth.

// checkpointStops: [{ pathIndex, label, number }], sorted by pathIndex,
// where pathIndex is the index into fullPath at which that checkpoint sits.
// number 0 is the start; the final stop is the finish (may repeat the start
// label if this is a loop).
function buildCueSheet(graph, fullPath, checkpointStops) {
  const cues = [];
  if (fullPath.length < 2) return cues;

  const edges = [];
  for (let i = 0; i < fullPath.length - 1; i++) {
    const e = edgeBetween(graph, fullPath[i], fullPath[i + 1]);
    const fromC = graph.nodes.get(fullPath[i]);
    const toC = graph.nodes.get(fullPath[i + 1]);
    edges.push({
      name: e ? e.wayName || null : null,
      dist: e ? e.weight : haversine(fromC.lat, fromC.lon, toC.lat, toC.lon),
      bearing: bearing(fromC.lat, fromC.lon, toC.lat, toC.lon),
    });
  }

  const cpByIdx = new Map();
  for (const cp of checkpointStops) {
    if (!cpByIdx.has(cp.pathIndex)) cpByIdx.set(cp.pathIndex, []);
    cpByIdx.get(cp.pathIndex).push(cp);
  }

  const startCps = cpByIdx.get(0) || [];
  const startCp = startCps[0];
  cues.push({ type: "start", text: `START — ${startCp ? startCp.label : "checkpoint 1"}` });
  for (const cp of startCps.slice(1)) {
    cues.push({ type: "checkpoint", text: `CHECKPOINT ${cp.number} — ${cp.label}` });
  }

  let segName = edges[0].name;
  let segDist = 0;
  let segStartBearing = edges[0].bearing;

  const flushSegment = () => {
    if (segDist > 0) {
      cues.push({ type: "go", text: `Continue on ${segName || "unnamed road"}`, distance: segDist });
    }
  };

  for (let i = 0; i < edges.length; i++) {
    const nodeIdx = i; // fullPath index this edge starts from

    if (nodeIdx > 0 && cpByIdx.has(nodeIdx)) {
      flushSegment();
      for (const cp of cpByIdx.get(nodeIdx)) {
        cues.push({ type: "checkpoint", text: `CHECKPOINT ${cp.number} — ${cp.label}` });
      }
      segName = edges[i].name;
      segDist = 0;
      segStartBearing = edges[i].bearing;
    } else if (edges[i].name !== segName) {
      flushSegment();
      const turn = turnLabel(segStartBearing !== undefined ? edges[i - 1].bearing : edges[i].bearing, edges[i].bearing);
      cues.push({ type: "turn", text: `${turn} onto ${edges[i].name || "unnamed road"}` });
      segName = edges[i].name;
      segDist = 0;
      segStartBearing = edges[i].bearing;
    }
    segDist += edges[i].dist;
  }
  flushSegment();

  const lastIdx = fullPath.length - 1;
  const finishCps = cpByIdx.get(lastIdx) || [];
  const finishCp = finishCps[finishCps.length - 1];
  cues.push({ type: "finish", text: `FINISH${finishCp ? " — " + finishCp.label : ""}` });

  return cues;
}
