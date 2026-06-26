# NexusDeck Steam Input Profile

NexusDeck ships a **NexusDeck** Steam Input template for the Steam Deck (Neptune controller). It is installed automatically when you add NexusDeck to Steam from Settings or the Deck installer script.

## Auto-install

When you use **Settings → Add NexusDeck to Steam**, NexusDeck copies `nexusdeck_controller_config.vdf` into Steam’s `controller_base/templates/` folder and registers it in `configset_controller_neptune.vdf` for your Steam user. You can re-run install anytime with the in-app action or `install_nexusdeck_steam_input_layout`.

If the layout is not active in Gaming Mode, open **NexusDeck → Controller → Change layout** and pick **NexusDeck**.

## Profile: NexusDeck — Mod Manager

**Template:** Duplicate "Gamepad With Mouse Trackpad" and edit bindings.

| Control | Binding | In-app action |
|---------|---------|---------------|
| Left Stick | Pass-through | Spatial focus navigation |
| D-Pad | Pass-through | Grid/list focus |
| A | Pass-through | Primary action |
| B | Pass-through | Back |
| X | Pass-through | Secondary action |
| Y | Pass-through | Context / endorse / quick launch |
| L1 / R1 | Pass-through | Tab / sub-tab switch |
| L2 / R2 | Pass-through | Scroll / carousel / load-order reorder |
| Start (Menu) | Pass-through | Search focus or command palette |
| Select (View) | Pass-through | Toggle controller hint bar |
| Right Stick | Mouse region (low sensitivity) | Fallback precision clicks |
| Gyro (optional) | Scroll wheel | List scroll when gyro preset enabled in Settings |

## Presets (Settings → Steam Deck)

- **Deck Default** — D-pad + stick focus, L2/R2 scroll, gyro off
- **Deck Gyro Scroll** — enable gyro preset; map gyro to scroll in Steam Input
- **Desktop Mode** — disable Steam Input overlay for NexusDeck so the WebView receives raw gamepad API

## Gaming Mode setup

1. Add NexusDeck as a non-Steam game (Flatpak: `flatpak run com.nexusdeck.app`) — the bundled layout installs with **Add to Steam**
2. Restart Steam if you just added the shortcut
3. Open Steam → NexusDeck → Controller → pick the **NexusDeck** layout if it is not already active
4. Ensure all face buttons and shoulders are **Gamepad Binding** (pass-through), not keyboard/mouse
5. Launch from Gaming Mode (not Desktop Mode) for best results

## Button reference

See the in-app hint bar (bottom of screen when a controller is connected) for context-specific bindings.
