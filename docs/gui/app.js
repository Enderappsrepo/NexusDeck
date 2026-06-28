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

const screens = {
  welcome: document.getElementById("screen-welcome"),
  options: document.getElementById("screen-options"),
  progress: document.getElementById("screen-progress"),
  done: document.getElementById("screen-done"),
  error: document.getElementById("screen-error"),
};

const stepList = document.getElementById("step-list");
const progressFill = document.getElementById("progress-fill");
const logEl = document.getElementById("log");
const errorMessage = document.getElementById("error-message");
const doneMessage = document.getElementById("done-message");

let pollTimer = null;
let logVisible = false;
const stepState = new Map();

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

function stepIcon(status) {
  if (status === "done") return "✓";
  if (status === "error") return "✕";
  if (status === "warn") return "!";
  if (status === "running") return "…";
  return "•";
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

  const completed = STEP_ORDER.filter((k) => stepState.get(k)?.status === "done").length;
  const total = STEP_ORDER.length;
  progressFill.style.width = `${Math.min(100, (completed / total) * 100)}%`;
}

function applyEvent(event) {
  const step = event.step || "log";
  if (step === "log") {
    logEl.textContent += `${event.message}\n`;
    return;
  }
  stepState.set(step, { status: event.status || "info", message: event.message || "" });
  renderSteps();
}

async function fetchInfo() {
  try {
    const res = await fetch("/api/info");
    const info = await res.json();
    document.getElementById("repo-label").textContent = info.repo || "NexusDeck";
    if (info.isSteamDeck) {
      document.getElementById("deck-badge").hidden = false;
      document.getElementById("subtitle").textContent =
        "Steam Deck detected — optimized for Gaming Mode and controller navigation.";
    }
  } catch {
    /* ignore */
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
      return;
    }
    if (status.done) {
      stopPolling();
      doneMessage.textContent =
        "NexusDeck is installed. Restart Steam if you added a shortcut, then complete setup in the app.";
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
  renderSteps();
  stopPolling();
  pollTimer = window.setInterval(pollStatus, 500);
  pollStatus();
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function startInstall() {
  showScreen("progress");
  const payload = {
    addToSteam: document.getElementById("opt-steam").checked,
    addController: document.getElementById("opt-controller").checked,
    launchAfter: document.getElementById("opt-launch").checked,
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

document.getElementById("btn-continue").addEventListener("click", () => showScreen("options"));
document.getElementById("btn-back").addEventListener("click", () => showScreen("welcome"));
document.getElementById("btn-install").addEventListener("click", () => {
  void startInstall();
});
document.getElementById("btn-retry").addEventListener("click", () => showScreen("options"));
document.getElementById("btn-close").addEventListener("click", () => window.close());
document.getElementById("btn-toggle-log").addEventListener("click", () => {
  logVisible = !logVisible;
  logEl.hidden = !logVisible;
  document.getElementById("btn-toggle-log").textContent = logVisible ? "Hide log" : "Show log";
});

document.getElementById("opt-steam").addEventListener("change", (e) => {
  const controller = document.getElementById("opt-controller");
  controller.disabled = !e.target.checked;
  if (!e.target.checked) controller.checked = false;
});

fetchInfo();
showScreen("welcome");
