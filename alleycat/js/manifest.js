// manifest.js — camera OCR and address-list cleanup for race manifests.
// OCR runs entirely in the browser with the vendored Tesseract worker, core,
// and English language model. The text is always shown for human review before
// any address is used for routing.

const MAX_MANIFEST_CHECKPOINTS = 30;
let _ocrWorkerPromise = null;
let _ocrProgressListener = null;

const ZIGZAG_START_FINISH = {
  name: "Dexter Training Ground",
  query: "Dexter Training Ground, Providence, RI",
  lat: 41.8145290,
  lon: -71.4321590,
  type: "START / FINISH",
};

// Organizer-verified pins make the printed Providence manifests deterministic.
// They are only selected after OCR finds enough matching text on the uploaded
// sheet; ordinary manifests continue through the editable text/geocoder flow.
const ZIGZAG_PRINTED_MANIFESTS = [
  {
    number: 1,
    label: "Manifest 1",
    orderMode: "fixed",
    loop: true,
    markers: ["COMPLETE IN ORDER", "PROSPECT TERRACE", "STAFFED"],
    checkpoints: [
      ["Prospect Terrace", "Prospect Terrace, Providence, RI", 41.8298915, -71.4072831, "STAFFED"],
      ["St. John's Park", "St. John's Park, Providence, RI", 41.8236168, -71.4295861, "STAFFED"],
      ["Main Green", "Main Green Brown University, Providence, RI", 41.8262257, -71.4033271, "SELFIE"],
      ["Panaderia Salvadoreña", "Panaderia Salvadoreña, Providence, RI", 41.8170446, -71.4431552, "SELFIE"],
      ["Wriston Quadrangle", "Wriston Quadrangle Brown University, Providence, RI", 41.8248571, -71.4016692, "SELFIE"],
      ["Oak Hill Ave & Raleigh Ave", "Oak Hill Ave & Raleigh Ave, Pawtucket, RI", 41.8602727, -71.3865028, "SELFIE"],
      ["Sackett Street Park", "Sackett Street Park, Providence, RI", 41.7942507, -71.4175056, "SELFIE"],
      ["108 Rice St", "108 Rice St, Providence, RI 02907", 41.8149201, -71.4219967, "SELFIE"],
      ["Fenner Square", "Fenner Square, Providence, RI", 41.8230647, -71.3941900, "SELFIE"],
      ["Collier Point Park", "Collier Point Park, Providence, RI", 41.8128544, -71.4021057, "SELFIE"],
      ["La Creperie", "La Creperie, Providence, RI", 41.8277782, -71.4001938, "SELFIE"],
      ["Providence Place", "Providence Place parking garage, Providence, RI", 41.8291881, -71.4168073, "SELFIE"],
      ["World War I Memorial", "World War I Memorial, Providence, RI", 41.8252210, -71.4078347, "STAFFED"],
      ["Dash Bicycle Shop", "Dash Bicycle Shop, Providence, RI", 41.8206531, -71.4249969, "STAFFED"],
      ["The Arcade", "The Arcade Providence, Providence, RI", 41.8241699, -71.4106860, "SELFIE"],
      ["The Crypt", "The Crypt game store, Providence, RI", 41.8179953, -71.4099517, "STAFFED"],
    ],
  },
  {
    number: 2,
    label: "Manifest 2",
    orderMode: "optimize",
    loop: true,
    markers: ["ALL CHECKPOINTS ARE SELFIE", "10 WEYBOSSET", "TOP 10 ONLY"],
    checkpoints: [
      ["10 Weybosset St", "10 Weybosset St, Providence, RI 02903", 41.8246401, -71.4094504, "SELFIE"],
      ["Femme Fatale", "Femme Fatale beauty salon, Providence, RI", 41.8291054, -71.3955903, "SELFIE"],
      ["Copacetic Jewelers", "Copacetic Jewelers, Providence, RI", 41.8232519, -71.4098540, "SELFIE"],
      ["Burnside Park", "Burnside Park, Providence, RI", 41.8254332, -71.4121410, "SELFIE"],
      ["Cathedral of Saints Peter & Paul", "Cathedral of Saints Peter & Paul, Providence, RI", 41.8192780, -71.4165113, "SELFIE"],
      ["The Thrifty Goose", "The Thrifty Goose Thrift Shop, Providence, RI", 41.8322639, -71.3857955, "SELFIE"],
      ["Pizza Marvin", "Pizza Marvin, Providence, RI", 41.8204346, -71.3938124, "SELFIE"],
      ["Luongo Square", "Luongo Square, Providence, RI", 41.8185066, -71.4267119, "SELFIE"],
      ["Holy Name Church", "Holy Name Church, Providence, RI", 41.8404352, -71.4032045, "SELFIE"],
    ],
  },
];

