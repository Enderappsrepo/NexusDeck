import { create } from "zustand";
import type { DependencyGraph } from "@/lib/nexus/types";
import { api } from "@/lib/commands";
import { getUserMessage, logApiError } from "@/lib/apiError";

interface DepsState {
  graph: DependencyGraph | null;
  loading: boolean;
  queueing: boolean;
  error: string | null;
  resolve: (profileId: string, modId: number) => Promise<void>;
  queueMissing: (profileId: string, modId: number) => Promise<string[]>;
  reset: () => void;
}

export const useDepsStore = create<DepsState>((set) => ({
  graph: null,
  loading: false,
  queueing: false,
  error: null,

  resolve: async (profileId, modId) => {
    set({ loading: true, error: null });
    try {
      const graph = await api.resolveModDependencies(profileId, modId);
      set({ graph, loading: false });
    } catch (e) {
      logApiError("dependencies", e);
      set({
        loading: false,
        error: getUserMessage("dependencies", e).userMessage,
      });
    }
  },

  queueMissing: async (profileId, modId) => {
    set({ queueing: true, error: null });
    try {
      const queued = await api.queueMissingDependencies(profileId, modId);
      const graph = await api.resolveModDependencies(profileId, modId);
      set({ graph, queueing: false });
      return queued;
    } catch (e) {
      logApiError("dependencies", e);
      set({
        queueing: false,
        error: getUserMessage("dependencies", e).userMessage,
      });
      return [];
    }
  },

  reset: () => set({ graph: null, loading: false, queueing: false, error: null }),
}));
