"""NexusDeck Host — Decky companion for host-side modding reliability."""

import asyncio
import os
import shutil
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path

import decky

PLUGIN_VERSION = "1.1.0"
NEXUSDECK_APP_ID = "com.nexusdeck.app"


class Plugin:
    async def get_status(self) -> dict:
        decky_home = Path(decky.DECKY_HOME)
        plugin_dir = decky_home / "plugins" / "nexusdeck-host"
        decky_installed = decky_home.is_dir()
        plugin_installed = (plugin_dir / "plugin.json").is_file()
        version = PLUGIN_VERSION
        if plugin_installed:
            try:
                import json

                meta = json.loads((plugin_dir / "plugin.json").read_text(encoding="utf-8"))
                version = meta.get("version", PLUGIN_VERSION)
            except OSError:
                pass
        if not decky_installed:
            msg = "Decky home folder not found."
        elif plugin_installed:
            msg = f"NexusDeck Host v{version} is installed."
        else:
            msg = "Install this plugin from NexusDeck Settings."
        return {
            "decky_installed": decky_installed,
            "plugin_installed": plugin_installed,
            "plugin_version": version,
            "message": msg,
        }

    async def run_health_check(self) -> dict:
        lines: list[str] = []
        ok = True
        for line in self._health_lines():
            lines.append(line)
            if line.startswith("FAIL"):
                ok = False
        return {"ok": ok, "lines": lines}

    def _health_lines(self) -> list[str]:
        lines: list[str] = []
        home = Path(decky.DECKY_USER_HOME)

        if shutil.which("flatpak"):
            lines.append("OK flatpak is available")
        else:
            lines.append("FAIL flatpak not found")

        nd_data = home / ".var" / "app" / NEXUSDECK_APP_ID
        if nd_data.is_dir():
            lines.append("OK NexusDeck Flatpak data present")
        else:
            lines.append("WARN NexusDeck Flatpak not installed yet")

        steam_roots = [
            home / ".steam" / "steam",
            home / ".local" / "share" / "Steam",
        ]
        if any(p.is_dir() for p in steam_roots):
            lines.append("OK Steam installation found")
        else:
            lines.append("FAIL Steam not found")

        if shutil.which("protontricks"):
            lines.append("OK protontricks on PATH")
        else:
            flatpak_pt = subprocess.run(
                ["flatpak", "info", "com.github.Matoking.protontricks"],
                capture_output=True,
            )
            if flatpak_pt.returncode == 0:
                lines.append("OK protontricks (Flatpak) available")
            else:
                lines.append("WARN protontricks not installed — DeckModFix deps may fail")

        for tool in ("7z", "7zz", "7za"):
            if shutil.which(tool):
                lines.append(f"OK host {tool} found")
                break
        else:
            lines.append("WARN host 7-Zip not found (NexusDeck bundles its own)")

        staging = home / "NexusDeck"
        if staging.is_dir():
            writable = os.access(staging, os.W_OK)
            lines.append(
                "OK staging folder ~/NexusDeck"
                if writable
                else "WARN ~/NexusDeck exists but is not writable"
            )
        else:
            lines.append("WARN ~/NexusDeck staging folder missing")

        lines.append(f"OK Decky home: {decky.DECKY_HOME}")
        return lines

    async def launch_nexusdeck(self) -> str:
        flatpak = shutil.which("flatpak")
        if not flatpak:
            raise RuntimeError("flatpak not found on host")
        subprocess.Popen(
            [flatpak, "run", NEXUSDECK_APP_ID],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return "Launched NexusDeck"

    async def export_support_bundle(self) -> dict:
        home = Path(decky.DECKY_USER_HOME)
        out_dir = Path(decky.DECKY_PLUGIN_RUNTIME_DIR)
        out_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        zip_path = out_dir / f"nexusdeck-host-support_{stamp}.zip"

        log_dirs = [
            home / "NexusDeck" / "Logs",
            home / ".var" / "app" / NEXUSDECK_APP_ID / "config" / "nexusdeck" / "logs",
            Path(decky.DECKY_PLUGIN_LOG_DIR),
        ]

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
                "health.txt",
                "\n".join(self._health_lines()),
            )
            for log_dir in log_dirs:
                if not log_dir.is_dir():
                    continue
                for path in log_dir.rglob("*"):
                    if path.is_file():
                        arc = f"logs/{log_dir.name}/{path.relative_to(log_dir)}"
                        zf.write(path, arcname=str(arc).replace("\\", "/"))

        return {"path": str(zip_path), "message": f"Support bundle saved to {zip_path}"}

    async def _main(self) -> None:
        decky.logger.info("NexusDeck Host plugin v%s loaded", PLUGIN_VERSION)

    async def _unload(self) -> None:
        pass
