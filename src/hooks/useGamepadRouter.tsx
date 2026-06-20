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

function subscribe(cb: () => void) {
  return gamepadRouter.subscribe(cb);
}

function getSnapshot() {
  return {
    controllerActive: gamepadRouter.getControllerActive(),
    hintBarVisible: gamepadRouter.getHintBarVisible(),
    context: gamepadRouter.getContext(),
  };
}

export function GamepadRouterProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
