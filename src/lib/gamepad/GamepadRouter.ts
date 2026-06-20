import { GP } from "./buttons";
import type { InputContext } from "./contexts";
import {
  activateFocused,
  dispatchQuickLaunch,
  isTypingElement,
  moveFocus,
  scrollFocusedPane,
} from "./focusNavigation";

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

type Listener = () => void;

class GamepadRouterImpl {
  private raf = 0;
  private running = false;
  private pressed = new Set<number>();
  private stickSector = -1;
  private repeatStates = new Map<string, RepeatState>();
  private controllerActive = false;
  private hintBarVisible = true;
  private context: InputContext = "global";
  private contextStack: InputContext[] = ["global"];

  private buttonHandlers = new Set<ButtonHandler>();
  private tabHandler: TabHandler | null = null;
  private backHandler: (() => void) | null = null;
  private contextActionHandlers = new Map<
    number,
    Set<(ctx: InputContext) => void>
  >();

  private listeners = new Set<Listener>();

  start(): void {
    if (this.running) return;
    this.running = true;
    this.poll();
    window.addEventListener("gamepadconnected", this.onConnect);
    window.addEventListener("gamepaddisconnected", this.onDisconnect);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
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
    this.notify();
  };

  private onDisconnect = (): void => {
    this.notify();
  };

  getControllerActive(): boolean {
    return this.controllerActive;
  }

  getHintBarVisible(): boolean {
    return this.hintBarVisible;
  }

  setHintBarVisible(visible: boolean): void {
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

  setTabHandler(handler: TabHandler | null): void {
    this.tabHandler = handler;
  }

  setBackHandler(handler: (() => void) | null): void {
    this.backHandler = handler;
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
    }
    this.raf = requestAnimationFrame(this.poll);
  };

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

    if (button === GP.B && this.backHandler) {
      this.backHandler();
      return;
    }

    if (
      (button === GP.L1 || button === GP.R1) &&
      this.tabHandler
    ) {
      const { tabIds, activeTab, onTabChange } = this.tabHandler;
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
        window.dispatchEvent(new CustomEvent("nexusdeck-secondary-action"));
        break;
      case GP.SELECT:
        this.toggleHintBar();
        break;
      case GP.START:
        if (
          this.context === "gameHub" ||
          this.context === "library" ||
          this.context === "browse"
        ) {
          const selector =
            this.context === "library" ? "[data-library-search]" : "[data-mod-search]";
          document.querySelector<HTMLElement>(selector)?.focus();
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
    const magnitude = Math.sqrt(lx * lx + ly * ly);
    if (magnitude < STICK_DEADZONE) {
      this.stickSector = -1;
      this.repeatStates.delete("stick");
      return;
    }

    this.markControllerActive();

    const angle = Math.atan2(ly, lx);
    const sector = Math.round(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;

    if (sector !== this.stickSector) {
      this.stickSector = sector;
      this.repeatStates.delete("stick");
      this.fireStick(sector);
    } else {
      this.fireRepeat("stick", () => this.fireStick(sector), INITIAL_REPEAT_MS, REPEAT_MS);
    }
  }

  private fireStick(sector: number): void {
    if (isTypingElement(document.activeElement)) return;
    switch (sector) {
      case 0:
        moveFocus("next");
        break;
      case 1:
      case 2:
        moveFocus("down");
        break;
      case 3:
      case 4:
        moveFocus("prev");
        break;
      case 5:
      case 6:
        moveFocus("up");
        break;
      case 7:
        moveFocus("next");
        break;
      default:
        break;
    }
  }

  private fireTriggerScroll(direction: "up" | "down"): void {
    const el = document.activeElement as HTMLElement;
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
