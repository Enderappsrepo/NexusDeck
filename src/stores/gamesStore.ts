import { useEffect } from "react";
import { create } from "zustand";
import type { Profile } from "@/lib/nexus/types";
import { api } from "@/lib/commands";

interface GamesState {
  profiles: Profile[];
  loading: boolean;
  loadProfiles: () => Promise<void>;
  getProfile: (domain: string) => Profile | undefined;
}

let loadProfilesRequest = 0;

export const useGamesStore = create<GamesState>((set, get) => ({
  profiles: [],
  loading: false,

  loadProfiles: async () => {
    const requestId = ++loadProfilesRequest;
    set((state) => ({ loading: true, profiles: state.profiles }));
    try {
      const profiles = await api.listProfiles();
      if (requestId !== loadProfilesRequest) return;
      set({ profiles, loading: false });
    } catch {
      if (requestId !== loadProfilesRequest) return;
      set((state) => ({ loading: false, profiles: state.profiles }));
    }
  },

  getProfile: (domain) =>
    get().profiles.find((p) => p.game_domain === domain),
}));

/** Subscribe to the profile for a game domain and refresh the list on mount. */
export function useProfile(domain: string | undefined) {
  const profile = useGamesStore((s) =>
    domain ? s.profiles.find((p) => p.game_domain === domain) : undefined
  );
  const profilesLoading = useGamesStore((s) => s.loading);
  const loadProfiles = useGamesStore((s) => s.loadProfiles);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  return { profile, profilesLoading };
}
