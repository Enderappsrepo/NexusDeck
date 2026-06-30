const STEP_LABELS = {
  preflight: "Prepare system",
  download: "Download Flatpak",
  install: "Install Flatpak",
  nxm: "Register mod links",
  legacy: "Remove old install",
  steam: "Add to Steam",
  controller: "Controller template",
  launch: "Launch app",
  complete: "Finish",
  log: "Log",
};

const STEP_ORDER = [
  "preflight",
  "download",
  "install",
  "nxm",
  "legacy",
  "steam",
  "controller",
  "launch",
  "complete",
];

const WIZARD_STEPS = ["welcome", "options", "progress", "done"];

const PRESETS = {
  deck: {
    source: "latest",
    registerNxm: true,
    removeLegacy: true,
    addToSteam: true,
    addController: true,
    launchAfter: true,
  },
  desktop: {
    source: "latest",
    registerNxm: true,
    removeLegacy: true,
    addToSteam: false,
    addController: false,
    launchAfter: false,
  },
  update: {
    source: "latest",
    registerNxm: false,
    removeLegacy: false,
    addToSteam: false,
    addController: false,
    launchAfter: false,
  },
};

const screens = {
  welcome: document.getElementById("screen-welcome"),
  options: document.getElementById("screen-options"),
  progress: document.getElementById("screen-progress"),
  done: document.getElementById("screen-done"),
  error: document.getElementById("screen-error"),
  static: document.getElementById("screen-static"),
};

const stepList = document.getElementById("step-list");
const progressFill = document.getElementById("progress-fill");
const progressBar = document.getElementById("progress-bar");
const progressPercent = document.getElementById("progress-percent");
const stepperFill = document.getElementById("stepper-fill");
const logEl = document.getElementById("log");
const errorLog = document.getElementById("error-log");
const errorMessage = document.getElementById("error-message");
const doneMessage = document.getElementById("done-message");
const toast = document.getElementById("toast");
const summaryList = document.getElementById("summary-list");
const doneChecklist = document.getElementById("done-checklist");

let pollTimer = null;
let logVisible = false;
let currentWizardStep = "welcome";
let activePreset = "deck";
let systemInfo = {};
const stepState = new Map();

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2200);
}

function setWizardStep(name) {
  currentWizardStep = name;
  const idx = WIZARD_STEPS.indexOf(name);
  const progress = idx <= 0 ? 0 : (idx / (WIZARD_STEPS.length - 1)) * 100;
  stepperFill.style.width = `${progress}%`;

  document.querySelectorAll(".stepper-item").forEach((el) => {
    const step = el.dataset.step;
    const stepIdx = WIZARD_STEPS.indexOf(step);
    el.classList.toggle("active", step === name);
    el.classList.toggle("done", stepIdx >= 0 && stepIdx < idx && name !== "error");
  });
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.classList.toggle("hidden", key !== name);
  });
  if (name !== "error" && name !== "static") {
    setWizardStep(name);
  }
}

function isLocalInstallerHost() {
  return location.hostname === "127.0.0.1" || location.hostname === "localhost";
}

function isStaticPreviewHost() {
  return location.hostname.endsWith("github.io") || location.protocol === "file:";
}

function showStaticHostHelp() {
  const repo = systemInfo.repo || "Enderappsrepo/NexusDeck";
  const pagesBase = location.origin + location.pathname.replace(/\/gui\/?.*$/, "");
  const guiCmd = `curl -fsSL ${pagesBase}/i.sh -o install.sh && bash install.sh --gui`;
  const cliCmd = `curl -fsSL ${pagesBase}/i.sh | bash`;
  const releaseCmd = `curl -fsSL https://github.com/${repo}/releases/latest/download/i.sh | bash`;

  $("static-gui-cmd").textContent = guiCmd;
  $("static-cli-cmd").textContent = cliCmd;
  $("static-release-cmd").textContent = releaseCmd;
  showScreen("static");
}

function stepIcon(status) {
  if (status === "done") return "✓";
  if (status === "error") return "✕";
  if (status === "warn") return "!";
  if (status === "running") return "◌";
  return "•";
}

