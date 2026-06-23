"""NexusDeck Host — lightweight Decky companion."""

import asyncio
import shutil
import subprocess

import decky

PLUGIN_VERSION = "1.1.6"
NEXUSDECK_APP_ID = "com.nexusdeck.app"
PROTONTRICKS_FLATPAK = "com.github.Matoking.protontricks"


class Plugin:
    def _protontricks_ok(self) -> bool:
        if shutil.which("protontricks"):
            return True
        return (
            subprocess.run(
                ["flatpak", "info", PROTONTRICKS_FLATPAK],
                capture_output=True,
            ).returncode
            == 0
        )

    def _nexusdeck_installed(self) -> bool:
        from pathlib import Path

        home = Path(decky.DECKY_USER_HOME)
        return (home / ".var" / "app" / NEXUSDECK_APP_ID).is_dir()

    async def get_status(self) -> dict:
        pt_ok = self._protontricks_ok()
        nd_ok = self._nexusdeck_installed()
        if pt_ok and nd_ok:
            msg = "Ready — open NexusDeck or install mods from Gaming Mode."
        elif not pt_ok:
            msg = "Install Protontricks (see NexusDeck Settings guide)."
        elif not nd_ok:
            msg = "Install NexusDeck Flatpak, then use Launch below."
        else:
            msg = "NexusDeck Host is active."
        return {
            "protontricks_ok": pt_ok,
            "nexusdeck_installed": nd_ok,
            "message": msg,
        }

    async def launch_nexusdeck(self) -> str:
        flatpak = shutil.which("flatpak")
        if not flatpak:
            raise RuntimeError("flatpak not found")
        subprocess.Popen(
            [flatpak, "run", NEXUSDECK_APP_ID],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return "Opened NexusDeck"

    async def _main(self) -> None:
        decky.logger.info("NexusDeck Host v%s loaded", PLUGIN_VERSION)

    async def _unload(self) -> None:
        pass
