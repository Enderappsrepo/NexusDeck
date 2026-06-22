import { installTauriMock } from "../tauri-mock";
import { api } from "@/lib/commands";

installTauriMock();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

async function runSmoke() {
  root.innerHTML = "<p data-testid='status'>Loading…</p>";
  try {
    const mods = await api.listInstalledMods("profile-1");
    root.innerHTML = `
      <div data-testid="library-smoke">
        <p data-testid="mod-count">${mods.length} mods installed</p>
        <ul>${mods.map((m) => `<li>${m.name}</li>`).join("")}</ul>
        <button id="install-btn" data-focusable="true">Install test mod</button>
        <p id="install-status" data-testid="install-status"></p>
      </div>
    `;
    document.getElementById("install-btn")?.addEventListener("click", async () => {
      const status = document.getElementById("install-status");
      if (!status) return;
      status.textContent = "Starting…";
      const progress = await api.startModDownload({
        gameDomain: "skyrimspecialedition",
        modId: 789,
        fileId: 1,
        fileName: "test.7z",
        stagingPath: "/tmp/staging",
        expectedSizeKb: 1,
        modName: "Queued Mod",
        profileId: "profile-1",
      });
      status.textContent = progress.status === "queued" ? "Install queued" : progress.status;
    });
  } catch (e) {
    root.innerHTML = `<p data-testid="error">${e instanceof Error ? e.message : String(e)}</p>`;
  }
}

void runSmoke();