function getOptions() {
  const source = document.querySelector('input[name="source"]:checked')?.value || "latest";
  return {
    source,
    flatpakPath: source === "local" ? $("flatpak-path").value.trim() : "",
    registerNxm: $("opt-nxm").checked,
    removeLegacy: $("opt-legacy").checked,
    addToSteam: $("opt-steam").checked,
    addController: $("opt-controller").checked,
    launchAfter: $("opt-launch").checked,
  };
}

function applyOptions(opts) {
  document.querySelectorAll('input[name="source"]').forEach((radio) => {
    radio.checked = radio.value === opts.source;
    radio.closest(".source-pill")?.classList.toggle("selected", radio.checked);
  });
  syncSourceField();

  $("opt-nxm").checked = opts.registerNxm;
  $("opt-legacy").checked = opts.removeLegacy;
  $("opt-steam").checked = opts.addToSteam;
  $("opt-controller").checked = opts.addController;
  $("opt-launch").checked = opts.launchAfter;

  document.querySelectorAll(".option-card input").forEach((input) => {
    input.dispatchEvent(new Event("change"));
  });

  syncSteamOptions();
  updateSummary();
}

function setPreset(name) {
  activePreset = name;
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === name);
  });
  applyOptions(PRESETS[name]);
}

function detectPresetMismatch() {
  const current = getOptions();
  for (const [name, preset] of Object.entries(PRESETS)) {
    const match =
      current.source === preset.source &&
      current.registerNxm === preset.registerNxm &&
      current.removeLegacy === preset.removeLegacy &&
      current.addToSteam === preset.addToSteam &&
      current.addController === preset.addController &&
      current.launchAfter === preset.launchAfter &&
      (preset.source !== "local" || !current.flatpakPath);
    if (match) {
      activePreset = name;
      document.querySelectorAll(".preset-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.preset === name);
      });
      return;
    }
  }
  activePreset = "";
  document.querySelectorAll(".preset-btn").forEach((btn) => btn.classList.remove("active"));
}

function updateSummary() {
  const opts = getOptions();
  const items = [];

  if (opts.source === "local") {
    const path = opts.flatpakPath || "(path required)";
    items.push(`Install from local file: ${path}`);
  } else if (systemInfo.flatpakInstalled) {
    items.push("Reinstall latest Flatpak release");
  } else {
    items.push("Download and install latest Flatpak release");
  }

  if (opts.registerNxm) items.push("Register nxm:// mod links");
  if (opts.removeLegacy) items.push("Remove legacy AppImage if found");
  if (opts.addToSteam) items.push("Add shortcut to Steam library");
  if (opts.addController) items.push("Install Steam Input controller template");
  if (opts.launchAfter) items.push("Launch NexusDeck when finished");

  if (items.length === 1 && items[0].includes("Flatpak")) {
    items.push("No optional integration steps selected");
  }

  summaryList.innerHTML = items.map((text) => `<li>${text}</li>`).join("");
}

function buildDoneChecklist(opts) {
  const items = [];
  let n = 1;

  if (opts.addToSteam) {
    items.push({
      title: "Restart Steam",
      body: "Quit and reopen Steam to see NexusDeck in your library.",
    });
  }
  if (opts.addController) {
    items.push({
      title: "Pick controller layout",
      body: "Gaming Mode → NexusDeck → Controller → NexusDeck template.",
    });
  }
  items.push({
    title: "Complete setup",
    body: "Add your Nexus API key and run the game wizard in the app.",
  });

  doneChecklist.innerHTML = items
    .map(
      (item, i) => `
      <article class="check-item">
        <span class="check-mark">${i + 1}</span>
        <div>
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </div>
      </article>`
    )
    .join("");
}

function updateProgressUI() {
  const completed = STEP_ORDER.filter((k) => stepState.get(k)?.status === "done").length;
  const running = STEP_ORDER.find((k) => stepState.get(k)?.status === "running");
  const total = STEP_ORDER.length;
  let pct = Math.round((completed / total) * 100);
  if (running && pct < 95) pct += 4;

  progressFill.style.width = `${pct}%`;
  progressPercent.textContent = `${pct}%`;
  progressBar.setAttribute("aria-valuenow", String(pct));

  if (running) {
    $("progress-lead").textContent = STEP_LABELS[running]
      ? `Working on: ${STEP_LABELS[running]}…`
      : "Installing…";
  }
}

