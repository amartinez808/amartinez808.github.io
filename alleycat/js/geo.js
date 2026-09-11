// geo.js — small geometry helpers shared by the graph, routing and cue-sheet code.
// No dependencies. Everything here works on plain {lat, lon} numbers.

const EARTH_RADIUS_M = 6371000;

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

// Great-circle distance in meters. Accurate enough for city-scale routing;
// we're building a road graph out of straight segments between OSM nodes,
// so this is the same approximation OSM-based routers generally use per-edge.
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Initial bearing from point 1 to point 2, in degrees [0, 360).
function bearing(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

// Classify the turn between two consecutive bearings into a cue-sheet phrase.
function turnLabel(bearingIn, bearingOut) {
  let delta = bearingOut - bearingIn;
  delta = ((delta + 180) % 360 + 360) % 360 - 180; // normalize to [-180, 180]
  const abs = Math.abs(delta);
  if (abs < 12) return "Continue straight";
  if (abs < 45) return delta > 0 ? "Bear right" : "Bear left";
  if (abs < 135) return delta > 0 ? "Turn right" : "Turn left";
  return delta > 0 ? "Sharp right" : "Sharp left";
}

function metersToText(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  const mi = m / 1609.344;
  return `${mi.toFixed(2)} mi (${km.toFixed(2)} km)`;
}

// Bounding box around a set of {lat, lon} points, padded by a fraction of the
// span (with a floor so a tight cluster of checkpoints still gets some margin
// to search for connecting roads).
function boundingBox(points, padFraction = 0.25, minPadDeg = 0.01) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  const latPad = Math.max((maxLat - minLat) * padFraction, minPadDeg);
  const lonPad = Math.max((maxLon - minLon) * padFraction, minPadDeg);
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
  };
}

function bboxAreaKm2(bbox) {
  const latSpanKm = (bbox.maxLat - bbox.minLat) * 111;
  const midLat = (bbox.maxLat + bbox.minLat) / 2;
  const lonSpanKm = (bbox.maxLon - bbox.minLon) * 111 * Math.cos(toRad(midLat));
  return Math.abs(latSpanKm * lonSpanKm);
}
