import { create } from "zustand";

/**
 * Cross-cutting UI locks. `installBusy` is set while a mod install is actively
 * extracting/deploying so dialogs become non-dismissible and the global Back
 * paths (Back button, gamepad B, Esc/Backspace) refuse to navigate away — you
 * can't accidentally tap out of an install in progress.
 */
interface UiLockState {
  installBusy: boolean;
  setInstallBusy: (busy: boolean) => void;
}

export const useUiLockStore = create<UiLockState>((set) => ({
  installBusy: false,
  setInstallBusy: (installBusy) => set({ installBusy }),
}));