function renderSteps() {
  stepList.innerHTML = "";
  for (const key of STEP_ORDER) {
    const state = stepState.get(key);
    if (!state) continue;
    const li = document.createElement("li");
    li.className = `step ${state.status}`;
    li.innerHTML = `
      <div class="step-icon">${stepIcon(state.status)}</div>
      <div class="step-body">
        <strong>${STEP_LABELS[key] || key}</strong>
        <span>${state.message || ""}</span>
      </div>
    `;
    stepList.appendChild(li);
  }
  updateProgressUI();
}

function applyEvent(event) {
  const step = event.step || "log";
  const line = event.message || "";
  if (step === "log") {
    logEl.textContent += `${line}\n`;
    errorLog.textContent += `${line}\n`;
    return;
  }
  stepState.set(step, { status: event.status || "info", message: line });
  renderSteps();
}

function bindOptionCards() {
  document.querySelectorAll(".option-card").forEach((card) => {
    const input = card.querySelector('input[type="checkbox"]');
    if (!input) return;

    const sync = () => {
      card.classList.toggle("selected", input.checked);
      card.classList.toggle("disabled", input.disabled);
    };

    card.addEventListener("click", (e) => {
      if (input.disabled) return;
      if (e.target === input) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
      sync();
    });

    input.addEventListener("change", () => {
      sync();
      detectPresetMismatch();
      updateSummary();
    });
    sync();
  });
}

function syncSourceField() {
  const local = document.querySelector('input[name="source"][value="local"]')?.checked;
  $("local-flatpak-field").classList.toggle("hidden", !local);
  document.querySelectorAll(".source-pill").forEach((pill) => {
    const radio = pill.querySelector('input[type="radio"]');
    pill.classList.toggle("selected", radio?.checked);
  });
  detectPresetMismatch();
  updateSummary();
}

function syncSteamOptions() {
  const steam = $("opt-steam");
  const controller = $("opt-controller");
  const callout = $("steam-callout");
  const controllerCard = document.querySelector('[data-option="controller"]');
  const steamSection = $("steam-section");

  const steamAvailable = systemInfo.steamFound !== false;
  steamSection.classList.toggle("hidden", !steamAvailable);

  if (!steamAvailable) {
    steam.checked = false;
    controller.checked = false;
    callout.hidden = true;
    return;
  }

  controller.disabled = !steam.checked;
  if (!steam.checked) controller.checked = false;

  callout.hidden = !steam.checked;
  controllerCard?.classList.toggle("disabled", !steam.checked);
  controllerCard?.querySelector("input")?.dispatchEvent(new Event("change"));
}

async function fetchInfo() {
  if (isStaticPreviewHost()) {
    showStaticHostHelp();
    return;
  }

  try {
    const res = await fetch("/api/info");
    if (!res.ok) {
      throw new Error(`Installer backend unavailable (${res.status})`);
    }
    systemInfo = await res.json();

    $("repo-label").textContent = systemInfo.repo || "NexusDeck";
    $("launch-cmd").textContent = systemInfo.launchCommand || "flatpak run com.nexusdeck.app";

    if (systemInfo.isSteamDeck) {
      $("chip-deck").hidden = false;
      $("deck-hint").hidden = false;
      $("subtitle").textContent =
        "Steam Deck detected — built for 1280×800, controller navigation, and Gaming Mode.";
    }

    if (systemInfo.steamFound) {
      $("chip-steam").hidden = false;
    } else {
      $("chip-no-steam").hidden = false;
    }

    if (systemInfo.flatpakReady) $("chip-flatpak").hidden = false;
    if (systemInfo.flatpakInstalled) $("chip-installed").hidden = false;
    if (systemInfo.hasLegacyInstall) $("chip-legacy").hidden = false;

    if (!systemInfo.steamFound) {
      applyOptions(PRESETS.desktop);
      activePreset = "desktop";
      document.querySelectorAll(".preset-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.preset === "desktop");
      });
    } else if (systemInfo.flatpakInstalled) {
      setPreset("update");
    } else {
      setPreset("deck");
    }

    syncSteamOptions();
    updateSummary();
  } catch (err) {
    if (!isLocalInstallerHost()) {
      showStaticHostHelp();
      return;
    }
    errorMessage.textContent =
      err instanceof Error
        ? err.message
        : "Could not reach the local installer. Re-run bash install.sh --gui and keep Konsole open.";
    showScreen("error");
  }
}

