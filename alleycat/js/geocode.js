// geocode.js — thin client for the free Nominatim (OpenStreetMap) geocoder.
//
// Nominatim's usage policy caps public-instance requests at 1/sec and asks
// for a descriptive identifier. We enforce the rate limit client-side with a
// simple serial queue. For a race manifest with a handful of checkpoints this
// is plenty fast; if you outgrow it, swap NOMINATIM_BASE for a paid provider
// (or your own Nominatim instance) — everything downstream just wants
// {lat, lon, label} back.

const NOMINATIM_BASE = (window.ZIGZAG_CONFIG && window.ZIGZAG_CONFIG.nominatimBase) || "https://nominatim.openstreetmap.org";
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const GEOCODE_TIMEOUT_MS = 15000;
const GEOCODE_CACHE_KEY = "zigzag-geocode-cache-v1";
const GEOCODE_CACHE_LIMIT = 250;

let _geocodeQueueTail = Promise.resolve();
let _lastRequestAt = 0;

function _readGeocodeCache() {
  try { return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}"); }
  catch (_) { return {}; }
}

function _cacheGet(key) {
  const cache = _readGeocodeCache();
  return cache[key] || null;
}

function _cacheSet(key, value) {
  try {
    const cache = _readGeocodeCache();
    cache[key] = { ...value, cachedAt: Date.now() };
    const entries = Object.entries(cache).sort((a, b) => (b[1].cachedAt || 0) - (a[1].cachedAt || 0));
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, GEOCODE_CACHE_LIMIT))));
  } catch (_) { /* Private browsing or full storage: continue without cache. */ }
}

async function _fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) throw new Error(`Address search returned ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err && err.name === "AbortError") throw new Error("Address search timed out. Check your connection and try again.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function _throttled(fn) {
  const run = _geocodeQueueTail.then(async () => {
    const wait = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (Date.now() - _lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _lastRequestAt = Date.now();
    return fn();
  });
  // Keep the chain alive even if this call rejects, so later calls still run.
  _geocodeQueueTail = run.catch(() => {});
  return run;
}

// Forward geocode a free-text address into {lat, lon, label}.
// Throws if nothing is found.
async function geocodeAddress(query, area = null) {
  const scope = area ? `${area.lat.toFixed(3)},${area.lon.toFixed(3)}` : "world";
  const cacheKey = `q:${scope}:${String(query).trim().toLowerCase()}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;
  return _throttled(async () => {
    let url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    if (area) {
      const dy = 30 / 111;
      const dx = dy / Math.max(0.05, Math.cos(area.lat * Math.PI / 180));
      url += `&bounded=1&viewbox=${area.lon-dx},${Math.min(90,area.lat+dy)},${area.lon+dx},${Math.max(-90,area.lat-dy)}`;
    }
    const data = await _fetchJson(url);
    if (!data || data.length === 0) throw new Error(area ? "No nearby match. Edit the address, change race area, or drop a pin." : "No match found");
    const hit = data[0];
    const value = { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name };
    _cacheSet(cacheKey, value);
    return value;
  });
}

// Reverse geocode a dropped pin into a human label (best-effort — falls back
// to raw coordinates if it fails, since a pin is usable without a name).
async function reverseGeocode(lat, lon) {
  const cacheKey = `r:${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached.label;
  return _throttled(async () => {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const data = await _fetchJson(url);
    const label = data && data.display_name ? data.display_name : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    _cacheSet(cacheKey, { label });
    return label;
  }).catch(() => `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
}

async function identifyRaceArea(lat, lon) {
  return _throttled(async () => {
    const data = await _fetchJson(`${NOMINATIM_BASE}/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`);
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county;
    return { lat, lon, label: city ? [city, a.state, a.country].filter(Boolean).join(", ") : "your current location" };
  });
}
