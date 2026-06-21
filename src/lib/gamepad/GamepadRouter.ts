import { GP } from "./buttons";
import type { InputContext } from "./contexts";
import {
  activateFocused,
  dispatchQuickLaunch,
  isTypingElement,
  moveFocus,
  scrollFocusedPane,
} from "./focusNavigation";
import { focusedDownloadId, isDownloadRowComplete } from "./domHelpers";

export type ButtonHandler = (button: number) => void;
export type AxisHandler = (axis: number, value: number) => void;

interface TabHandler {
  tabIds: string[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

interface RepeatState {
  key: string;
  lastFire: number;
  fired: boolean;
}

const STICK_DEADZONE = 0.25;
const INITIAL_REPEAT_MS = 180;
const REPEAT_MS = 80;
const SCROLL_REPEAT_MS = 60;
// Adaptive polling: stay at rAF while the controller is active or just released,
// then back off to a low-frequency timer. In Steam Deck Gaming Mode the built-in
// controls are *always* "connected", so a perpetual rAF loop pins the CPU/GPU and
// drains battery even when the user isn't touching anything.
const IDLE_AFTER_MS = 1500;
const IDLE_POLL_MS = 50;

type Listener = () => void;
type FocusDir = "next" | "prev" | "up" | "down";

class GamepadRouterImpl {
  private raf = 0;
  private timer = 0;
  private lastActivity = 0;
  private running = false;
  private pressed = new Set<number>();
  private stickDir: FocusDir | null = null;
  private repeatStates = new Map<string, RepeatState>();
  private controllerActive = false;
  private hintBarVisible = true;
  private context: InputContext = "global";
  private contextStack: InputContext[] = ["global"];

  private buttonHandlers = new Set<ButtonHandler>();
  // Stacks, not single slots: multiple components (sidebar, game hub, discover,
  // dialogs) register tab/back handlers. The most recently mounted wins, and on
  // unmount we pop back to the previous one instead of clearing it for everyone.
  private tabHandlers: TabHandler[] = [];
  private backHandlers: Array<() => void> = [];
  private contextActionHandlers = new Map<
    number,
    Set<(ctx: InputContext) => void>
  >();

  private listeners = new Set<Listener>();

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastActivity = performance.now();
    this.poll();
    window.addEventListener("gamepadconnected", this.onConnect);
    window.addEventListener("gamepaddisconnected", this.onDisconnect);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    window.removeEventListener("gamepadconnected", this.onConnect);
    window.removeEventListener("gamepaddisconnected", this.onDisconnect);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private onConnect = (): void => {
    // A pad just woke up — make sure we're polling at full rate to catch input.
    this.lastActivity = performance.now();
    this.notify();
  };

  private onDisconnect = (): void => {
    if (!this.getPad()) {
      this.controllerActive = false;
      document.documentElement.removeAttribute("data-controller");
      this.pressed.clear();
      this.repeatStates.clear();
    }
    this.notify();
  };

  getControllerActive(): boolean {
    return this.controllerActive;
  }

  getHintBarVisible(): boolean {
    return this.hintBarVisible;
  }

  setHintBarVisible(visible: boolean): void {
    if (this.hintBarVisible === visible) return;
    this.hintBarVisible = visible;
    this.notify();
  }

  toggleHintBar(): void {
    this.hintBarVisible = !this.hintBarVisible;
    this.notify();
  }

  getContext(): InputContext {
    return this.context;
  }

  setContext(ctx: InputContext): void {
    if (this.context === ctx) return;
    this.context = ctx;
    this.notify();
  }

  pushContext(ctx: InputContext): void {
    this.contextStack.push(ctx);
    this.context = ctx;
    this.notify();
  }

  popContext(): void {
    if (this.contextStack.length > 1) {
      this.contextStack.pop();
      this.context = this.contextStack[this.contextStack.length - 1];
      this.notify();
    }
  }

  onButton(handler: ButtonHandler): () => void {
    this.buttonHandlers.add(handler);
    return () => this.buttonHandlers.delete(handler);
  }

  onContextAction(button: number, handler: (ctx: InputContext) => void): () => void {
    if (!this.contextActionHandlers.has(button)) {
      this.contextActionHandlers.set(button, new Set());
    }
    this.contextActionHandlers.get(button)!.add(handler);
    return () => this.contextActionHandlers.get(button)?.delete(handler);
  }

  pushTabHandler(handler: TabHandler): () => void {
    this.tabHandlers.push(handler);
    return () => {
      const i = this.tabHandlers.lastIndexOf(handler);
      if (i !== -1) this.tabHandlers.splice(i, 1);
    };
  }

  pushBackHandler(handler: () => void): () => void {
    this.backHandlers.push(handler);
    return () => {
      const i = this.backHandlers.lastIndexOf(handler);
      if (i !== -1) this.backHandlers.splice(i, 1);
    };
  }

  private getPad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (pad) return pad;
    }
    return null;
  }

