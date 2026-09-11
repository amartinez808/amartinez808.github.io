// race-control.js — local organizer controls for the two-manifest race.

(function () {
  "use strict";

  const CONFIG_STORAGE_KEY = "zigzag-providence-race-config-v1";
  const QUALIFICATION_STORAGE_KEY = "zigzag-providence-qualifiers-v1";
  const RaceConfig = window.ZigZagRaceConfig;
  const $ = (selector) => document.querySelector(selector);

  let config = loadConfig();
  let qualifications = loadQualifications();
  let setupDraft = null;

  const raceNameEl = $("#raceName");
  const raceDraftBadge = $("#raceDraftBadge");
  const raceSummary = $("#raceSummary");
  const raceReadiness = $("#raceReadiness");
  const raceFlowDetails = $("#raceFlowDetails");
  const loadManifest1Btn = $("#loadManifest1Btn");
  const loadManifest2Btn = $("#loadManifest2Btn");
  const raceSetupDialog = $("#raceSetupDialog");
  const setupMessage = $("#setupMessage");

  function loadConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "null");
      return RaceConfig.normalizeConfig(stored || RaceConfig.cloneDefault());
    } catch (_) {
      return RaceConfig.cloneDefault();
    }
  }

  function saveConfig() {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  function loadQualifications() {
    try {
      const stored = JSON.parse(localStorage.getItem(QUALIFICATION_STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((entry) => entry && entry.name && entry.qualifiedAt) : [];
    } catch (_) {
      return [];
    }
  }

  function saveQualifications() {
    localStorage.setItem(QUALIFICATION_STORAGE_KEY, JSON.stringify(qualifications));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function raceTypeBadge(type) {
    return element("span", `race-type ${String(type).toLowerCase()}`, type);
  }

  function renderRaceOverview() {
    const staffed = config.manifest1.filter((cp) => cp.type === "STAFFED").length;
    const activeWorkers = config.workers.filter((worker) => worker.active).length;
    raceNameEl.textContent = config.raceName;
    raceDraftBadge.textContent = config.status || "Working draft";
    raceSummary.textContent = `${config.startFinish.name} · M1: ${config.manifest1.length} checkpoints, ${staffed} staffed · M2: ${config.manifest2.length} selfie checkpoints · ${activeWorkers} confirmed workers`;

    const issues = RaceConfig.getRaceIssues(config);
    raceReadiness.innerHTML = "";
    if (issues.length === 0) {
      raceReadiness.appendChild(element("div", "readiness-ok", `Race controls match: ${staffed} staffed checkpoints and ${config.requiredPokemonCards} required physical cards.`));
    } else {
      issues.forEach((issue) => raceReadiness.appendChild(element("div", `readiness-${issue.level}`, issue.message)));
    }

    renderRaceFlow();
    renderQualifications();
  }

  function renderRaceFlow() {
    raceFlowDetails.innerHTML = "";
    const flow = element("p", "flow-copy", `Start at ${config.startFinish.name} → complete Manifest 1 in fixed order → return for physical verification → first ${config.qualifierLimit} unlock Manifest 2 → complete every M2 selfie checkpoint in any order → return to Dexter. First verified finisher wins.`);
    raceFlowDetails.appendChild(flow);

    const m1Title = element("h3", "flow-title", "Manifest 1 · fixed order");
    const cardRule = element("p", "flow-copy", `One physical Pokémon card plus a paper-manifest signature at every staffed checkpoint. Required at Dexter: ${config.requiredPokemonCards} cards.`);
    const m1List = element("ol", "race-preview-list");
    config.manifest1.forEach((cp) => {
      const item = element("li");
      const top = element("div", "preview-checkpoint");
      top.append(element("span", "preview-name", cp.name), raceTypeBadge(cp.type));
      item.appendChild(top);
      if (cp.requirement) item.appendChild(element("div", "preview-requirement", cp.requirement));
      if (cp.note) item.appendChild(element("div", "preview-note", cp.note));
      m1List.appendChild(item);
    });

    const m2Title = element("h3", "flow-title", "Manifest 2 · any order · all mandatory");
    const m2List = element("ul", "race-preview-list compact");
    config.manifest2.forEach((cp) => {
      const item = element("li");
      item.append(element("span", "preview-name", cp.name), raceTypeBadge("SELFIE"));
      m2List.appendChild(item);
    });
    raceFlowDetails.append(m1Title, cardRule, m1List, m2Title, m2List);
  }

  async function loadManifest(number) {
    if (!window.ZigZagApp) return;
    const button = number === 2 ? loadManifest2Btn : loadManifest1Btn;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Loading pins…";
    try {
      const definition = RaceConfig.buildRouteDefinition(config, number);
      await window.ZigZagApp.loadRaceRoute(definition);
    } catch (error) {
      window.alert(error.message || "Could not load this manifest.");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  loadManifest1Btn.addEventListener("click", () => loadManifest(1));
  loadManifest2Btn.addEventListener("click", () => loadManifest(2));

  // ---- Qualification desk ----
  function formatTime(iso) {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
    } catch (_) {
      return iso;
    }
  }

  function setQualificationMessage(message, isError) {
    const target = $("#qualificationMessage");
    target.textContent = message || "";
    target.classList.toggle("err", Boolean(isError));
  }

  function renderQualifications() {
    const list = $("#qualificationList");
    const count = $("#qualificationCount");
    const cardsInput = $("#qualifierCards");
    const recordButton = $("#recordQualifierBtn");
    count.textContent = `${qualifications.length} / ${config.qualifierLimit}`;
    cardsInput.placeholder = `Required: ${config.requiredPokemonCards}`;
    if (cardsInput.value === "") cardsInput.value = String(config.requiredPokemonCards);
    recordButton.disabled = qualifications.length >= config.qualifierLimit;
    recordButton.textContent = qualifications.length >= config.qualifierLimit ? "Manifest 2 field is full" : "Record qualifier";
    list.innerHTML = "";

    qualifications.forEach((entry, index) => {
      const item = element("li", entry.finishedAt ? "qualification-item finished" : "qualification-item");
      const position = element("span", "qualification-position", String(index + 1));
      const info = element("div", "qualification-info");
      info.appendChild(element("strong", "", entry.name));
      info.appendChild(element("span", "", `Qualified ${formatTime(entry.qualifiedAt)} · ${entry.cards} physical cards`));
      if (entry.finishedAt) info.appendChild(element("span", entry.winner ? "winner-label" : "", `${entry.winner ? "WINNER · " : "M2 finished · "}${formatTime(entry.finishedAt)}`));

      const actions = element("div", "qualification-actions");
      if (!entry.finishedAt) {
        const finish = element("button", "item-action", "Finish M2");
        finish.type = "button";
        finish.title = "Record after all nine selfies and the Dexter return are physically verified";
        finish.addEventListener("click", () => recordManifest2Finish(entry.id));
        actions.appendChild(finish);
      }
      const remove = element("button", "item-action rm", "✕");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${entry.name} from qualification order`);
      remove.addEventListener("click", () => removeQualifier(entry.id));
      actions.appendChild(remove);
      item.append(position, info, actions);
      list.appendChild(item);
    });
  }

  $("#recordQualifierBtn").addEventListener("click", () => {
    const name = $("#qualifierName").value.trim();
    const cards = Number($("#qualifierCards").value);
    const manifestComplete = $("#qualifierManifestCheck").checked;
    const signaturesComplete = $("#qualifierSignaturesCheck").checked;
    if (qualifications.length >= config.qualifierLimit) {
      setQualificationMessage(`The first ${config.qualifierLimit} qualification places are already filled.`, true);
      return;
    }
    if (!name) {
      setQualificationMessage("Enter the rider name or number.", true);
      return;
    }
    if (qualifications.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
      setQualificationMessage("That rider is already in the qualification order.", true);
      return;
    }
    if (!manifestComplete || !signaturesComplete) {
      setQualificationMessage("Physically verify the completed Manifest 1 and every staffed signature first.", true);
      return;
    }
    if (!Number.isInteger(cards) || cards !== config.requiredPokemonCards) {
      setQualificationMessage(`Count the physical cards again. This race setup currently requires exactly ${config.requiredPokemonCards}.`, true);
      return;
    }

    qualifications.push({
      id: `qualifier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      cards,
      qualifiedAt: new Date().toISOString(),
      finishedAt: null,
      winner: false,
    });
    saveQualifications();
    $("#qualifierName").value = "";
    $("#qualifierManifestCheck").checked = false;
    $("#qualifierSignaturesCheck").checked = false;
    setQualificationMessage(`${name} qualified in position ${qualifications.length}. Hand over physical Manifest 2.`, false);
    renderQualifications();
  });

  function recordManifest2Finish(id) {
    const rider = qualifications.find((entry) => entry.id === id);
    if (!rider) return;
    if (!window.confirm(`Has race control physically verified all 9 Manifest 2 selfies and ${rider.name}'s return to Dexter?`)) return;
    rider.finishedAt = new Date().toISOString();
    rider.winner = !qualifications.some((entry) => entry.finishedAt && entry.id !== id);
    saveQualifications();
    setQualificationMessage(rider.winner ? `${rider.name} is the first verified Manifest 2 finisher.` : `${rider.name}'s Manifest 2 finish is recorded.`, false);
    renderQualifications();
  }

  function removeQualifier(id) {
    const rider = qualifications.find((entry) => entry.id === id);
    if (!rider || !window.confirm(`Remove ${rider.name} from the qualification order?`)) return;
    qualifications = qualifications.filter((entry) => entry.id !== id);
    const finishers = qualifications.filter((entry) => entry.finishedAt).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
    qualifications.forEach((entry) => { entry.winner = finishers[0] ? entry.id === finishers[0].id : false; });
    saveQualifications();
    setQualificationMessage(`${rider.name} was removed. Qualification positions were renumbered.`, false);
    renderQualifications();
  }

  // ---- Race setup editor ----
  function openRaceSetup() {
    setupDraft = RaceConfig.clone(config);
    setupMessage.textContent = "";
    renderSetupEditor();
    if (typeof raceSetupDialog.showModal === "function") raceSetupDialog.showModal();
    else raceSetupDialog.setAttribute("open", "");
  }

  $("#openRaceSetupBtn").addEventListener("click", openRaceSetup);

  function labeledInput(labelText, value, onInput, options = {}) {
    const label = element("label", "setup-field", labelText);
    const input = options.multiline ? element("textarea", "race-input") : element("input", "race-input");
    if (!options.multiline) input.type = options.type || "text";
    input.value = value || "";
    if (options.placeholder) input.placeholder = options.placeholder;
    input.addEventListener("input", () => onInput(input.value));
    label.appendChild(input);
    return label;
  }

  function actionButton(text, label, onClick, disabled) {
    const button = element("button", "item-action", text);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.disabled = Boolean(disabled);
    button.addEventListener("click", onClick);
    return button;
  }

  function renderSetupEditor() {
    $("#setupRaceName").value = setupDraft.raceName;
    $("#setupStartFinish").value = setupDraft.startFinish.name;
    $("#setupQualifierLimit").value = String(setupDraft.qualifierLimit);
    $("#setupRequiredCards").value = String(setupDraft.requiredPokemonCards);
    renderSetupWorkers();
    renderSetupManifest(1);
    renderSetupManifest(2);
  }

  function renderSetupWorkers() {
    const container = $("#setupWorkers");
    container.innerHTML = "";
    setupDraft.workers.forEach((worker, index) => {
      const row = element("div", "setup-item worker-item");
      const title = element("div", "setup-item-title", `Worker ${index + 1}`);
      const remove = actionButton("✕", `Remove ${worker.name}`, () => {
        setupDraft.workers.splice(index, 1);
        renderSetupWorkers();
      });
      title.appendChild(remove);
      const grid = element("div", "setup-item-grid");
      grid.appendChild(labeledInput("Name", worker.name, (value) => { worker.name = value; }));

      const assignmentLabel = element("label", "setup-field", "Assigned checkpoint");
      const select = element("select", "race-input");
      const unassigned = element("option", "", "TBD / unassigned");
      unassigned.value = "";
      select.appendChild(unassigned);
      setupDraft.manifest1.forEach((cp) => {
        const option = element("option", "", `${cp.name} · ${cp.type}`);
        option.value = cp.id;
        select.appendChild(option);
      });
      select.value = worker.checkpointId || "";
      select.addEventListener("change", () => { worker.checkpointId = select.value || null; });
      assignmentLabel.appendChild(select);

      const active = element("label", "verify-row", " Confirmed / active on race day");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = worker.active !== false;
      checkbox.addEventListener("change", () => { worker.active = checkbox.checked; });
      active.prepend(checkbox);
      grid.append(assignmentLabel, active);
      if (worker.note) grid.appendChild(labeledInput("Note", worker.note, (value) => { worker.note = value; }));
      row.append(title, grid);
      container.appendChild(row);
    });
  }

  function renderSetupManifest(number) {
    const list = number === 2 ? setupDraft.manifest2 : setupDraft.manifest1;
    const container = number === 2 ? $("#setupManifest2") : $("#setupManifest1");
    container.innerHTML = "";
    list.forEach((checkpoint, index) => {
      const row = element("div", "setup-item checkpoint-setup-item");
      const title = element("div", "setup-item-title");
      title.appendChild(element("strong", "", `${index + 1}. ${checkpoint.name}`));
      const actions = element("div", "setup-order-actions");
      actions.append(
        actionButton("↑", `Move ${checkpoint.name} up`, () => moveSetupCheckpoint(number, index, -1), index === 0),
        actionButton("↓", `Move ${checkpoint.name} down`, () => moveSetupCheckpoint(number, index, 1), index === list.length - 1),
        actionButton("✕", `Remove ${checkpoint.name}`, () => {
          list.splice(index, 1);
          setupDraft.workers.forEach((worker) => { if (worker.checkpointId === checkpoint.id) worker.checkpointId = null; });
          renderSetupManifest(number);
          renderSetupWorkers();
        })
      );
      title.appendChild(actions);

      const grid = element("div", "setup-item-grid");
      grid.appendChild(labeledInput("Printed name", checkpoint.name, (value) => { checkpoint.name = value; title.querySelector("strong").textContent = `${index + 1}. ${value}`; }));
      grid.appendChild(labeledInput("Map search", checkpoint.query, (value) => {
        if (checkpoint.query !== value) {
          checkpoint.query = value;
          delete checkpoint.lat;
          delete checkpoint.lon;
          delete checkpoint.coordinateSource;
        }
      }));

      if (number === 1) {
        const typeLabel = element("label", "setup-field", "Checkpoint type");
        const select = element("select", "race-input");
        ["SELFIE", "STAFFED"].forEach((type) => {
          const option = element("option", "", type);
          option.value = type;
          select.appendChild(option);
        });
        select.value = checkpoint.type;
        select.addEventListener("change", () => { checkpoint.type = select.value; });
        typeLabel.appendChild(select);
        grid.appendChild(typeLabel);
        grid.appendChild(labeledInput("Rider requirement", checkpoint.requirement || "", (value) => { checkpoint.requirement = value; }, { multiline: true, placeholder: "What must be visible or completed?" }));
        grid.appendChild(labeledInput("Organizer note", checkpoint.note || "", (value) => { checkpoint.note = value; }, { multiline: true, placeholder: "Race-control or worker note" }));
      } else {
        grid.appendChild(element("div", "locked-type", "SELFIE · mandatory · rider chooses order"));
      }
      if (checkpoint.coordinateSource) grid.appendChild(element("div", "coordinate-source", `Pinned location: ${checkpoint.coordinateSource}`));
      row.append(title, grid);
      container.appendChild(row);
    });
  }

  function moveSetupCheckpoint(number, index, delta) {
    const list = number === 2 ? setupDraft.manifest2 : setupDraft.manifest1;
    const destination = index + delta;
    if (destination < 0 || destination >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(destination, 0, moved);
    renderSetupManifest(number);
  }

  $("#addWorkerBtn").addEventListener("click", () => {
    setupDraft.workers.push({ id: `worker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "New checkpoint worker", checkpointId: null, active: true });
    renderSetupWorkers();
  });

  function addSetupCheckpoint(number) {
    const list = number === 2 ? setupDraft.manifest2 : setupDraft.manifest1;
    list.push({
      id: `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: "New checkpoint",
      query: "New checkpoint, Providence, RI",
      type: "SELFIE",
      requirement: "",
    });
    renderSetupManifest(number);
    if (number === 1) renderSetupWorkers();
  }
  $("#addManifest1CheckpointBtn").addEventListener("click", () => addSetupCheckpoint(1));
  $("#addManifest2CheckpointBtn").addEventListener("click", () => addSetupCheckpoint(2));

  $("#saveRaceSetupBtn").addEventListener("click", () => {
    setupDraft.raceName = $("#setupRaceName").value.trim();
    const startName = $("#setupStartFinish").value.trim();
    if (startName !== setupDraft.startFinish.name) {
      setupDraft.startFinish.name = startName;
      setupDraft.startFinish.query = `${startName}, Providence, RI`;
      delete setupDraft.startFinish.lat;
      delete setupDraft.startFinish.lon;
      delete setupDraft.startFinish.coordinateSource;
    }
    setupDraft.qualifierLimit = Number($("#setupQualifierLimit").value);
    setupDraft.requiredPokemonCards = Number($("#setupRequiredCards").value);
    const next = RaceConfig.normalizeConfig(setupDraft);
    const errors = RaceConfig.getRaceIssues(next).filter((issue) => issue.level === "error");
    if (!next.raceName || !next.startFinish.name) errors.push({ message: "Race name and start/finish are required." });
    if (errors.length) {
      setupMessage.textContent = errors.map((issue) => issue.message).join(" ");
      setupMessage.classList.add("err");
      return;
    }
    config = next;
    saveConfig();
    raceSetupDialog.close();
    $("#qualifierCards").value = String(config.requiredPokemonCards);
    setQualificationMessage("Race setup saved on this device.", false);
    renderRaceOverview();
  });

  $("#resetRaceSetupBtn").addEventListener("click", () => {
    if (!window.confirm("Reset the editable race setup to the supplied Providence working draft? Qualification order will be preserved.")) return;
    setupDraft = RaceConfig.cloneDefault();
    setupMessage.textContent = "Providence draft restored in the editor. Save to apply it.";
    setupMessage.classList.remove("err");
    renderSetupEditor();
  });

  // ---- Physical manifest printing ----
  function htmlEscape(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }

  function printManifest(number) {
    const isM2 = number === 2;
    const checkpoints = isM2 ? config.manifest2 : config.manifest1;
    const title = `${config.raceName} · Manifest ${number}`;
    const rows = checkpoints.map((cp, index) => {
      const worker = config.workers.find((item) => item.active && item.checkpointId === cp.id);
      const proof = isM2 || cp.type === "SELFIE"
        ? `<div class="proof">SELFIE VERIFIED: □</div>`
        : `<div class="proof">WORKER: ${htmlEscape(worker ? worker.name : "UNASSIGNED")} &nbsp; SIGN/INITIAL: __________________ &nbsp; POKÉMON CARD: □</div>`;
      const instructions = cp.requirement ? `<div class="instructions">${htmlEscape(cp.requirement)}</div>` : "";
      const note = cp.note ? `<div class="note">Organizer note: ${htmlEscape(cp.note)}</div>` : "";
      const routeAddress = cp.query && cp.query !== cp.name
        ? `<div class="route-address">ROUTE / SCAN: ${htmlEscape(cp.query)}</div>`
        : "";
      return `<li><div class="checkpoint"><strong>${htmlEscape(cp.name)}</strong><span>${isM2 ? "SELFIE" : htmlEscape(cp.type)}</span></div>${routeAddress}${instructions}${note}${proof}</li>`;
    }).join("");
    const rules = isM2
      ? `<p><strong>QUALIFIERS ONLY.</strong> Complete all ${checkpoints.length} selfie checkpoints in ANY order, then return to ${htmlEscape(config.startFinish.name)}. Riders choose their own route. First fully verified finisher wins.</p>`
      : `<p>Complete every checkpoint in the EXACT PRINTED ORDER, then return to ${htmlEscape(config.startFinish.name)}. At each staffed checkpoint, the worker verifies the rider, signs/initials this physical manifest, and gives exactly ONE physical Pokémon card.</p><p><strong>Required at finish: ${config.requiredPokemonCards} physical Pokémon cards and every staffed signature.</strong> First ${config.qualifierLimit} verified riders qualify for Manifest 2.</p>`;
    const popup = window.open("", "_blank");
    if (!popup) {
      window.alert("Printing was blocked. Allow pop-ups for this app, then try again.");
      return;
    }
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>${htmlEscape(title)}</title><style>
      @page{margin:.45in}body{font:12px/1.35 Arial,sans-serif;color:#111;margin:0}h1{font-size:22px;margin:0 0 3px}.meta{border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:12px}.rider{display:flex;gap:18px;margin:12px 0}.line{border-bottom:1px solid #111;min-width:190px;display:inline-block}ol{padding-left:27px;margin:0}li{break-inside:avoid;border-bottom:1px solid #aaa;padding:7px 0 8px}.checkpoint{display:flex;justify-content:space-between;gap:20px;font-size:14px}.checkpoint span{font-weight:bold}.route-address{font:10px/1.35 ui-monospace,monospace;letter-spacing:.2px;margin-top:2px}.instructions{margin-top:3px}.note{font-style:italic;color:#444;margin-top:2px}.proof{font-size:10px;margin-top:5px;letter-spacing:.2px}.footer{margin-top:12px;border:2px solid #111;padding:8px;font-weight:bold}@media print{button{display:none}}
    </style></head><body><div class="meta"><h1>${htmlEscape(title)}</h1><div>START / FINISH: ${htmlEscape(config.startFinish.name)} · ${htmlEscape(config.status)}</div></div><div class="rider">RIDER: <span class="line"></span> BIB: <span class="line"></span></div>${rules}<ol>${rows}</ol><div class="footer">RETURN VERIFIED AT DEXTER — TIME: ____________ &nbsp; RACE CONTROL: ____________________</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  $("#printManifest1Btn").addEventListener("click", () => printManifest(1));
  $("#printManifest2Btn").addEventListener("click", () => printManifest(2));

  window.ZigZagRaceAdmin = {
    getConfig: () => RaceConfig.clone(config),
    getQualifications: () => RaceConfig.clone(qualifications),
    resetForTests: () => {
      config = RaceConfig.cloneDefault();
      qualifications = [];
      saveConfig();
      saveQualifications();
      renderRaceOverview();
    },
  };

  renderRaceOverview();
})();
