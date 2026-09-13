// app.js — race-day UI, persistence, and the route-building pipeline.

(function () {
  "use strict";

  const STORAGE_KEY = "zigzag-race-state-v2";
  const state = {
    checkpoints: [], orderMode: "optimize", loop: false, pinMode: false,
    lastSolvedOrder: null, lastRoute: null, routeLine: null,
    building: false, editingId: null, importBusy: false,
  };

  let uidCounter = 0;
  const uid = () => `cp${++uidCounter}`;
  const $ = (sel) => document.querySelector(sel);

  const addressInput = $("#addressInput");
  const addBtn = $("#addBtn");
  const openImportBtn = $("#openImportBtn");
  const importDialog = $("#importDialog");
  const manifestImageInput = $("#manifestImageInput");
  const manifestPreview = $("#manifestPreview");
  const manifestText = $("#manifestText");
  const importCount = $("#importCount");
  const importManifestBtn = $("#importManifestBtn");
  const ocrStatus = $("#ocrStatus");
  const ocrProgress = $("#ocrProgress");
  const detectedManifestPicker = $("#detectedManifestPicker");
  const detectedManifestButtons = $("#detectedManifestButtons");
  const pinModeBtn = $("#pinModeBtn");
  const myLocationBtn = $("#myLocationBtn");
  const pinModeStatus = $("#pinModeStatus");
  const checkpointListEl = $("#checkpointList");
  const emptyHint = $("#emptyHint");
  const manifestActions = $("#manifestActions");
  const savedStatus = $("#savedStatus");
  const clearManifestBtn = $("#clearManifestBtn");
  const orderModeSeg = $("#orderModeSeg");
  const loopModeSeg = $("#loopModeSeg");
  const buildBtn = $("#buildBtn");
  const logEl = $("#log");
  const resultsPanel = $("#resultsPanel");
  const resultStats = $("#resultStats");
  const routeWarnings = $("#routeWarnings");
  const cueSheetBtn = $("#cueSheetBtn");
  const downloadGpxBtn = $("#downloadGpxBtn");
  const cueSheetEl = $("#cueSheet");
  const toggleSidebarBtn = $("#toggleSidebar");
  const sidebar = $("#sidebar");
  const networkStatus = $("#networkStatus");
  const offlineMapNotice = $("#offlineMapNotice");
  let detectedOcrChoices = [];
  let selectedOcrChoice = null;
  let settingOcrText = false;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function log(msg, cls) {
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearLog() { logEl.innerHTML = ""; }

  function loadSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || saved.version !== 2) return;
      state.checkpoints = (saved.checkpoints || []).filter((cp) => cp && cp.id && cp.address).map((cp) => {
        const located = Number.isFinite(cp.lat) && Number.isFinite(cp.lon);
        return {
          ...cp,
          lat: located ? cp.lat : null,
          lon: located ? cp.lon : null,
          status: located ? "ok" : cp.status === "error" ? "error" : "pending",
        };
      });
      state.orderMode = saved.orderMode === "optimize" ? "optimize" : "fixed";
      state.loop = Boolean(saved.loop);
      state.lastRoute = saved.lastRoute && Array.isArray(saved.lastRoute.coords) ? saved.lastRoute : null;
      state.lastSolvedOrder = state.lastRoute ? state.lastRoute.order : null;
      uidCounter = state.checkpoints.reduce((max, cp) => {
        const n = Number(String(cp.id).replace(/^cp/, ""));
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0);
    } catch (_) { /* Corrupt or blocked storage should never prevent startup. */ }
  }

  function saveState() {
    try {
      const checkpoints = state.checkpoints.map(({
        id, address, query, lat, lon, status, errorMsg, raceId, type,
        instructions, coordinateSource, manifestNumber, locked, raceOrderLocked,
      }) =>
        ({ id, address, query, lat, lon, status, errorMsg, raceId, type, instructions, coordinateSource, manifestNumber, locked, raceOrderLocked })
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2, checkpoints, orderMode: state.orderMode,
        loop: state.loop, lastRoute: state.lastRoute,
      }));
      savedStatus.textContent = "Saved on this device";
      savedStatus.classList.remove("err");
    } catch (_) {
      savedStatus.textContent = "Could not save on this device";
      savedStatus.classList.add("err");
    }
  }

  loadSavedState();

  // ---- Map and connectivity ----
  const map = L.map("map", { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const markersLayer = L.layerGroup().addTo(map);

  function updateNetworkState() {
    const online = navigator.onLine !== false;
    networkStatus.textContent = online ? "Online" : "Offline";
    networkStatus.classList.toggle("offline", !online);
    offlineMapNotice.classList.toggle("hidden", online);
    map.getContainer().classList.toggle("offline-map", !online);
  }
  window.addEventListener("online", updateNetworkState);
  window.addEventListener("offline", updateNetworkState);
  updateNetworkState();

  const AREA_STORAGE_KEY = "zigzag-race-area-v1";
  let raceArea = null;
  try {
    const savedArea = JSON.parse(localStorage.getItem(AREA_STORAGE_KEY) || "null");
    if (savedArea && Number.isFinite(savedArea.lat) && Math.abs(savedArea.lat) <= 90 &&
        Number.isFinite(savedArea.lon) && Math.abs(savedArea.lon) <= 180 && typeof savedArea.label === "string") raceArea = savedArea;
  } catch (_) { /* Ignore unavailable or invalid saved location. */ }
  let areaVersion = 0;
  const locationStatus = $("#locationStatus");
  function applyArea(area, source = "gps") {
    raceArea = {...area, source};
    try { localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(raceArea)); } catch (_) { /* Location still works for this visit. */ }
    locationStatus.textContent = `Searching near ${area.label}. Review every pin.`;
    map.setView([area.lat, area.lon], 13);
  }
  async function detectArea() {
    const version = ++areaVersion;
    locationStatus.textContent = "Finding your race area…";
    try {
      if (!navigator.geolocation) throw new Error("Location unavailable");
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
        { timeout: 12000, maximumAge: 30000, enableHighAccuracy: true }));
      const { latitude: lat, longitude: lon } = pos.coords;
      let area = { lat, lon, label: "your current location" };
      try { area = await identifyRaceArea(lat, lon); } catch (_) { /* GPS still scopes searches without a city name. */ }
      if (version === areaVersion) applyArea(area);
    } catch (_) {
      if (version === areaVersion) locationStatus.textContent = raceArea
        ? `Location unavailable. Using saved area: ${raceArea.label}. Change race area if you are elsewhere.`
        : "Location unavailable. Open Change race area and enter a city, or drop pins on the map.";
    }
  }
  if (raceArea) applyArea(raceArea, raceArea.source || "gps");
  let areaReady = raceArea && raceArea.source === "manual" ? Promise.resolve() : detectArea();
  $("#detectCityBtn").addEventListener("click", () => { areaReady = detectArea(); });
  $("#setCityBtn").addEventListener("click", () => {
    const city = $("#cityInput").value.trim();
    if (!city) return;
    const version = ++areaVersion;
    raceArea = null;
    locationStatus.textContent = "Finding city…";
    areaReady = (async () => {
      try {
        const area = await geocodeAddress(city);
        if (version === areaVersion) applyArea(area, "manual");
      } catch (_) {
        if (version === areaVersion) locationStatus.textContent = "City not found. Include the region and country, then try again.";
      }
    })();
  });
  $("#cityInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); $("#setCityBtn").click(); }
  });

  map.on("click", (e) => {
    if (!state.pinMode) return;
    setPinMode(false);
    addCheckpointFromPin(e.latlng.lat, e.latlng.lng);
  });

  // ---- Checkpoint list ----
  function actionButton(text, label, onClick, disabled = false, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `item-action ${extraClass}`.trim();
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderCheckpointList() {
    checkpointListEl.innerHTML = "";
    const hasCheckpoints = state.checkpoints.length > 0;
    emptyHint.classList.toggle("hidden", hasCheckpoints);
    manifestActions.classList.toggle("hidden", !hasCheckpoints);

    state.checkpoints.forEach((cp, idx) => {
      const li = document.createElement("li");
      li.className = `checkpoint-item${cp.locked ? " locked" : ""}`;
      li.draggable = state.editingId !== cp.id && !cp.locked && !cp.raceOrderLocked;
      li.dataset.index = String(idx);

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(cp.manifestNumber || idx + 1);
      li.appendChild(num);

      if (state.editingId === cp.id) {
        const editor = document.createElement("form");
        editor.className = "checkpoint-editor";
        const input = document.createElement("input");
        input.type = "text";
        input.value = cp.address;
        input.setAttribute("aria-label", `Edit checkpoint ${idx + 1}`);
        const controls = document.createElement("div");
        controls.className = "checkpoint-editor-actions";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn ghost small";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => { state.editingId = null; renderCheckpointList(); });
        const save = document.createElement("button");
        save.type = "submit";
        save.className = "btn primary small";
        save.textContent = "Save & locate";
        controls.append(cancel, save);
        editor.append(input, controls);
        editor.addEventListener("submit", (event) => {
          event.preventDefault();
          updateCheckpointAddress(cp.id, input.value.trim());
        });
        li.appendChild(editor);
        checkpointListEl.appendChild(li);
        requestAnimationFrame(() => input.focus());
        return;
      }

      const info = document.createElement("div");
      info.className = "info";
      const addr = document.createElement("div");
      addr.className = "addr";
      addr.textContent = cp.address;
      if (cp.type) {
        const type = document.createElement("span");
        type.className = `checkpoint-type ${String(cp.type).toLowerCase().replace(/[^a-z]+/g, "-")}`;
        type.textContent = cp.type;
        addr.append(" ", type);
      }
      if (cp.instructions) {
        const instructions = document.createElement("div");
        instructions.className = "checkpoint-instructions";
        instructions.textContent = cp.instructions;
        info.append(addr, instructions);
      } else {
        info.append(addr);
      }
      const geostate = document.createElement("div");
      geostate.className = "geostate " + (cp.status === "ok" ? "ok" : cp.status === "error" ? "err" : "");
      geostate.textContent = cp.status === "ok"
        ? `${cp.lat.toFixed(5)}, ${cp.lon.toFixed(5)}${cp.coordinateSource ? ` · ${cp.coordinateSource}` : ""}`
        : cp.status === "error" ? (cp.errorMsg || "Could not locate") : "Locating…";
      info.append(geostate);

      const actions = document.createElement("div");
      actions.className = "checkpoint-actions";
      actions.append(
        actionButton("↑", `Move checkpoint ${idx + 1} up`, () => moveCheckpoint(cp.id, -1), cp.locked || cp.raceOrderLocked || idx === 0),
        actionButton("↓", `Move checkpoint ${idx + 1} down`, () => moveCheckpoint(cp.id, 1), cp.locked || cp.raceOrderLocked || idx === state.checkpoints.length - 1),
        actionButton("✎", `Edit checkpoint ${idx + 1}`, () => { state.editingId = cp.id; renderCheckpointList(); }, cp.locked || cp.raceOrderLocked),
        actionButton("✕", `Remove checkpoint ${idx + 1}`, () => removeCheckpoint(cp.id), cp.locked || cp.raceOrderLocked, "rm")
      );
      li.append(info, actions);
      checkpointListEl.appendChild(li);
    });

    setupDragReorder();
    renderCheckpointMarkers();
    updateBuildButtonState();
  }

  function setupDragReorder() {
    let dragIndex = null;
    checkpointListEl.querySelectorAll(".checkpoint-item[draggable=true]").forEach((li) => {
      li.addEventListener("dragstart", () => {
        dragIndex = Number(li.dataset.index);
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", () => li.classList.remove("dragging"));
      li.addEventListener("dragover", (e) => e.preventDefault());
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        reorderCheckpoint(dragIndex, Number(li.dataset.index));
      });
    });
  }

  function reorderCheckpoint(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || to >= state.checkpoints.length) return;
    const [moved] = state.checkpoints.splice(from, 1);
    if (!moved) return;
    state.checkpoints.splice(to, 0, moved);
    invalidateRoute();
    renderCheckpointList();
    saveState();
  }
  function moveCheckpoint(id, delta) {
    const from = state.checkpoints.findIndex((cp) => cp.id === id);
    reorderCheckpoint(from, from + delta);
  }

  function renderCheckpointMarkers() {
    markersLayer.clearLayers();
    const order = state.lastSolvedOrder || state.checkpoints.map((_, i) => i);
    const configuredRace = Boolean(state.checkpoints[0] && state.checkpoints[0].locked);
    order.forEach((cpIdx, pos) => {
      const cp = state.checkpoints[cpIdx];
      if (!cp || !Number.isFinite(cp.lat)) return;
      const startFinish = cp.manifestNumber === "S" || cp.type === "START / FINISH";
      const markerLabel = startFinish ? "S" : configuredRace ? String(pos) : String(pos + 1);
      const icon = L.divIcon({
        className: "", html: `<div class="cp-marker"><span>${markerLabel}</span></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });
      L.marker([cp.lat, cp.lon], { icon }).addTo(markersLayer)
        .bindPopup(`${escapeHtml(markerLabel)}. ${escapeHtml(cp.address)}${cp.type ? `<br><b>${escapeHtml(cp.type)}</b>` : ""}${cp.instructions ? `<br>${escapeHtml(cp.instructions)}` : ""}`);
    });
  }

  function updateBuildButtonState() {
    const ready = state.checkpoints.length >= 2 &&
      state.checkpoints.every((cp) => cp.status === "ok") && !state.building;
    buildBtn.disabled = !ready;
  }

  function invalidateRoute() {
    state.lastSolvedOrder = null;
    state.lastRoute = null;
    resultsPanel.classList.add("hidden");
    if (state.routeLine) { map.removeLayer(state.routeLine); state.routeLine = null; }
  }

  async function geocodeCheckpoint(cp) {
    try {
      await areaReady;
      if (!raceArea) throw new Error("Set your race city under Change race area, then retry this stop.");
      const hit = await geocodeAddress(cp.query || cp.address, raceArea);
      cp.lat = hit.lat; cp.lon = hit.lon; cp.status = "ok"; cp.errorMsg = null;
    } catch (err) {
      cp.status = "error"; cp.errorMsg = err.message || "Not found";
    }
    renderCheckpointList();
    saveState();
  }

  async function addCheckpointFromAddress(text) {
    if (!text || state.checkpoints.length >= MAX_MANIFEST_CHECKPOINTS) return;
    const cp = { id: uid(), address: text, query: text, lat: null, lon: null, status: "pending" };
    state.checkpoints.push(cp);
    invalidateRoute();
    renderCheckpointList();
    saveState();
    await geocodeCheckpoint(cp);
  }

  async function addCheckpointFromPin(lat, lon, asStart = false) {
    if (state.checkpoints.length >= MAX_MANIFEST_CHECKPOINTS) return;
    const cp = { id: uid(), address: "Dropped pin", query: "", lat, lon, status: "ok" };
    if (asStart) state.checkpoints.unshift(cp);
    else state.checkpoints.push(cp);
    invalidateRoute();
    renderCheckpointList();
    saveState();
    cp.address = await reverseGeocode(lat, lon);
    renderCheckpointList();
    saveState();
  }

  function removeCheckpoint(id) {
    state.checkpoints = state.checkpoints.filter((cp) => cp.id !== id);
    state.editingId = null;
    invalidateRoute();
    renderCheckpointList();
    saveState();
  }

  async function updateCheckpointAddress(id, text) {
    const cp = state.checkpoints.find((item) => item.id === id);
    if (!cp || !text) return;
    state.editingId = null;
    if (cp.address === text && cp.status === "ok") { renderCheckpointList(); return; }
    cp.address = text; cp.query = text; cp.lat = null; cp.lon = null; cp.status = "pending"; cp.errorMsg = null;
    invalidateRoute();
    renderCheckpointList();
    await geocodeCheckpoint(cp);
  }

  addBtn.addEventListener("click", () => {
    const text = addressInput.value.trim();
    if (!text) return;
    addressInput.value = "";
    addCheckpointFromAddress(text);
  });
  addressInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });

  function setPinMode(enabled) {
    state.pinMode = enabled;
    pinModeStatus.textContent = enabled ? "Tap the map once…" : "";
    pinModeBtn.style.borderColor = enabled ? "var(--accent)" : "";
    pinModeBtn.style.color = enabled ? "var(--accent)" : "";
    map.getContainer().style.cursor = enabled ? "crosshair" : "";
  }
  pinModeBtn.addEventListener("click", () => setPinMode(!state.pinMode));

  myLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { log("This browser cannot access your location.", "err"); return; }
    myLocationBtn.disabled = true;
    myLocationBtn.textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        myLocationBtn.disabled = false; myLocationBtn.textContent = "◎ Start here";
        addCheckpointFromPin(pos.coords.latitude, pos.coords.longitude, true);
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      },
      (err) => {
        myLocationBtn.disabled = false; myLocationBtn.textContent = "◎ Start here";
        log(`Location unavailable: ${err.message || "permission denied"}`, "err");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });

  clearManifestBtn.addEventListener("click", () => {
    if (!window.confirm("Clear every checkpoint and the saved route from this device?")) return;
    state.checkpoints = [];
    state.editingId = null;
    invalidateRoute();
    clearLog();
    renderCheckpointList();
    saveState();
  });

  // ---- Camera / paste manifest import ----
  function openImporter() {
    ocrStatus.textContent = "";
    ocrStatus.classList.remove("err");
    updateImportCount();
    if (typeof importDialog.showModal === "function") importDialog.showModal();
    else importDialog.setAttribute("open", "");
  }

  function updateImportCount() {
    const lines = manifestLines(manifestText.value);
    const room = MAX_MANIFEST_CHECKPOINTS - state.checkpoints.length;
    const exactSelection = selectedOcrChoice && selectedOcrChoice.exactPins &&
      manifestText.value.trim() === selectedOcrChoice.text.trim();
    importCount.textContent = exactSelection
      ? `${selectedOcrChoice.raceCheckpointCount} race checkpoints + Dexter start/finish ready`
      : `${lines.length} checkpoint${lines.length === 1 ? "" : "s"} ready` +
        (lines.length > room ? ` · only ${room} spaces remain` : "");
    importManifestBtn.disabled = state.importBusy || lines.length === 0 || (!exactSelection && room <= 0);
  }

  function selectDetectedManifest(index) {
    const choice = detectedOcrChoices[index];
    if (!choice) return;
    selectedOcrChoice = choice;
    settingOcrText = true;
    manifestText.value = choice.text;
    settingOcrText = false;
    detectedManifestButtons.querySelectorAll("button").forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    updateImportCount();
  }

  function showDetectedManifests(choices) {
    detectedOcrChoices = Array.isArray(choices) ? choices : [];
    selectedOcrChoice = null;
    detectedManifestButtons.innerHTML = "";
    detectedManifestPicker.classList.toggle("hidden", detectedOcrChoices.length < 2);
    detectedOcrChoices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "detected-manifest-btn";
      button.textContent = choice.exactPins
        ? `${choice.label} · ${choice.raceCheckpointCount} checkpoints`
        : choice.label;
      button.addEventListener("click", () => selectDetectedManifest(index));
      detectedManifestButtons.appendChild(button);
    });
    if (detectedOcrChoices.length) selectDetectedManifest(0);
  }

  function clearDetectedManifests() {
    detectedOcrChoices = [];
    selectedOcrChoice = null;
    detectedManifestButtons.innerHTML = "";
    detectedManifestPicker.classList.add("hidden");
  }

  function ocrProgressLabel(message) {
    const status = String(message.status || "Reading manifest").replace(/_/g, " ");
    return status.charAt(0).toUpperCase() + status.slice(1) +
      (Number.isFinite(message.progress) ? ` · ${Math.round(message.progress * 100)}%` : "");
  }

  openImportBtn.addEventListener("click", openImporter);
  manifestText.addEventListener("input", () => {
    if (!settingOcrText) selectedOcrChoice = null;
    updateImportCount();
  });
  let ocrCrop = null;
  let cropStart = null;
  const cropOutline = $("#cropOutline");
  function photoPoint(event) {
    const r = manifestPreview.getBoundingClientRect();
    return { x: Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)), y: Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)) };
  }
  manifestPreview.style.touchAction = "none";
  manifestPreview.addEventListener("pointerdown", event => {
    if (state.importBusy) return;
    event.preventDefault(); cropStart = photoPoint(event); manifestPreview.setPointerCapture(event.pointerId);
  });
  manifestPreview.addEventListener("pointermove", event => {
    if (!cropStart) return;
    const end = photoPoint(event);
    ocrCrop = {x:Math.min(cropStart.x,end.x),y:Math.min(cropStart.y,end.y),w:Math.abs(end.x-cropStart.x),h:Math.abs(end.y-cropStart.y)};
    cropOutline.hidden = false;
    Object.assign(cropOutline.style,{left:`${ocrCrop.x*100}%`,top:`${ocrCrop.y*100}%`,width:`${ocrCrop.w*100}%`,height:`${ocrCrop.h*100}%`});
  });
  function finishCrop() { cropStart = null; if (ocrCrop && (ocrCrop.w < .03 || ocrCrop.h < .03)) { ocrCrop = null; cropOutline.hidden = true; } }
  manifestPreview.addEventListener("pointerup", finishCrop);
  manifestPreview.addEventListener("pointercancel", finishCrop);
  $("#ocrRotation").addEventListener("input", () => { $("#ocrRotationValue").textContent = `${$("#ocrRotation").value}°`; });
  $("#resetCropBtn").addEventListener("click", () => { ocrCrop = null; cropOutline.hidden = true; $("#ocrRotation").value = "0"; $("#ocrRotationValue").textContent = "0°"; });
  $("#retryOcrBtn").addEventListener("click", () => { if (!state.importBusy) runPhotoOcr(false); });
  manifestImageInput.addEventListener("change", () => runPhotoOcr(true));
  async function runPhotoOcr(isNew) {
    const file = manifestImageInput.files && manifestImageInput.files[0];
    if (!file) return;
    if (isNew) { ocrCrop = null; cropOutline.hidden = true; $("#ocrRotation").value = "0"; $("#ocrRotationValue").textContent = "0°"; }
    $("#ocrRetryControls").classList.remove("hidden");
    const previousUrl = manifestPreview.dataset.objectUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const objectUrl = URL.createObjectURL(file);
    manifestPreview.src = objectUrl;
    manifestPreview.dataset.objectUrl = objectUrl;
    manifestPreview.classList.remove("hidden");
    state.importBusy = true;
    $("#retryOcrBtn").disabled = true;
    ocrProgress.classList.remove("hidden");
    ocrProgress.value = 0;
    ocrStatus.classList.remove("err");
    ocrStatus.textContent = "Preparing on-device OCR…";
    updateImportCount();
    try {
      const result = await recognizeManifestImage(file, (message) => {
        ocrStatus.textContent = ocrProgressLabel(message);
        if (Number.isFinite(message.progress)) ocrProgress.value = message.progress;
      }, {crop:ocrCrop, rotation:Number($("#ocrRotation").value)});
      showDetectedManifests(result.choices || [{ label: "Scanned manifest", text: result.text || String(result) }]);
      ocrStatus.textContent = result.choices && result.choices[0] && result.choices[0].loop
        ? "Same start and finish detected: route will loop back. Review every address and number before importing."
        : result.choices && result.choices.length > 1
        ? "Both manifest pages found. Choose the one you were issued, then review it."
        : "Text extracted. Correct any mistakes before adding checkpoints.";
    } catch (err) {
      ocrStatus.textContent = err.message || "Could not read this image.";
      ocrStatus.classList.add("err");
    } finally {
      state.importBusy = false;
      $("#retryOcrBtn").disabled = false;
      ocrProgress.classList.add("hidden");
      updateImportCount();
    }
  }

  importManifestBtn.addEventListener("click", async () => {
    const room = MAX_MANIFEST_CHECKPOINTS - state.checkpoints.length;
    const lines = manifestLines(manifestText.value).slice(0, room);
    if (lines.length === 0) return;

    const exactSelection = selectedOcrChoice && selectedOcrChoice.exactPins &&
      manifestText.value.trim() === selectedOcrChoice.text.trim();
    if (exactSelection) {
      const loaded = await loadRaceRoute({
        name: selectedOcrChoice.label,
        orderMode: selectedOcrChoice.orderMode,
        loop: selectedOcrChoice.loop,
        lockOrder: false,
        checkpoints: selectedOcrChoice.checkpoints.map((checkpoint) => ({
          ...checkpoint,
          address: checkpoint.name,
          raceId: `ocr-${selectedOcrChoice.label.toLowerCase().replace(/\s+/g, "-")}`,
        })),
      });
      if (!loaded) return;
      importDialog.close();
      manifestText.value = "";
      manifestImageInput.value = "";
      clearDetectedManifests();
      return;
    }

    if (selectedOcrChoice && selectedOcrChoice.text.trim() === manifestText.value.trim()) {
      if (selectedOcrChoice.loop) {
        state.loop = true;
        loopModeSeg.querySelectorAll(".seg-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.value === "loop"));
      }
      if (selectedOcrChoice.orderMode === "optimize") {
        state.orderMode = "optimize";
        orderModeSeg.querySelectorAll(".seg-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.value === "optimize"));
      }
    }
    importDialog.close();
    manifestText.value = "";
    manifestImageInput.value = "";
    clearDetectedManifests();
    const checkpoints = lines.map((address) => ({ id: uid(), address, query: address, lat: null, lon: null, status: "pending" }));
    state.checkpoints.push(...checkpoints);
    invalidateRoute();
    renderCheckpointList();
    saveState();
    clearLog();
    log(`Locating ${checkpoints.length} imported checkpoints…`);
    for (let i = 0; i < checkpoints.length; i++) {
      await geocodeCheckpoint(checkpoints[i]);
      log(`Checkpoint ${i + 1}/${checkpoints.length}: ${checkpoints[i].status === "ok" ? "located" : "needs correction"}`,
        checkpoints[i].status === "ok" ? "ok" : "err");
    }
    if (checkpoints.some((cp) => cp.status === "error")) log("Edit any red checkpoint, then build the route.", "err");
    else log("Manifest ready. Review the pins, then build the route.", "ok");
  });

  // ---- Race settings and panel ----
  function wireSegmented(container, onChange) {
    container.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        onChange(btn.dataset.value);
      });
    });
  }
  wireSegmented(orderModeSeg, (value) => {
    state.orderMode = value;
    invalidateRoute(); renderCheckpointList(); saveState();
  });
  wireSegmented(loopModeSeg, (value) => {
    state.loop = value === "loop";
    invalidateRoute(); renderCheckpointList(); saveState();
  });

  toggleSidebarBtn.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    toggleSidebarBtn.setAttribute("aria-expanded", String(open));
    setTimeout(() => map.invalidateSize(), 220);
  });
  cueSheetBtn.addEventListener("click", () => {
    const hidden = cueSheetEl.classList.toggle("hidden");
    cueSheetBtn.textContent = hidden ? "Show cue sheet" : "Hide cue sheet";
  });
  downloadGpxBtn.addEventListener("click", downloadGpx);

  // Race control loads one of the configured physical manifests into the
  // existing route planner. It intentionally does not build the route until
  // the organizer has reviewed every resolved pin.
  async function loadRaceRoute(definition, options = {}) {
    if (!definition || !Array.isArray(definition.checkpoints) || definition.checkpoints.length < 2) {
      throw new Error("This race manifest needs at least a start and one checkpoint.");
    }
    if (definition.checkpoints.length > MAX_MANIFEST_CHECKPOINTS) {
      throw new Error(`This race manifest exceeds the ${MAX_MANIFEST_CHECKPOINTS}-checkpoint route limit.`);
    }
    if (state.checkpoints.length && options.confirmReplace !== false) {
      const replace = window.confirm(`Replace the current route planner with ${definition.name || "this race manifest"}?`);
      if (!replace) return false;
    }

    state.checkpoints = definition.checkpoints.map((source) => {
      const lat = Number(source.lat);
      const lon = Number(source.lon);
      const located = Number.isFinite(lat) && Number.isFinite(lon);
      return {
        id: uid(),
        address: String(source.address || source.query || "Checkpoint"),
        query: String(source.query || source.address || ""),
        lat: located ? lat : null,
        lon: located ? lon : null,
        status: located ? "ok" : "pending",
        raceId: source.raceId || null,
        manifestNumber: source.manifestNumber || null,
        locked: Boolean(source.locked),
        raceOrderLocked: Boolean(definition.lockOrder),
        type: source.type || "",
        instructions: source.instructions || "",
        coordinateSource: source.coordinateSource || "",
      };
    });
    state.orderMode = definition.orderMode === "optimize" ? "optimize" : "fixed";
    state.loop = definition.loop !== false;
    state.editingId = null;
    invalidateRoute();
    clearLog();
    orderModeSeg.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.value === state.orderMode));
    loopModeSeg.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.value === (state.loop ? "loop" : "point")));
    renderCheckpointList();
    saveState();

    const pending = state.checkpoints.filter((cp) => cp.status === "pending");
    if (pending.length) {
      if (navigator.onLine === false) {
        log(`${definition.name || "Manifest"} loaded, but ${pending.length} pins still need an internet connection.`, "err");
        return true;
      }
      log(`Loaded ${definition.name || "race manifest"}. Locating ${pending.length} unpinned checkpoints…`);
      for (let index = 0; index < pending.length; index++) {
        await geocodeCheckpoint(pending[index]);
        log(`${index + 1}/${pending.length} · ${pending[index].address}: ${pending[index].status === "ok" ? "located" : "needs correction"}`,
          pending[index].status === "ok" ? "ok" : "err");
      }
    }

    const located = state.checkpoints.filter((cp) => cp.status === "ok");
    if (located.length) {
      const bounds = L.latLngBounds(located.map((cp) => [cp.lat, cp.lon]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
    const errors = state.checkpoints.filter((cp) => cp.status === "error");
    if (errors.length) log(`${errors.length} checkpoint pin${errors.length === 1 ? "" : "s"} need correction before routing.`, "err");
    else log(`${definition.name || "Manifest"} is ready to review and route.`, "ok");
    return true;
  }

  // ---- Build route ----
  buildBtn.addEventListener("click", buildRoute);

  async function buildRoute() {
    if (state.building) return;
    if (navigator.onLine === false) {
      clearLog();
      log("You are offline. Your last saved route is still available, but a new route needs a connection.", "err");
      return;
    }
    state.building = true;
    updateBuildButtonState();
    clearLog();
    resultsPanel.classList.add("hidden");
    if (state.routeLine) { map.removeLayer(state.routeLine); state.routeLine = null; }

    try {
      const n = state.checkpoints.length;
      log(`Routing ${n} checkpoints. One-way direction will be ignored.`);
      const bbox = boundingBox(state.checkpoints.map((cp) => ({ lat: cp.lat, lon: cp.lon })));
      log(`Search area: ~${Math.round(bboxAreaKm2(bbox))} km²`);
      log("Fetching the rideable road network from OpenStreetMap…");
      const roadData = await fetchRoadGraphRaw(bbox);
      const ways = roadData.ways;
      if (ways.length === 0) throw new Error("No rideable roads found. Check that the checkpoint pins are correct.");
      log(`Loaded ${ways.length} rideable ways; blocked ${roadData.filteredCount} unsafe or restricted ways.`, "ok");

      const graph = buildGraph(ways);
      log(`Graph built: ${graph.nodes.size} nodes.`);
      const routingComponent = largestConnectedComponent(graph);
      if (routingComponent.size < graph.nodes.size) {
        log(`Using the connected city network (${routingComponent.size} nodes); ignoring isolated park and service-way fragments.`);
      }
      const nodeRefs = state.checkpoints.map((cp, i) => {
        const nr = nearestNode(graph, cp.lat, cp.lon, routingComponent);
        if (!nr) throw new Error(`Checkpoint ${i + 1} has no nearby road data.`);
        if (nr.dist > 400) log(`Checkpoint ${i + 1} is ${Math.round(nr.dist)} m from the nearest rideable way. Verify its pin.`, "err");
        return nr;
      });

      log("Computing shortest paths between checkpoints…");
      const distMatrix = [];
      const prevMaps = [];
      for (let i = 0; i < n; i++) {
        const targets = new Set(nodeRefs.map((nr, j) => (j === i ? null : nr.id)).filter((x) => x !== null));
        const { dist, prev } = dijkstra(graph, nodeRefs[i].id, targets);
        prevMaps[i] = prev;
        distMatrix[i] = nodeRefs.map((nr) => dist.has(nr.id) ? dist.get(nr.id) : Infinity);
      }

      const unreachable = findUnreachablePairs(distMatrix);
      if (unreachable.length > 0) {
        const pairs = unreachable.slice(0, 4).map(([i, j]) => `${i + 1}→${j + 1}`).join(", ");
        throw new Error(`No rideable connection found for ${pairs}${unreachable.length > 4 ? ", …" : ""}. Check pins or split the race into legs.`);
      }

      log(`Solving ${state.orderMode === "fixed" ? "manifest" : "fastest"} order${state.loop ? " as a loop" : ""}…`);
      const solved = solveOrder(distMatrix, { mode: state.orderMode, loop: state.loop });
      state.lastSolvedOrder = solved.order;
      const { path: fullPath, stops } = buildFullPath(solved.order, nodeRefs, prevMaps, state.loop);
      const checkpointStops = stops.map((stop, position) => ({
        pathIndex: stop.pathIndex,
        label: state.checkpoints[stop.checkpointIndex].address,
        number: position,
      }));
      const cues = buildCueSheet(graph, fullPath, checkpointStops);
      const coords = fullPath.map((id) => {
        const coord = graph.nodes.get(id);
        return [coord.lat, coord.lon];
      });
      const waypoints = solved.order.map((index, position) => ({
        name: `${position + 1}. ${state.checkpoints[index].address}`,
        lat: state.checkpoints[index].lat,
        lon: state.checkpoints[index].lon,
      }));
      if (state.loop) waypoints.push({ ...waypoints[0], name: `Finish — ${waypoints[0].name.replace(/^1\.\s*/, "")}` });

      state.lastRoute = {
        coords, cues, hazards: pathHazards(graph, fullPath),
        totalDistance: solved.totalDistance, checkpointCount: n,
        mode: state.orderMode, loop: state.loop, order: solved.order,
        waypoints, savedAt: new Date().toISOString(),
      };
      drawSavedRoute(true);
      renderCheckpointMarkers();
      saveState();
      log("Route built and saved on this device.", "ok");
    } catch (err) {
      console.error(err);
      log(`Error: ${err.message || err}`, "err");
    } finally {
      state.building = false;
      updateBuildButtonState();
    }
  }

  function buildFullPath(order, nodeRefs, prevMaps, loop) {
    const sequence = order.slice();
    if (loop) sequence.push(sequence[0]);
    const path = [];
    const stops = [];
    for (let position = 0; position < sequence.length; position++) {
      const checkpointIndex = sequence[position];
      if (position === 0) {
        path.push(nodeRefs[checkpointIndex].id);
        stops.push({ checkpointIndex, pathIndex: 0 });
        continue;
      }
      const previousIndex = sequence[position - 1];
      const segment = reconstructPath(prevMaps[previousIndex], nodeRefs[previousIndex].id, nodeRefs[checkpointIndex].id);
      if (!segment) throw new Error(`No route found between checkpoint ${previousIndex + 1} and ${checkpointIndex + 1}.`);
      for (let i = 1; i < segment.length; i++) path.push(segment[i]);
      stops.push({ checkpointIndex, pathIndex: path.length - 1 });
    }
    return { path, stops };
  }

  function drawSavedRoute(fit) {
    const route = state.lastRoute;
    if (!route || !Array.isArray(route.coords) || route.coords.length < 2) return;
    if (state.routeLine) map.removeLayer(state.routeLine);
    const routeCasing = L.polyline(route.coords, {
      color: "#0b2a4a", weight: 10, opacity: 0.88,
      lineCap: "round", lineJoin: "round", interactive: false,
    });
    const routePath = L.polyline(route.coords, {
      color: "#087cfa", weight: 6, opacity: 1,
      lineCap: "round", lineJoin: "round", interactive: false,
    });
    state.routeLine = L.featureGroup([routeCasing, routePath]).addTo(map);
    if (fit) map.fitBounds(state.routeLine.getBounds(), { padding: [45, 45] });

    resultStats.innerHTML = `Total distance: <b>${metersToText(route.totalDistance)}</b><br>` +
      `Checkpoints: <b>${route.checkpointCount}</b> · Mode: <b>${route.mode === "fixed" ? "manifest order" : "optimized distance"}</b>` +
      (route.loop ? " · <b>loop</b>" : "") + `<br><span class="saved-status">Saved for offline recovery</span>`;
    const batchPanel = $("#googleMapsBatches");
    batchPanel.replaceChildren();
    const batches = googleMapsBatches(route.waypoints);
    batches.forEach((batch, index) => {
      const link = document.createElement("a");
      link.className = "btn primary maps-batch";
      link.href = batch.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `Open batch ${index + 1} of ${batches.length} in Google Maps`;
      batchPanel.appendChild(link);
      const summary = document.createElement("p");
      summary.className = "hint";
      summary.textContent = batch.stops.map(p => p.name).join(" → ");
      batchPanel.appendChild(summary);
    });
    cueSheetEl.innerHTML = (route.cues || []).map(cueToHtml).join("");
    cueSheetEl.classList.add("hidden");
    cueSheetBtn.textContent = "Show cue sheet";
    const hazards = route.hazards || [];
    routeWarnings.classList.toggle("hidden", hazards.length === 0);
    routeWarnings.innerHTML = hazards.length
      ? `<b>Review these route segments:</b><br>${hazards.map((item) => `${escapeHtml(item.label)} · ${metersToText(item.meters)}`).join("<br>")}`
      : "";
    resultsPanel.classList.remove("hidden");
  }

  function cueToHtml(cue) {
    if (cue.type === "go") return `<div>${escapeHtml(cue.text)} <span class="dist">(${metersToText(cue.distance)})</span></div>`;
    if (cue.type === "turn") return `<div class="turn">↳ ${escapeHtml(cue.text)}</div>`;
    return `<div class="cp">${escapeHtml(cue.text)}</div>`;
  }

  function xmlEscape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
    }[char]));
  }

  function downloadGpx() {
    const route = state.lastRoute;
    if (!route) return;
    const waypoints = (route.waypoints || []).map((point) =>
      `  <wpt lat="${point.lat}" lon="${point.lon}"><name>${xmlEscape(point.name)}</name></wpt>`
    ).join("\n");
    const track = route.coords.map(([lat, lon]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gpx version="1.1" creator="ZigZag Alleycat Router" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `  <metadata><name>ZigZag race route</name><time>${xmlEscape(route.savedAt)}</time></metadata>\n` +
      `${waypoints}\n  <trk><name>ZigZag race route</name><trkseg>\n${track}\n  </trkseg></trk>\n</gpx>\n`;
    const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `zigzag-route-${new Date().toISOString().slice(0, 10)}.gpx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  orderModeSeg.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.value === state.orderMode));
  loopModeSeg.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.value === (state.loop ? "loop" : "point")));
  renderCheckpointList();
  if (state.lastRoute) drawSavedRoute(true);
  const interruptedImports = state.checkpoints.filter((cp) => cp.status === "pending");
  if (interruptedImports.length && navigator.onLine !== false) {
    (async () => {
      for (const cp of interruptedImports) await geocodeCheckpoint(cp);
    })();
  }

  if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  window.ZigZagApp = {
    loadRaceRoute,
    hasManifest: () => state.checkpoints.length > 0,
    getRaceState: () => ({
      checkpointCount: state.checkpoints.length,
      orderMode: state.orderMode,
      loop: state.loop,
      building: state.building,
    }),
  };
  window.dispatchEvent(new CustomEvent("zigzag:app-ready"));
})();
