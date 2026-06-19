import { create } from "zustand";
import type { NexusUser } from "@/lib/nexus/types";
import { api } from "@/lib/commands";

interface AuthState {
  user: NexusUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  setUser: (user: NexusUser | null) => void;
  initialize: () => Promise<void>;
  login: (key: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  initialized: false,

  setUser: (user) => set({ user }),

  initialize: async () => {
    set({ loading: true, error: null });
    try {
      const user = await api.loadStoredApiKey();
      set({ user, initialized: true, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        initialized: true,
        loading: false,
      });
    }
  },

  login: async (key) => {
    set({ loading: true, error: null });
    try {
      const user = await api.validateAndStoreApiKey(key);
      set({ user, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
      throw e;
    }
  },

  logout: async () => {
    await api.clearApiKey();
    set({ user: null });
  },
}));
