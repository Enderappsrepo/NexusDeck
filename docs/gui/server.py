#!/usr/bin/env python3
"""Local web UI for the NexusDeck Steam Deck installer (stdlib only)."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

GUI_DIR = Path(__file__).resolve().parent
INSTALL_DIR = GUI_DIR.parent

_state_lock = threading.Lock()
_state: dict = {
    "running": False,
    "done": False,
    "error": None,
    "events": [],
    "options": {},
}


def _pick_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _append_event(event: dict) -> None:
    with _state_lock:
        _state["events"].append(event)
        if event.get("status") == "error":
            _state["error"] = event.get("message")
            _state["running"] = False
        if event.get("step") == "complete" and event.get("status") == "done":
            _state["done"] = True
            _state["running"] = False


def _run_install(options: dict) -> None:
    env = os.environ.copy()
    env["NEXUSDECK_JSON_PROGRESS"] = "1"
    env["NEXUSDECK_NONINTERACTIVE"] = "1"
    env["NEXUSDECK_ADD_STEAM"] = "1" if options.get("addToSteam", True) else "0"
    env["NEXUSDECK_ADD_CONTROLLER"] = "1" if options.get("addController", True) else "0"
    env["NEXUSDECK_LAUNCH_AFTER"] = "1" if options.get("launchAfter", True) else "0"

    with _state_lock:
        _state["running"] = True
        _state["done"] = False
        _state["error"] = None
        _state["events"] = []
        _state["options"] = options

    proc = subprocess.Popen(
        [
            "bash",
            "-lc",
            f"source '{INSTALL_DIR / 'install-common.sh'}' && run_install_pipeline",
        ],
        cwd=str(INSTALL_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        if line.startswith("{"):
            try:
                _append_event(json.loads(line))
                continue
            except json.JSONDecodeError:
                pass
        _append_event({"step": "log", "status": "info", "message": line})

    code = proc.wait()
    with _state_lock:
        if code != 0 and not _state["done"]:
            _state["error"] = _state["error"] or f"Installer exited with code {code}"
        _state["running"] = False


class Handler(BaseHTTPRequestHandler):
    server_version = "NexusDeckInstaller/1.0"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, content_type: str) -> None:
        if not path.is_file():
            self.send_error(404)
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            return self._send_file(GUI_DIR / "index.html", "text/html; charset=utf-8")
        if path == "/styles.css":
            return self._send_file(GUI_DIR / "styles.css", "text/css; charset=utf-8")
        if path == "/app.js":
            return self._send_file(GUI_DIR / "app.js", "application/javascript; charset=utf-8")
        if path == "/api/status":
            with _state_lock:
                return self._send_json(dict(_state))
        if path == "/api/info":
            deck = os.path.isdir("/home/deck") or "SteamOS" in os.environ.get("SteamOS", "")
            return self._send_json(
                {
                    "appName": "NexusDeck",
                    "isSteamDeck": deck,
                    "repo": os.environ.get("NEXUSDECK_GITHUB_REPO", "Enderappsrepo/NexusDeck"),
                }
            )
        self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/install":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            options = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return self._send_json({"error": "Invalid JSON"}, 400)

        with _state_lock:
            if _state["running"]:
                return self._send_json({"error": "Install already running"}, 409)

        threading.Thread(target=_run_install, args=(options,), daemon=True).start()
        self._send_json({"started": True})


def main() -> int:
    port = int(os.environ.get("NEXUSDECK_INSTALLER_PORT", "0") or "0")
    if port == 0:
        port = _pick_port()

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(url, flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
