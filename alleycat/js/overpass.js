// overpass.js — pulls the road network for a bounding box out of OpenStreetMap
// via the public Overpass API, using "out geom" so we get each way's full
// node geometry inline (no separate node-fetch pass needed).
//
// IMPORTANT for this app's whole premise: oneway=* and oneway:bicycle=* are
// deliberately ignored. Access and basic rideability tags are still honored:
// alleycat contraflow is not permission to route onto a motorway, staircase,
// construction site, or explicitly bicycle-prohibited/private way.

const OVERPASS_ENDPOINT = (typeof window !== "undefined" && window.ZIGZAG_CONFIG && window.ZIGZAG_CONFIG.overpassEndpoint) ||
  "https://overpass-api.de/api/interpreter";

// Highway values we skip entirely — not rule-following, just "this isn't a
// rideable way" (indoor corridors, elevators, non-routable planning data).
const EXCLUDED_HIGHWAY_VALUES = new Set([
  "proposed", "construction", "razed", "abandoned", "planned",
  "elevator", "platform", "corridor", "bus_guideway", "busway",
  "motorway", "motorway_link", "trunk", "trunk_link", "steps",
  "raceway", "escape",
]);

const BLOCKED_ACCESS_VALUES = new Set(["no", "private"]);
const BLOCKED_BICYCLE_VALUES = new Set(["no", "dismount", "use_sidepath"]);
const BICYCLE_OVERRIDES = new Set(["yes", "designated", "permissive", "official"]);
const UNPAVED_SURFACES = new Set([
  "unpaved", "gravel", "fine_gravel", "dirt", "earth", "ground", "sand",
  "mud", "grass", "grass_paver", "woodchips", "compacted",
]);
const ROUGH_SMOOTHNESS = new Set(["bad", "very_bad", "horrible", "very_horrible", "impassable"]);

// Safety valve: past this, a single Overpass query risks timing out or
// getting throttled. The app warns the user instead of firing it blind.
const MAX_BBOX_AREA_KM2 = 400;
const OVERPASS_TIMEOUT_MS = 75000;

function classifyRoadWay(tags = {}) {
  const highway = tags.highway;
  if (!highway || EXCLUDED_HIGHWAY_VALUES.has(highway)) return { allowed: false, reason: highway || "missing highway" };
  if (BLOCKED_BICYCLE_VALUES.has(tags.bicycle)) return { allowed: false, reason: `bicycle=${tags.bicycle}` };

  const bicycleOverride = BICYCLE_OVERRIDES.has(tags.bicycle);
  if (!bicycleOverride && (BLOCKED_ACCESS_VALUES.has(tags.access) || BLOCKED_ACCESS_VALUES.has(tags.vehicle))) {
    return { allowed: false, reason: `access=${tags.access || tags.vehicle}` };
  }

  const hazards = [];
  if (["primary", "primary_link", "secondary", "secondary_link"].includes(highway)) hazards.push("busy road");
  if (["path", "footway", "pedestrian", "track", "bridleway"].includes(highway)) hazards.push("path or pedestrian segment");
  if (UNPAVED_SURFACES.has(tags.surface)) hazards.push("unpaved surface");
  if (ROUGH_SMOOTHNESS.has(tags.smoothness)) hazards.push("rough surface");
  if (tags.tunnel === "yes") hazards.push("tunnel");
  if (tags.lit === "no") hazards.push("unlit segment");
  return { allowed: true, hazards: [...new Set(hazards)] };
}

function buildQuery(bbox) {
  const bboxStr = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
  return `[out:json][timeout:60];
(
  way["highway"](${bboxStr});
);
out geom;`;
}

async function fetchRoadGraphRaw(bbox) {
  const area = bboxAreaKm2(bbox);
  if (area > MAX_BBOX_AREA_KM2) {
    throw new Error(
      `Checkpoints span ~${Math.round(area)} km² — too large for one Overpass query. ` +
      `Tighten up the manifest or split it into legs.`
    );
  }

  const query = buildQuery(bbox);
  let res;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      res = await fetch(OVERPASS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal,
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) break;
      lastError = new Error(`Road network service returned ${res.status}`);
    } catch (err) {
      lastError = err && err.name === "AbortError" ? new Error("Road network request timed out") : err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  if (!res) throw lastError || new Error("Road network service is unavailable");

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Overpass ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }

  const data = await res.json();
  const ways = [];
  const filteredReasons = {};
  for (const el of data.elements || []) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags || {};
    const classification = classifyRoadWay(tags);
    if (!classification.allowed) {
      filteredReasons[classification.reason] = (filteredReasons[classification.reason] || 0) + 1;
      continue;
    }
    ways.push({
      id: el.id,
      name: tags.name || tags.ref || null,
      highway: tags.highway || "road",
      hazards: classification.hazards,
      nodeIds: el.nodes,
      coords: el.geometry.map((g) => ({ lat: g.lat, lon: g.lon })),
    });
  }
  return {
    ways,
    filteredCount: Object.values(filteredReasons).reduce((sum, n) => sum + n, 0),
    filteredReasons,
  };
}
