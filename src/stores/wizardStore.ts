import { create } from "zustand";

interface WizardState {
  step: number;
  gamePath: string;
  stagingPath: string;
  protonPrefixPath: string;
  profileName: string;
  modManager: string;
  f4seStatus: unknown;
  setStep: (step: number) => void;
  setGamePath: (path: string) => void;
  setStagingPath: (path: string) => void;
  setProtonPrefixPath: (path: string) => void;
  setProfileName: (name: string) => void;
  setModManager: (manager: string) => void;
  setF4seStatus: (status: unknown) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  step: 0,
  gamePath: "",
  stagingPath: "",
  protonPrefixPath: "",
  profileName: "Default",
  modManager: "direct",
  f4seStatus: null,
  setStep: (step) => set({ step }),
  setGamePath: (gamePath) => set({ gamePath }),
  setStagingPath: (stagingPath) => set({ stagingPath }),
  setProtonPrefixPath: (protonPrefixPath) => set({ protonPrefixPath }),
  setProfileName: (profileName) => set({ profileName }),
  setModManager: (modManager) => set({ modManager }),
  setF4seStatus: (f4seStatus) => set({ f4seStatus }),
  reset: () =>
    set({
      step: 0,
      gamePath: "",
      stagingPath: "",
      protonPrefixPath: "",
      profileName: "Default",
      modManager: "direct",
      f4seStatus: null,
    }),
}));
