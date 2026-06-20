import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { gamepadRouter } from "@/lib/gamepad/GamepadRouter";
import type { InputContext } from "@/lib/gamepad/contexts";

interface GamepadRouterContextValue {
  controllerActive: boolean;
  hintBarVisible: boolean;
  context: InputContext;
}

const GamepadRouterContext = createContext<GamepadRouterContextValue>({
  controllerActive: false,
  hintBarVisible: true,
  context: "global",
});

const defaultSnapshot: GamepadRouterContextValue = {
  controllerActive: false,
  hintBarVisible: true,
  context: "global",
};

let cachedSnapshot: GamepadRouterContextValue = defaultSnapshot;

function subscribe(cb: () => void) {
  return gamepadRouter.subscribe(cb);
}

function getSnapshot(): GamepadRouterContextValue {
  const controllerActive = gamepadRouter.getControllerActive();
  const hintBarVisible = gamepadRouter.getHintBarVisible();
  const context = gamepadRouter.getContext();

  if (
    cachedSnapshot.controllerActive === controllerActive &&
    cachedSnapshot.hintBarVisible === hintBarVisible &&
    cachedSnapshot.context === context
  ) {
    return cachedSnapshot;
  }

  cachedSnapshot = { controllerActive, hintBarVisible, context };
  return cachedSnapshot;
}

function getServerSnapshot(): GamepadRouterContextValue {
  return defaultSnapshot;
}

export function GamepadRouterProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    gamepadRouter.start();
    return () => gamepadRouter.stop();
  }, []);

  return (
    <GamepadRouterContext.Provider value={state}>
      {children}
    </GamepadRouterContext.Provider>
  );
}

export function useGamepadRouterState() {
  return useContext(GamepadRouterContext);
}

export function useGamepadContext(ctx: InputContext) {
  useEffect(() => {
    gamepadRouter.setContext(ctx);
    return () => {
      gamepadRouter.setContext("global");
    };
  }, [ctx]);
}

export function useGamepadTabs(
  tabIds: string[],
  activeTab: string,
  onTabChange: (tabId: string) => void
) {
  // Keep the latest props in a ref so we register the handler exactly once per
  // mount (a stable stack position) rather than push/pop on every render.
  const latest = useRef({ tabIds, activeTab, onTabChange });
  latest.current = { tabIds, activeTab, onTabChange };

  const hasTabs = tabIds.length > 0;
  useEffect(() => {
    if (!hasTabs) return;
    return gamepadRouter.pushTabHandler({
      get tabIds() {
        return latest.current.tabIds;
      },
      get activeTab() {
        return latest.current.activeTab;
      },
      onTabChange: (id) => latest.current.onTabChange(id),
    });
  }, [hasTabs]);
}

export function useGamepadBackHandler(onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    return gamepadRouter.pushBackHandler(() => latest.current());
  }, []);
}

export function useGamepadContextAction(
  button: number,
  handler: (ctx: InputContext) => void
) {
  useEffect(() => {
    return gamepadRouter.onContextAction(button, handler);
  }, [button, handler]);
}

export { gamepadRouter };
