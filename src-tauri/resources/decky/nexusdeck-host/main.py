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

PLUGIN_VERSION = "1.1.14"
NEXUSDECK_APP_ID = "com.nexusdeck.app"
PROTONTRICKS_FLATPAK = "com.github.Matoking.protontricks"
STEAM_FLATPAK = "com.valvesoftware.Steam"
FLATPAK_BIN = "/usr/bin/flatpak"
STEAM_SHORTCUT_EXE = FLATPAK_BIN if Path(FLATPAK_BIN).is_file() else "flatpak"
STEAM_LAUNCH_OPTIONS = f"run {NEXUSDECK_APP_ID}"


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

    def _steam_roots(self) -> list[Path]:
        home = self._home()
        return [
            home / ".steam" / "steam",
            home / ".local" / "share" / "Steam",
            home / ".var" / "app" / STEAM_FLATPAK / "data" / "Steam",
        ]

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

    def _steam_shortcuts_paths(self) -> list[Path]:
        paths: list[Path] = []
        for root in self._steam_roots():
            userdata = root / "userdata"
            if not userdata.is_dir():
                continue
            for entry in userdata.iterdir():
                candidate = entry / "config" / "shortcuts.vdf"
                if candidate.is_file():
                    paths.append(candidate)
        return paths

    def _resolve_shortcuts_path(self) -> Path | None:
        for path in self._steam_shortcuts_paths():
            return path
        return None

    @staticmethod
    def _generate_shortcut_app_id(name: str, exe: str) -> int:
        combined = f"{name}{exe}\0"
        crc = 0
        for byte in combined.encode("utf-8"):
            crc = ((crc << 8) ^ byte) & 0xFFFFFFFF
        return crc | 0x80000000

    def _shortcut_markers(self) -> tuple[str, ...]:
        return (
            NEXUSDECK_APP_ID,
            STEAM_SHORTCUT_EXE,
            STEAM_LAUNCH_OPTIONS,
            "flatpak run com.nexusdeck.app",
            "flatpak-spawn",
        )

    def _steam_shortcut_present(self) -> bool:
        for shortcuts in self._steam_shortcuts_paths():
            try:
                text = shortcuts.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if any(marker in text for marker in self._shortcut_markers()):
                if "NexusDeck" in text or NEXUSDECK_APP_ID in text:
                    return True
        return False

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

    def _append_steam_shortcut(self, display_name: str = "NexusDeck") -> dict:
        path = self._resolve_shortcuts_path()
        if path is None:
            raise RuntimeError(
                "Steam userdata not found. Launch Steam once while signed in, then try again."
            )

        home = str(self._home())
        exe = STEAM_SHORTCUT_EXE
        launch_options = STEAM_LAUNCH_OPTIONS
        app_id = self._generate_shortcut_app_id(display_name, exe)
        block = f"""
"AppName"\t\t"{display_name}"
"Exe"\t\t"{exe}"
"StartDir"\t\t"{home}"
"LaunchOptions"\t\t"{launch_options}"
"icon"\t\t""
"ShortcutPath"\t\t""
"IsHidden"\t\t"0"
"AllowDesktopConfig"\t\t"1"
"AllowOverlay"\t\t"1"
"OpenVR"\t\t"0"
"Devkit"\t\t"0"
"DevkitGameID"\t\t""
"DevkitOverrideAppID"\t\t"0"
"LastPlayTime"\t\t"0"
"tags"\t\t"{{}}"
"appid"\t\t"{app_id}"
"Playtime"\t\t"0"
"Playtime2wks"\t\t"0"
"SortAs"\t\t""
"UseLaunchOptions"\t\t"1"
"LastUpdated"\t\t"0"
"FlatpakAppID"\t\t""
"GameID"\t\t"{app_id}"
"""

        backup = path.parent / (path.name + ".nexusdeck_backup")
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file() and not backup.is_file():
            backup.write_bytes(path.read_bytes())

        if path.is_file():
            text = path.read_text(encoding="utf-8", errors="replace")
            needle = f'"Exe"\t\t"{exe}"'
            if needle in text:
                return {
                    "success": True,
                    "already_existed": True,
                    "shortcuts_path": str(path),
                    "app_id": app_id,
                    "message": "NexusDeck shortcut already in Steam.",
                }
            if '"Shortcuts"' in text:
                stripped = text.rstrip()
                if stripped.endswith("}"):
                    text = stripped[:-1] + block + "\n}\n"
                else:
                    text = text + block + "\n"
            else:
                text = f'"Shortcuts"\n{{\n{block}\n}}\n'
        else:
            text = f'"Shortcuts"\n{{\n{block}\n}}\n'

        path.write_text(text, encoding="utf-8")
        return {
            "success": True,
            "already_existed": False,
            "shortcuts_path": str(path),
            "app_id": app_id,
            "message": "Added NexusDeck to Steam. Fully quit and reopen Steam for it to appear.",
        }

    def _steam_running(self) -> bool:
        if shutil.which("pgrep"):
            for pattern in ("steam", "steam.sh", "com.valvesoftware.Steam"):
                if (
                    subprocess.run(["pgrep", "-f", pattern], capture_output=True).returncode
                    == 0
                ):
                    return True
        flatpak = shutil.which("flatpak")
        if flatpak:
            proc = subprocess.run(
                [flatpak, "ps"],
                capture_output=True,
                text=True,
            )
            if proc.returncode == 0 and "com.valvesoftware.Steam" in proc.stdout:
                return True
        return False

    async def _request_steam_shutdown(self) -> None:
        flatpak = shutil.which("flatpak")
        if flatpak and (
            subprocess.run(
                [flatpak, "info", STEAM_FLATPAK], capture_output=True
            ).returncode
            == 0
        ):
            subprocess.Popen(
                [flatpak, "run", STEAM_FLATPAK, "-shutdown"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return
        steam = shutil.which("steam")
        if steam:
            subprocess.Popen(
                [steam, "-shutdown"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

    async def add_steam_shortcut(self) -> dict:
        if self._steam_running():
            return {
                "success": False,
                "needs_steam_closed": True,
                "message": "Close Steam first (Steam menu → Exit). Then tap Add to Steam again.",
            }
        return self._append_steam_shortcut("NexusDeck")

    async def add_steam_shortcut_when_ready(self, timeout_sec: int = 180) -> dict:
        if not self._steam_running():
            return self._append_steam_shortcut("NexusDeck")

        deadline = asyncio.get_event_loop().time() + max(10, timeout_sec)
        while asyncio.get_event_loop().time() < deadline:
            if not self._steam_running():
                return self._append_steam_shortcut("NexusDeck")
            await asyncio.sleep(1.5)

        raise RuntimeError(
            "Steam is still running. Exit Steam completely, then try Add to Steam again."
        )

    async def quit_steam_client(self) -> dict:
        await self._request_steam_shutdown()
        return {
            "success": True,
            "message": "Sent quit request to Steam. Waiting for it to close…",
        }

    async def fix_gaming_mode_launch(self) -> dict:
        flatpak = shutil.which("flatpak")
        if not flatpak:
            raise RuntimeError("flatpak not found on host.")
        proc = subprocess.run(
            [
                flatpak,
                "override",
                "--user",
                f"--talk-name=org.freedesktop.Flatpak",
                STEAM_FLATPAK,
            ],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(f"Could not apply Steam Flatpak override: {err}")
        return {
            "success": True,
            "message": (
                "Applied Steam Flatpak override for Gaming Mode launches. "
                "Restart Steam, then try Open NexusDeck again."
            ),
        }

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
        if steam_cmd and self._steam_shortcut_present():
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
        elif not steam_ok:
            msg = "Add NexusDeck to Steam below for reliable Gaming Mode launch."
        elif pt_ok and nd_ok:
            msg = "Ready — open NexusDeck or run a health check."
        elif not pt_ok:
            msg = "Install Protontricks for mod dependencies (see NexusDeck Settings)."
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

        if any(p.is_dir() for p in self._steam_roots()):
            lines.append("OK Steam installation found")
        else:
            lines.append("FAIL Steam not found")

        if self._steam_shortcut_present():
            lines.append("OK NexusDeck Steam shortcut found")
        else:
            lines.append(
                "WARN No Steam shortcut — tap Add to Steam below"
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
            lines.append("WARN protontricks not installed — mod deps may fail")

        proton_log = home / "NexusDeck" / "Logs" / "proton.log"
        if proton_log.is_file():
            lines.append("OK Proton operation log present")
        else:
            lines.append("INFO No proton.log yet — run a deps install in NexusDeck")

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
            "Tap Add to Steam below, restart Steam, then try again.",
            "Or tap Fix Gaming Mode launch if flatpak-spawn fails.",
            "Desktop Mode: flatpak run com.nexusdeck.app",
        ]

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
