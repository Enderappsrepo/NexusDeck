import type { ModSearchFilters } from "@/lib/nexus/types";

export const DEFAULT_FILTERS: ModSearchFilters = {
  category: null,
  tags: [],
  min_endorsements: null,
  hide_adult: false,
  updated_since_days: null,
};