function cleanManifestLine(raw) {
  return String(raw || "")
    .replace(/[|]+$/g, "")
    .replace(/^\s*(?:checkpoint|check|cp)?\s*#?\d{1,2}\s*[:.)-]\s*/i, "")
    .replace(/^\s*[-•*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function manifestLines(text) {
  const source = String(text || "").replace(/\r/g, "").replace(/\f/g, "\n");
  const rawLines = source.includes("\n") ? source.split("\n") : source.split(/\s*;\s*/);
  return rawLines
    .map(cleanManifestLine)
    .filter((line) => line.length >= 3 && !/^(?:race\s+)?manifest$|^checkpoints?$|^addresses?$|^checkpoint\s+list$/i.test(line))
    .slice(0, MAX_MANIFEST_CHECKPOINTS);
}

function cleanManifestText(text) {
  return manifestLines(text).join("\n");
}

function _normalizeOcrSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _checkpointSignature(name) {
  return _normalizeOcrSearchText(name).split(" ").filter((token) => token.length > 1);
}

function _matchesCheckpoint(normalizedOcr, name) {
  const tokens = _checkpointSignature(name);
  return tokens.length > 0 && tokens.every((token) => normalizedOcr.includes(token));
}

function detectZigZagPrintedManifest(rawText) {
  const normalized = _normalizeOcrSearchText(rawText);
  if (!normalized.includes("DEXTER") || (!normalized.includes("SELFIE") && !normalized.includes("STAFFED"))) return null;

  let best = null;
  for (const manifest of ZIGZAG_PRINTED_MANIFESTS) {
    const checkpointMatches = manifest.checkpoints.filter((cp) => _matchesCheckpoint(normalized, cp[0])).length;
    const markerMatches = manifest.markers.filter((marker) => normalized.includes(_normalizeOcrSearchText(marker))).length;
    const required = manifest.number === 1 ? 6 : 4;
    if (checkpointMatches < required || markerMatches < 1) continue;
    if (!best || checkpointMatches > best.checkpointMatches) best = { manifest, checkpointMatches };
  }
  if (!best) return null;

  const checkpoints = [
    {
      ...ZIGZAG_START_FINISH,
      manifestNumber: "S",
      coordinateSource: "Race organizer's saved pin",
    },
    ...best.manifest.checkpoints.map(([name, query, lat, lon, type], index) => ({
      name, query, lat, lon, type,
      manifestNumber: index + 1,
      coordinateSource: "Race organizer's saved pin",
    })),
  ];
  return {
    label: best.manifest.label,
    text: checkpoints.map((cp) => cp.name).join("\n"),
    checkpoints,
    raceCheckpointCount: best.manifest.checkpoints.length,
    orderMode: best.manifest.orderMode,
    loop: best.manifest.loop,
    exactPins: true,
  };
}

function _structuredManifestLines(rawText) {
  const source = String(rawText || "").replace(/\r|\f/g, "\n");
  const looksStructured = /SELFIE|STAFFED/i.test(source) && /CHECKPOINT|RIDER\s+NAME|RACE\s+CONTROL|TYPE\s*\/\s*REQUIREMENT/i.test(source);
  if (!looksStructured) return [];

  const excluded = /ALLEYCAT|MANIFEST|COMPLETE|RIDER\s+NAME|CHECKPOINT|TYPE\s*\/|REQUIREMENT|SIGNATURE|INITIALS|SELFIE|STAFFED|WORKER|POK[EÉ]MON|IMPORTANT|PHOTO|LOCATION|INTERSECTION|FINISH|RACE\s+CONTROL|QUALIFICATION|COLLECTED|VERIFIED|TOP\s*10|RETURN\s+TO|WINNER\s+TIME|AM\s*\/\s*PM|PARKING\s+GARAGE|STATE\s+HOUSE/i;
  const candidates = [];
  for (const rawLine of source.split("\n")) {
    let line = cleanManifestLine(rawLine)
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/[^A-Za-z0-9À-ž&.'’ -]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 4 || line.length > 58 || excluded.test(line)) continue;
    const letters = line.match(/[A-Za-zÀ-ž]/g) || [];
    const uppercase = line.match(/[A-ZÀ-Þ]/g) || [];
    const words = line.match(/[A-Za-zÀ-ž]+/g) || [];
    if (letters.length < 4 || words.length < 2 || uppercase.length / letters.length < 0.72) continue;
    line = line.replace(/WORLD WAR\s*[|L]\s+MEMORIAL/i, "WORLD WAR I MEMORIAL");
    if (/^PETER\s*&\s*PAUL$/i.test(line) && candidates.length && /CATHEDRAL OF SAINTS$/i.test(candidates[candidates.length - 1])) {
      candidates[candidates.length - 1] += " PETER & PAUL";
    } else if (!candidates.some((item) => item.toLowerCase() === line.toLowerCase())) {
      candidates.push(line);
    }
  }
  return candidates.slice(0, MAX_MANIFEST_CHECKPOINTS);
}

function cleanOcrManifestText(text) {
  const structured = _structuredManifestLines(text);
  return (structured.length >= 2 ? structured : manifestLines(text)).join("\n");
}

function _canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

function _hasStrongRedInk(imageData) {
  const data = imageData.data;
  let sampled = 0;
  let strongRed = 0;
  for (let i = 0; i < data.length; i += 64) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sampled++;
    if (r - g > 48 && r - b > 48 && g < 220 && b < 220) strongRed++;
  }
  return sampled > 0 && strongRed / sampled > 0.0015;
}

function _isolateInk(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!_hasStrongRedInk(image)) return;
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const redInk = r - g > 44 && r - b > 44 && g < 224 && b < 224;
    const darkInk = r + g + b < 420;
    const value = redInk || darkInk ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

async function prepareOcrImages(file) {
  if (typeof createImageBitmap !== "function") return [{ image: file, page: 1, total: 1 }];
  const bitmap = await createImageBitmap(file);
  const isSpread = bitmap.width / bitmap.height >= 1.35;
  const total = isSpread ? 2 : 1;
  const pages = [];

  for (let page = 0; page < total; page++) {
    const sx = isSpread ? Math.round((bitmap.width * page) / 2) : 0;
    const sw = isSpread
      ? Math.round((bitmap.width * (page + 1)) / 2) - sx
      : bitmap.width;
    const sh = bitmap.height;
    const scale = Math.min(2.2, 2200 / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, sx, 0, sw, sh, 0, 0, canvas.width, canvas.height);
    _isolateInk(canvas);
    const blob = await _canvasToBlob(canvas);
    pages.push({ image: blob || file, page: page + 1, total });
  }
  bitmap.close();
  return pages;
}

function getOcrWorker() {
  if (_ocrWorkerPromise) return _ocrWorkerPromise;
  if (!window.Tesseract || typeof window.Tesseract.createWorker !== "function") {
    return Promise.reject(new Error("The on-device OCR engine did not load."));
  }

  const asset = (path) => new URL(path, window.location.href).href;
  _ocrWorkerPromise = window.Tesseract.createWorker("eng", 1, {
    workerPath: asset("vendor/tesseract/worker.min.js"),
    corePath: asset("vendor/tesseract/tesseract-core-lstm.wasm.js"),
    langPath: asset("vendor/tesseract/lang"),
    logger: (message) => {
      if (typeof _ocrProgressListener === "function") _ocrProgressListener(message);
    },
  }).then(async (worker) => {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
      tessedit_pageseg_mode: "11",
    });
    return worker;
  }).catch((err) => {
    _ocrWorkerPromise = null;
    throw err;
  });
  return _ocrWorkerPromise;
}

async function recognizeManifestImage(file, onProgress) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Choose a photo or image file.");
  }

  const pages = await prepareOcrImages(file).catch(() => [{ image: file, page: 1, total: 1 }]);
  let activePage = 0;
  _ocrProgressListener = (message) => {
    if (typeof onProgress !== "function") return;
    const local = Number.isFinite(message.progress) ? message.progress : 0;
    onProgress({
      ...message,
      status: pages.length > 1 ? `Reading page ${activePage + 1} of ${pages.length}` : message.status,
      progress: (activePage + local) / pages.length,
    });
  };

  try {
    const worker = await getOcrWorker();
    const rawPages = [];
    for (let index = 0; index < pages.length; index++) {
      activePage = index;
      const result = await worker.recognize(pages[index].image);
      const raw = result && result.data ? result.data.text : "";
      if (String(raw).trim()) rawPages.push(raw);
    }
    if (!rawPages.length) throw new Error("No readable text was found. Try a brighter, straighter photo.");

    const exactChoices = rawPages.map(detectZigZagPrintedManifest).filter(Boolean);
    const uniqueExact = exactChoices.filter((choice, index, all) =>
      all.findIndex((item) => item.label === choice.label) === index
    );
    const choices = uniqueExact.length
      ? uniqueExact
      : rawPages.map((raw, index) => ({
          label: rawPages.length > 1 ? `Page ${index + 1}` : "Scanned manifest",
          text: cleanOcrManifestText(raw),
          exactPins: false,
        })).filter((choice) => manifestLines(choice.text).length > 0);

    if (!choices.length) throw new Error("No checkpoint list was found. Try a closer photo of the checkpoint rows.");
    return { text: choices[0].text, choices };
  } finally {
    _ocrProgressListener = null;
  }
}

window.addEventListener("pagehide", () => {
  if (!_ocrWorkerPromise) return;
  _ocrWorkerPromise.then((worker) => worker.terminate()).catch(() => {});
  _ocrWorkerPromise = null;
});