  private markControllerActive(): void {
    if (!this.controllerActive) {
      this.controllerActive = true;
      document.documentElement.setAttribute("data-controller", "true");
      this.notify();
    }
  }

  private poll = (): void => {
    if (!this.running) return;
    const pad = this.getPad();
    if (pad) {
      this.processButtons(pad);
      this.processAxes(pad);
      this.processTriggers(pad);
      if (this.padHasInput(pad)) this.lastActivity = performance.now();
    }

    if (performance.now() - this.lastActivity > IDLE_AFTER_MS) {
      this.timer = window.setTimeout(this.poll, IDLE_POLL_MS);
    } else {
      this.raf = requestAnimationFrame(this.poll);
    }
  };

  private padHasInput(pad: Gamepad): boolean {
    for (const btn of pad.buttons) {
      if (btn.pressed || btn.value > 0.5) return true;
    }
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    return Math.hypot(lx, ly) >= STICK_DEADZONE;
  }

  private processButtons(pad: Gamepad): void {
    pad.buttons.forEach((btn, i) => {
      if (btn.pressed && !this.pressed.has(i)) {
        this.pressed.add(i);
        this.markControllerActive();
        this.handleButtonPress(i);
      } else if (!btn.pressed) {
        this.pressed.delete(i);
        if (i >= GP.DPAD_UP && i <= GP.DPAD_RIGHT) {
          this.repeatStates.delete(`btn-${i}`);
        }
      }
    });
  }

  private handleButtonPress(button: number): void {
    // Let registered handlers run first (tabs, back, context actions)
    for (const handler of this.buttonHandlers) {
      handler(button);
    }

    const backHandler = this.backHandlers[this.backHandlers.length - 1];
    if (button === GP.B && backHandler) {
      backHandler();
      return;
    }

    const tabHandler = this.tabHandlers[this.tabHandlers.length - 1];
    if ((button === GP.L1 || button === GP.R1) && tabHandler) {
      const { tabIds, activeTab, onTabChange } = tabHandler;
      const idx = tabIds.indexOf(activeTab);
      if (idx !== -1) {
        const next =
          button === GP.L1
            ? tabIds[(idx - 1 + tabIds.length) % tabIds.length]
            : tabIds[(idx + 1) % tabIds.length];
        onTabChange(next);
      }
      return;
    }

    const contextHandlers = this.contextActionHandlers.get(button);
    if (contextHandlers) {
      for (const h of contextHandlers) {
        h(this.context);
      }
    }

    if (isTypingElement(document.activeElement)) {
      return;
    }

    switch (button) {
      case GP.Y:
        if (this.context === "home" || this.context === "gameHub") {
          dispatchQuickLaunch();
        }
        break;
      case GP.DPAD_UP:
        moveFocus("up");
        break;
      case GP.DPAD_DOWN:
        moveFocus("down");
        break;
      case GP.DPAD_LEFT:
        moveFocus("prev");
        break;
      case GP.DPAD_RIGHT:
        moveFocus("next");
        break;
      case GP.A:
        activateFocused();
        break;
      case GP.X:
        if (isDownloadRowComplete()) {
          const downloadId = focusedDownloadId();
          if (downloadId) {
            window.dispatchEvent(
              new CustomEvent("nexusdeck-install-download", {
                detail: { downloadId },
              })
            );
            break;
          }
        }
        window.dispatchEvent(new CustomEvent("nexusdeck-secondary-action"));
        break;
      case GP.SELECT:
        this.toggleHintBar();
        break;
      case GP.START:
        if (this.context === "library") {
          document.querySelector<HTMLElement>("[data-library-search]")?.focus();
        } else if (
          this.context === "browse" ||
          this.context === "discover" ||
          this.context === "gameHub"
        ) {
          document.querySelector<HTMLElement>("[data-mod-search]")?.focus();
        } else if (this.context === "games") {
          document.querySelector<HTMLElement>("[data-games-search]")?.focus();
        } else {
          window.dispatchEvent(new CustomEvent("nexusdeck-open-command-palette"));
        }
        break;
      case GP.L2:
        this.fireTriggerScroll("up");
        break;
      case GP.R2:
        this.fireTriggerScroll("down");
        break;
      default:
        break;
    }
  }