async function pollStatus() {
  try {
    const res = await fetch("/api/status");
    const status = await res.json();
    for (const event of status.events || []) {
      const key = `${event.step}:${event.status}:${event.message}`;
      if (!pollStatus.seen.has(key)) {
        pollStatus.seen.add(key);
        applyEvent(event);
      }
    }
    if (status.error) {
      stopPolling();
      errorMessage.textContent = status.error;
      showScreen("error");
      setWizardStep("progress");
      document.querySelector('[data-step="progress"]')?.classList.add("active");
      return;
    }
    if (status.done) {
      stopPolling();
      progressFill.style.width = "100%";
      progressPercent.textContent = "100%";
      const opts = status.options || getOptions();
      buildDoneChecklist(opts);
      doneMessage.textContent = opts.addToSteam
        ? "NexusDeck is installed. Restart Steam to see the shortcut, then complete setup in the app."
        : "NexusDeck is installed. Launch it from Desktop Mode or your app menu.";
      showScreen("done");
    }
  } catch (e) {
    stopPolling();
    errorMessage.textContent = e instanceof Error ? e.message : String(e);
    showScreen("error");
  }
}
pollStatus.seen = new Set();

function startPolling() {
  pollStatus.seen = new Set();
  stepState.clear();
  logEl.textContent = "";
  errorLog.textContent = "";
  renderSteps();
  stopPolling();
  pollTimer = window.setInterval(pollStatus, 450);
  pollStatus();
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function startInstall() {
  if (isStaticPreviewHost() || !isLocalInstallerHost()) {
    showStaticHostHelp();
    return;
  }

  const opts = getOptions();
  if (opts.source === "local" && !opts.flatpakPath) {
    showToast("Enter the path to your .flatpak file");
    $("flatpak-path").focus();
    return;
  }

  showScreen("progress");

  const payload = {
    addToSteam: opts.addToSteam,
    addController: opts.addController,
    launchAfter: opts.launchAfter,
    registerNxm: opts.registerNxm,
    removeLegacy: opts.removeLegacy,
    flatpakPath: opts.flatpakPath || undefined,
  };

  const res = await fetch("/api/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    errorMessage.textContent = body.error || `Install failed (${res.status})`;
    showScreen("error");
    return;
  }

  startPolling();
}

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => setPreset(btn.dataset.preset));
});

document.querySelectorAll('input[name="source"]').forEach((radio) => {
  radio.addEventListener("change", syncSourceField);
});

$("flatpak-path").addEventListener("input", () => {
  detectPresetMismatch();
  updateSummary();
});

$("btn-continue").addEventListener("click", () => showScreen("options"));
$("btn-back").addEventListener("click", () => showScreen("welcome"));
$("btn-install").addEventListener("click", () => void startInstall());
$("btn-retry").addEventListener("click", () => showScreen("options"));
$("btn-close").addEventListener("click", () => window.close());

$("btn-copy-cmd").addEventListener("click", async () => {
  const cmd = $("launch-cmd").textContent;
  try {
    await navigator.clipboard.writeText(cmd);
    showToast("Command copied");
  } catch {
    showToast(cmd);
  }
});

function bindCopyButton(buttonId, codeId) {
  const btn = $(buttonId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const cmd = $(codeId).textContent;
    try {
      await navigator.clipboard.writeText(cmd);
      showToast("Command copied");
    } catch {
      showToast(cmd);
    }
  });
}

bindCopyButton("btn-copy-static-gui", "static-gui-cmd");
bindCopyButton("btn-copy-static-cli", "static-cli-cmd");
bindCopyButton("btn-copy-static-release", "static-release-cmd");

$("btn-toggle-log").addEventListener("click", () => {
  logVisible = !logVisible;
  logEl.hidden = !logVisible;
  $("btn-toggle-log").textContent = logVisible ? "Hide log" : "Show log";
});

$("btn-show-log").addEventListener("click", () => {
  errorLog.hidden = !errorLog.hidden;
  $("btn-show-log").textContent = errorLog.hidden ? "Show log" : "Hide log";
});

$("opt-steam").addEventListener("change", () => {
  syncSteamOptions();
  detectPresetMismatch();
  updateSummary();
});

bindOptionCards();
syncSourceField();
fetchInfo();
showScreen("welcome");
