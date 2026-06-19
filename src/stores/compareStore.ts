import { create } from "zustand";
import type { ModCompareResult } from "@/lib/nexus/types";
import { api } from "@/lib/commands";

interface CompareState {
  result: ModCompareResult | null;
  loading: boolean;
  error: string | null;
  compareInstalled: (profileId: string, modAId: string, modBId: string) => Promise<void>;
  compareStaging: (profileId: string, archiveA: string, archiveB: string) => Promise<void>;
  compareWithInstalled: (
    profileId: string,
    stagingArchive: string,
    installedModId: string
  ) => Promise<void>;
  reset: () => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  result: null,
  loading: false,
  error: null,

  compareInstalled: async (profileId, modAId, modBId) => {
    set({ loading: true, error: null });
    try {
      const result = await api.compareInstalledMods(profileId, modAId, modBId);
      set({ result, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  compareStaging: async (profileId, archiveA, archiveB) => {
    set({ loading: true, error: null });
    try {
      const result = await api.compareStagingArchives(profileId, archiveA, archiveB);
      set({ result, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  compareWithInstalled: async (profileId, stagingArchive, installedModId) => {
    set({ loading: true, error: null });
    try {
      const result = await api.compareModWithInstalled(
        profileId,
        stagingArchive,
        installedModId
      );
      set({ result, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  reset: () => set({ result: null, loading: false, error: null }),
}));
