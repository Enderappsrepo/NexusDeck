import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
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
  useEffect(() => {
    gamepadRouter.setTabHandler({ tabIds, activeTab, onTabChange });
    return () => gamepadRouter.setTabHandler(null);
  }, [tabIds, activeTab, onTabChange]);
}

export function useGamepadBackHandler(onBack: () => void) {
  useEffect(() => {
    gamepadRouter.setBackHandler(onBack);
    return () => gamepadRouter.setBackHandler(null);
  }, [onBack]);
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
