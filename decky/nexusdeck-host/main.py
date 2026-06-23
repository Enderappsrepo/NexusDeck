"""NexusDeck Host — Decky companion for host-side modding reliability."""

import asyncio
import json
import os
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import decky

PLUGIN_VERSION = "1.1.8"
NEXUSDECK_APP_ID = "com.nexusdeck.app"
PROTONTRICKS_FLATPAK = "com.github.Matoking.protontricks"
STEAM_SHORTCUT_EXE = f"flatpak run {NEXUSDECK_APP_ID}"


class Plugin:
    def _home(self) -> Path:
        return Path(decky.DECKY_USER_HOME)

    def _launch_env(self) -> dict[str, str]:
        env = os.environ.copy()
        uid = os.getuid()
        if not env.get("XDG_RUNTIME_DIR"):
            env["XDG_RUNTIME_DIR"] = f"/run/user/{uid}"
        if not env.get("DBUS_SESSION_BUS_ADDRESS"):
            env["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={env['XDG_RUNTIME_DIR']}/bus"
        return env

    def _protontricks_ok(self) -> bool:
        if shutil.which("protontricks"):
            return True
        flatpak = shutil.which("flatpak")
        if not flatpak:
            return False
        return (
            subprocess.run(
                [flatpak, "info", PROTONTRICKS_FLATPAK],
                capture_output=True,
            ).returncode
            == 0
        )

    def _nexusdeck_installed(self) -> bool:
        return (self._home() / ".var" / "app" / NEXUSDECK_APP_ID).is_dir()

    def _flatpak_installed(self) -> bool:
        flatpak = shutil.which("flatpak")
        if not flatpak:
            return False
        return (
            subprocess.run(
                [flatpak, "info", "--user", NEXUSDECK_APP_ID],
                capture_output=True,
            ).returncode
            == 0
        )

    def _steam_shortcut_present(self) -> bool:
        for shortcuts in self._steam_shortcuts_paths():
            if not shortcuts.is_file():
                continue
            try:
                text = shortcuts.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if STEAM_SHORTCUT_EXE in text or NEXUSDECK_APP_ID in text:
                return True
        return False

    def _steam_shortcuts_paths(self) -> list[Path]:
        home = self._home()
        steam_roots = [
            home / ".steam" / "steam",
            home / ".local" / "share" / "Steam",
        ]
        paths: list[Path] = []
        for root in steam_roots:
            userdata = root / "userdata"
            if not userdata.is_dir():
                continue
            for entry in userdata.iterdir():
                candidate = entry / "config" / "shortcuts.vdf"
                if candidate.is_file():
                    paths.append(candidate)
        return paths

    @staticmethod
    def _generate_shortcut_app_id(name: str, exe: str) -> int:
        combined = f"{name}{exe}\0"
        crc = 0
        for byte in combined.encode("utf-8"):
            crc = ((crc << 8) ^ byte) & 0xFFFFFFFF
        return crc | 0x80000000

    def _steam_applaunch_cmd(self) -> list[str] | None:
        steam = shutil.which("steam")
        if not steam:
            for candidate in ("/usr/bin/steam", "/usr/local/bin/steam"):
                if Path(candidate).is_file():
                    steam = candidate
                    break
        if not steam:
            return None
        app_id = self._generate_shortcut_app_id("NexusDeck", STEAM_SHORTCUT_EXE)
        return [steam, "-applaunch", str(app_id)]

    def _launch_strategies(self) -> list[tuple[str, list[str]]]:
        strategies: list[tuple[str, list[str]]] = []
        spawn = shutil.which("flatpak-spawn")
        flatpak = shutil.which("flatpak")

        if spawn and flatpak:
            strategies.append(
                (
                    "flatpak-spawn (Gaming Mode)",
                    [spawn, "--host", "flatpak", "run", NEXUSDECK_APP_ID],
                )
            )

        if flatpak:
            strategies.append(
                ("flatpak run", [flatpak, "run", "--user", NEXUSDECK_APP_ID])
            )

        steam_cmd = self._steam_applaunch_cmd()
        if steam_cmd:
            strategies.append(("Steam shortcut", steam_cmd))

        systemd_run = shutil.which("systemd-run")
        if systemd_run and flatpak:
            strategies.append(
                (
                    "systemd-run",
                    [
                        systemd_run,
                        "--user",
                        "--scope",
                        flatpak,
                        "run",
                        NEXUSDECK_APP_ID,
                    ],
                )
            )

        gtk = shutil.which("gtk-launch")
        if gtk:
            strategies.append(("gtk-launch", [gtk, NEXUSDECK_APP_ID]))

        return strategies

    async def _try_launch(self, cmd: list[str], env: dict[str, str]) -> tuple[bool, str]:
        try:
            proc = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True,
            )
        except OSError as exc:
            return False, str(exc)

        await asyncio.sleep(1.0)
        if proc.poll() is None:
            return True, "started"

        try:
            out, err = proc.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, err = proc.communicate(timeout=1)

        text = (err or out).decode("utf-8", errors="replace").strip()
        if not text:
            text = f"exit code {proc.returncode}"
        return False, text

    async def get_status(self) -> dict:
        pt_ok = self._protontricks_ok()
        nd_ok = self._nexusdeck_installed()
        fp_ok = self._flatpak_installed()
        steam_ok = self._steam_shortcut_present()

        if not fp_ok and not nd_ok:
            msg = "Install NexusDeck Flatpak from Settings or the release installer."
        elif pt_ok and nd_ok:
            msg = "Ready — open NexusDeck or run a health check below."
        elif not pt_ok:
            msg = "Install Protontricks for DeckModFix deps (see NexusDeck Settings)."
        else:
            msg = "NexusDeck Host is active."

        return {
            "plugin_version": PLUGIN_VERSION,
            "protontricks_ok": pt_ok,
            "nexusdeck_installed": nd_ok,
            "flatpak_registered": fp_ok,
            "steam_shortcut_present": steam_ok,
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
        home = self._home()

        spawn = shutil.which("flatpak-spawn")
        flatpak = shutil.which("flatpak")
        if spawn:
            lines.append("OK flatpak-spawn available (Gaming Mode launches)")
        else:
            lines.append("WARN flatpak-spawn not found — Gaming Mode launch may fail")

        if flatpak:
            lines.append("OK flatpak is available")
        else:
            lines.append("FAIL flatpak not found")

        if self._flatpak_installed():
            lines.append(f"OK {NEXUSDECK_APP_ID} registered with Flatpak")
        else:
            lines.append(f"WARN {NEXUSDECK_APP_ID} not registered — run the installer")

        nd_data = home / ".var" / "app" / NEXUSDECK_APP_ID
        if nd_data.is_dir():
            lines.append("OK NexusDeck data folder present")
        else:
            lines.append("WARN NexusDeck has not been launched yet")

        steam_roots = [
            home / ".steam" / "steam",
            home / ".local" / "share" / "Steam",
        ]
        if any(p.is_dir() for p in steam_roots):
            lines.append("OK Steam installation found")
        else:
            lines.append("FAIL Steam not found")

        if self._steam_shortcut_present():
            lines.append("OK NexusDeck Steam shortcut found")
        else:
            lines.append(
                "WARN No Steam shortcut — add from NexusDeck Settings for reliable Gaming Mode launch"
            )

        if shutil.which("protontricks"):
            lines.append("OK protontricks on PATH")
        elif (
            flatpak
            and subprocess.run(
                [flatpak, "info", PROTONTRICKS_FLATPAK],
                capture_output=True,
            ).returncode
            == 0
        ):
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

    async def launch_nexusdeck(self) -> dict:
        if not self._flatpak_installed() and not self._nexusdeck_installed():
            raise RuntimeError(
                "NexusDeck Flatpak is not installed. "
                "Use NexusDeck Settings → Decky Host or run the release installer."
            )

        env = self._launch_env()
        errors: list[str] = []

        for label, cmd in self._launch_strategies():
            ok, detail = await self._try_launch(cmd, env)
            if ok:
                decky.logger.info("Launched NexusDeck via %s: %s", label, cmd)
                return {
                    "success": True,
                    "message": "Launched NexusDeck",
                    "method": label,
                }
            err_line = f"{label}: {detail}"
            errors.append(err_line)
            decky.logger.warning("Launch attempt failed — %s", err_line)

        tips = [
            "Add NexusDeck to Steam from Settings → Steam shortcut.",
            "Or switch to Desktop Mode and run: flatpak run com.nexusdeck.app",
        ]
        if not shutil.which("flatpak-spawn"):
            tips.insert(
                0,
                "Grant Steam Flatpak session bus: flatpak override --user "
                "--talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam",
            )

        raise RuntimeError(
            "Could not launch NexusDeck.\n"
            + "\n".join(errors)
            + "\n\n"
            + "\n".join(tips)
        )

    async def open_staging_folder(self) -> str:
        staging = self._home() / "NexusDeck"
        staging.mkdir(parents=True, exist_ok=True)
        opener = shutil.which("xdg-open") or shutil.which("gio")
        if opener:
            cmd = [opener, str(staging)]
            if opener.endswith("gio"):
                cmd = [opener, "open", str(staging)]
            subprocess.Popen(
                cmd,
                env=self._launch_env(),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return f"Opened {staging}"
        return f"Staging folder: {staging} (open from Desktop Mode file manager)"

    async def export_support_bundle(self) -> dict:
        home = self._home()
        out_dir = Path(decky.DECKY_PLUGIN_RUNTIME_DIR)
        out_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        zip_path = out_dir / f"nexusdeck-host-support_{stamp}.zip"

        status = await self.get_status()
        log_dirs = [
            home / "NexusDeck" / "Logs",
            home
            / ".var"
            / "app"
            / NEXUSDECK_APP_ID
            / "config"
            / "nexusdeck"
            / "logs",
            Path(decky.DECKY_PLUGIN_LOG_DIR),
        ]

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("health.txt", "\n".join(self._health_lines()))
            zf.writestr("status.json", json.dumps(status, indent=2))
            for log_dir in log_dirs:
                if not log_dir.is_dir():
                    continue
                for path in log_dir.rglob("*"):
                    if path.is_file():
                        arc = f"logs/{log_dir.name}/{path.relative_to(log_dir)}"
                        zf.write(path, arcname=str(arc).replace("\\", "/"))

        return {
            "path": str(zip_path),
            "message": f"Support bundle saved to {zip_path}",
        }

    async def _main(self) -> None:
        decky.logger.info("NexusDeck Host v%s loaded", PLUGIN_VERSION)

    async def _unload(self) -> None:
        pass