  private processAxes(pad: Gamepad): void {
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    if (Math.hypot(lx, ly) < STICK_DEADZONE) {
      this.stickDir = null;
      this.repeatStates.delete("stick");
      return;
    }

    this.markControllerActive();

    // Dominant-axis mapping. Gamepad axes are +x = right, +y = down, so this
    // tracks the physical stick direction. (The old 8-sector math inverted both
    // axes — pushing up moved focus down, right moved left.)
    const dir: FocusDir =
      Math.abs(ly) > Math.abs(lx)
        ? ly > 0
          ? "down"
          : "up"
        : lx > 0
          ? "next"
          : "prev";

    if (dir !== this.stickDir) {
      this.stickDir = dir;
      this.repeatStates.delete("stick");
      this.fireStickDir(dir);
    } else {
      this.fireRepeat("stick", () => this.fireStickDir(dir), INITIAL_REPEAT_MS, REPEAT_MS);
    }
  }

  private fireStickDir(dir: FocusDir): void {
    if (isTypingElement(document.activeElement)) return;
    moveFocus(dir);
  }

  private fireTriggerScroll(direction: "up" | "down"): void {
    const el = document.activeElement as HTMLElement;
    if (this.context === "modDetail") {
      window.dispatchEvent(
        new CustomEvent("nexusdeck-gallery-scroll", { detail: { direction } })
      );
      return;
    }
    if (
      this.context === "library" &&
      el?.dataset.modId
    ) {
      window.dispatchEvent(
        new CustomEvent("nexusdeck-library-reorder", {
          detail: { modId: el.dataset.modId, direction },
        })
      );
      return;
    }
    scrollFocusedPane(direction);
  }
  private processTriggers(pad: Gamepad): void {
    const l2 = pad.buttons[GP.L2]?.value ?? 0;
    const r2 = pad.buttons[GP.R2]?.value ?? 0;

    if (l2 > 0.5) {
      this.markControllerActive();
      this.fireRepeat("l2", () => this.fireTriggerScroll("up"), 200, SCROLL_REPEAT_MS);
    } else {
      this.repeatStates.delete("l2");
    }

    if (r2 > 0.5) {
      this.markControllerActive();
      this.fireRepeat("r2", () => this.fireTriggerScroll("down"), 200, SCROLL_REPEAT_MS);
    } else {
      this.repeatStates.delete("r2");
    }
  }

  private fireRepeat(
    key: string,
    action: () => void,
    initialMs: number,
    repeatMs: number
  ): void {
    const now = performance.now();
    let state = this.repeatStates.get(key);
    if (!state) {
      state = { key, lastFire: now, fired: false };
      this.repeatStates.set(key, state);
      action();
      return;
    }
    const delay = state.fired ? repeatMs : initialMs;
    if (now - state.lastFire >= delay) {
      state.lastFire = now;
      state.fired = true;
      action();
    }
  }
}

export const gamepadRouter = new GamepadRouterImpl();
