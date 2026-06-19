import { create } from "zustand";
import type { Profile } from "@/lib/nexus/types";
import { api } from "@/lib/commands";

interface GamesState {
  profiles: Profile[];
  loading: boolean;
  loadProfiles: () => Promise<void>;
  getProfile: (domain: string) => Profile | undefined;
}

export const useGamesStore = create<GamesState>((set, get) => ({
  profiles: [],
  loading: false,

  loadProfiles: async () => {
    set({ loading: true });
    const profiles = await api.listProfiles();
    set({ profiles, loading: false });
  },

  getProfile: (domain) =>
    get().profiles.find((p) => p.game_domain === domain),
}));
