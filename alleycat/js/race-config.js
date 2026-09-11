// race-config.js — editable Providence race data and validation rules.

(function () {
  "use strict";

  const providence = (name) => `${name}, Providence, RI`;

  const DEFAULT_RACE_CONFIG = {
    version: 1,
    status: "Working draft",
    raceName: "ZigZag Alleycat",
    qualifierLimit: 10,
    // Five staffed locations are currently placed on Manifest 1. The sixth
    // confirmed worker remains unassigned until her race-morning location is
    // known, so the draft cannot require an impossible sixth card yet.
    requiredPokemonCards: 5,
    startFinish: {
      id: "dexter-training-ground",
      name: "Dexter Training Ground",
      query: "Dexter Training Ground, Providence, RI",
      lat: 41.8145290,
      lon: -71.4321590,
      coordinateSource: "Race organizer's shared Google Maps list",
    },
    workers: [
      { id: "worker-prospect", name: "Prospect Terrace checkpoint worker", checkpointId: "prospect-terrace", active: true },
      { id: "worker-st-johns", name: "St. John's Park checkpoint worker", checkpointId: "st-johns-park", active: true },
      { id: "worker-wwi", name: "World War I Memorial checkpoint worker", checkpointId: "world-war-i-memorial", active: true },
      { id: "worker-dash", name: "Dash Bicycle Shop checkpoint worker", checkpointId: "dash-bicycle-shop", active: true },
      { id: "worker-crypt", name: "The Crypt checkpoint worker", checkpointId: "the-crypt", active: true },
      { id: "worker-nolan", name: "Nolan's girlfriend", checkpointId: null, active: true, note: "Checkpoint location TBD" },
    ],
    manifest1: [
      { id: "prospect-terrace", name: "Prospect Terrace", query: providence("Prospect Terrace"), type: "STAFFED", lat: 41.8298915, lon: -71.4072831, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "st-johns-park", name: "St. John's Park", query: providence("St. John's Park"), type: "STAFFED", lat: 41.8236168, lon: -71.4295861, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "main-green", name: "Main Green", query: providence("Main Green Brown University"), type: "SELFIE", lat: 41.8262257, lon: -71.4033271, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "panaderia-salvadorena", name: "Panaderia Salvadoreña", query: providence("Panaderia Salvadoreña"), type: "SELFIE", lat: 41.8170446, lon: -71.4431552, coordinateSource: "Race organizer's shared Google Maps list" },
      {
        id: "wriston-quadrangle", name: "Wriston Quadrangle", query: providence("Wriston Quadrangle Brown University"), type: "SELFIE",
        lat: 41.8248571, lon: -71.4016692, coordinateSource: "Race organizer's shared Google Maps list",
        requirement: "Selfie with the statue/location clearly visible.",
      },
      {
        id: "oak-hill-raleigh", name: "Oak Hill Ave & Raleigh Ave", query: "Oak Hill Ave & Raleigh Ave, Pawtucket, RI", type: "SELFIE",
        lat: 41.8602727, lon: -71.3865028, coordinateSource: "Race organizer's shared Google Maps list",
        requirement: "Photo/selfie verifying the intersection.",
      },
      { id: "sackett-street-park", name: "Sackett Street Park", query: providence("Sackett Street Park"), type: "SELFIE", lat: 41.7942507, lon: -71.4175056, coordinateSource: "Race organizer's shared Google Maps list" },
      {
        id: "108-rice-st", name: "108 Rice St", query: "108 Rice St, Providence, RI 02907", type: "SELFIE",
        lat: 41.8149201, lon: -71.4219967,
        coordinateSource: "Race organizer's saved Google Maps pin",
        requirement: "Use this organizer-saved Providence pin near Rock Spot Climbing. Do not substitute another 108 Rice Street.",
      },
      { id: "fenner-square", name: "Fenner Square", query: providence("Fenner Square"), type: "SELFIE", lat: 41.8230647, lon: -71.3941900, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "collier-point-park", name: "Collier Point Park", query: providence("Collier Point Park"), type: "SELFIE", lat: 41.8128544, lon: -71.4021057, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "la-creperie", name: "La Creperie", query: providence("La Creperie"), type: "SELFIE", lat: 41.8277782, lon: -71.4001938, coordinateSource: "Race organizer's shared Google Maps list" },
      {
        id: "providence-place", name: "Providence Place", query: providence("Providence Place parking garage"), type: "SELFIE",
        lat: 41.8291881, lon: -71.4168073, coordinateSource: "Race organizer's shared Google Maps list",
        requirement: "Go to the TOP OF THE PARKING GARAGE on the STATE HOUSE SIDE. Elevator allowed. Selfie must clearly show rider/bike and the location or State House view.",
      },
      { id: "world-war-i-memorial", name: "World War I Memorial", query: providence("World War I Memorial"), type: "STAFFED", lat: 41.8252210, lon: -71.4078347, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "dash-bicycle-shop", name: "Dash Bicycle Shop", query: providence("Dash Bicycle Shop"), type: "STAFFED", lat: 41.8206531, lon: -71.4249969, coordinateSource: "Race organizer's shared Google Maps list" },
      {
        id: "the-arcade", name: "The Arcade", query: providence("The Arcade Providence"), type: "SELFIE",
        lat: 41.8241699, lon: -71.4106860, coordinateSource: "Race organizer's shared Google Maps list",
        requirement: "Selfie MUST be taken INSIDE The Arcade. A selfie outside the entrance does not count.",
      },
      {
        id: "the-crypt", name: "The Crypt", query: providence("The Crypt game store"), type: "STAFFED",
        lat: 41.8179953, lon: -71.4099517, coordinateSource: "Race organizer's shared Google Maps list",
        note: "The Crypt is open for business. Keep the checkpoint interaction quick and simple.",
      },
    ],
    manifest2: [
      { id: "10-weybosset", name: "10 Weybosset St", query: "10 Weybosset St, Providence, RI 02903", type: "SELFIE", lat: 41.8246401, lon: -71.4094504, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "femme-fatale", name: "Femme Fatale", query: providence("Femme Fatale beauty salon"), type: "SELFIE", lat: 41.8291054, lon: -71.3955903, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "copacetic-jewelers", name: "Copacetic Jewelers", query: providence("Copacetic Jewelers"), type: "SELFIE", lat: 41.8232519, lon: -71.4098540, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "burnside-park", name: "Burnside Park", query: providence("Burnside Park"), type: "SELFIE", lat: 41.8254332, lon: -71.4121410, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "cathedral", name: "Cathedral of Saints Peter & Paul", query: providence("Cathedral of Saints Peter & Paul"), type: "SELFIE", lat: 41.8192780, lon: -71.4165113, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "thrifty-goose", name: "The Thrifty Goose", query: providence("The Thrifty Goose Thrift Shop"), type: "SELFIE", lat: 41.8322639, lon: -71.3857955, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "pizza-marvin", name: "Pizza Marvin", query: providence("Pizza Marvin"), type: "SELFIE", lat: 41.8204346, lon: -71.3938124, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "luongo-square", name: "Luongo Square", query: providence("Luongo Square"), type: "SELFIE", lat: 41.8185066, lon: -71.4267119, coordinateSource: "Race organizer's shared Google Maps list" },
      { id: "holy-name-church", name: "Holy Name Church", query: providence("Holy Name Church"), type: "SELFIE", lat: 41.8404352, lon: -71.4032045, coordinateSource: "Race organizer's shared Google Maps list" },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanCheckpoint(checkpoint, fallbackType) {
    const item = checkpoint && typeof checkpoint === "object" ? checkpoint : {};
    const type = item.type === "STAFFED" ? "STAFFED" : fallbackType;
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    return {
      ...item,
      id: String(item.id || `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      name: String(item.name || "New checkpoint").trim(),
      query: String(item.query || item.name || "").trim(),
      type,
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
    };
  }

  function normalizeConfig(input) {
    const value = input && typeof input === "object" ? input : {};
    const base = clone(DEFAULT_RACE_CONFIG);
    const start = value.startFinish && typeof value.startFinish === "object" ? value.startFinish : base.startFinish;
    const startLat = Number(start.lat);
    const startLon = Number(start.lon);
    return {
      ...base,
      ...value,
      version: 1,
      raceName: String(value.raceName || base.raceName).trim(),
      qualifierLimit: Math.max(1, Math.floor(Number(value.qualifierLimit) || base.qualifierLimit)),
      requiredPokemonCards: Math.max(0, Math.floor(Number(
        value.requiredPokemonCards === undefined || value.requiredPokemonCards === null
          ? base.requiredPokemonCards
          : value.requiredPokemonCards
      ) || 0)),
      startFinish: {
        ...base.startFinish,
        ...start,
        name: String(start.name || base.startFinish.name).trim(),
        query: String(start.query || start.name || base.startFinish.query).trim(),
        lat: Number.isFinite(startLat) ? startLat : undefined,
        lon: Number.isFinite(startLon) ? startLon : undefined,
      },
      workers: (Array.isArray(value.workers) ? value.workers : base.workers).map((worker) => ({
        ...worker,
        id: String(worker.id || `worker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        name: String(worker.name || "New checkpoint worker").trim(),
        checkpointId: worker.checkpointId || null,
        active: worker.active !== false,
      })),
      manifest1: (Array.isArray(value.manifest1) ? value.manifest1 : base.manifest1).map((cp) => cleanCheckpoint(cp, "SELFIE")),
      manifest2: (Array.isArray(value.manifest2) ? value.manifest2 : base.manifest2).map((cp) => ({ ...cleanCheckpoint(cp, "SELFIE"), type: "SELFIE" })),
    };
  }

  function getRaceIssues(config) {
    const race = normalizeConfig(config);
    const issues = [];
    const staffed = race.manifest1.filter((cp) => cp.type === "STAFFED");
    const activeWorkers = race.workers.filter((worker) => worker.active);
    const unassigned = activeWorkers.filter((worker) => !worker.checkpointId);
    const activeAssignments = new Set(activeWorkers.map((worker) => worker.checkpointId).filter(Boolean));
    const unstaffedLocations = staffed.filter((cp) => !activeAssignments.has(cp.id));

    if (unassigned.length) {
      issues.push({ level: "warning", code: "unassigned-workers", message: `${unassigned.length} confirmed worker${unassigned.length === 1 ? "" : "s"} still need${unassigned.length === 1 ? "s" : ""} a checkpoint: ${unassigned.map((w) => w.name).join(", ")}.` });
    }
    if (unstaffedLocations.length) {
      issues.push({ level: "warning", code: "staffed-without-worker", message: `Assign a worker to: ${unstaffedLocations.map((cp) => cp.name).join(", ")}.` });
    }
    if (race.requiredPokemonCards !== staffed.length) {
      issues.push({ level: "warning", code: "card-count", message: `Required card count is ${race.requiredPokemonCards}, but Manifest 1 currently has ${staffed.length} staffed checkpoints.` });
    }
    const requiredZigzag = ["oak-hill-raleigh", "sackett-street-park", "108-rice-st", "fenner-square"];
    const actual = race.manifest1.map((cp) => cp.id);
    const positions = requiredZigzag.map((id) => actual.indexOf(id));
    if (positions.some((position) => position < 0) || !positions.every((position, index) => index === 0 || position === positions[index - 1] + 1)) {
      issues.push({ level: "warning", code: "zigzag-sequence", message: "The intentional Oak Hill → Sackett Street Park → 108 Rice St → Fenner Square sequence is no longer intact." });
    }
    if (race.manifest1.some((cp) => /10\s+weybosset/i.test(`${cp.name} ${cp.query}`))) {
      issues.push({ level: "error", code: "weybosset-manifest-1", message: "10 Weybosset St is reserved for Manifest 2 and cannot appear in Manifest 1." });
    }
    if (!race.manifest1.length) issues.push({ level: "error", code: "empty-m1", message: "Manifest 1 has no checkpoints." });
    if (!race.manifest2.length) issues.push({ level: "error", code: "empty-m2", message: "Manifest 2 has no checkpoints." });
    return issues;
  }

  function buildRouteDefinition(config, manifestNumber) {
    const race = normalizeConfig(config);
    const source = manifestNumber === 2 ? race.manifest2 : race.manifest1;
    const start = {
      raceId: race.startFinish.id,
      address: race.startFinish.name,
      query: race.startFinish.query,
      lat: race.startFinish.lat,
      lon: race.startFinish.lon,
      coordinateSource: race.startFinish.coordinateSource || "",
      type: "START / FINISH",
      manifestNumber: "S",
      locked: true,
      instructions: `Start and return here: ${race.startFinish.name}`,
    };
    return {
      name: `Manifest ${manifestNumber === 2 ? "2" : "1"}`,
      orderMode: manifestNumber === 2 ? "optimize" : "fixed",
      lockOrder: manifestNumber !== 2,
      loop: true,
      checkpoints: [start, ...source.map((cp, index) => ({
        raceId: cp.id,
        manifestNumber: index + 1,
        address: cp.name,
        query: cp.query || cp.name,
        lat: cp.lat,
        lon: cp.lon,
        type: cp.type,
        instructions: cp.requirement || cp.note || "",
        coordinateSource: cp.coordinateSource || "",
      }))],
    };
  }

  window.ZigZagRaceConfig = {
    DEFAULT_RACE_CONFIG,
    cloneDefault: () => clone(DEFAULT_RACE_CONFIG),
    clone,
    normalizeConfig,
    getRaceIssues,
    buildRouteDefinition,
  };
})();
