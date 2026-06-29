import { create } from "zustand";
import type {
  ModCategory,
  ModSearchFilters,
  ModSummary,
} from "@/lib/nexus/types";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import { api } from "@/lib/commands";

interface ModsState {
  mods: ModSummary[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  query: string;
  sort: string;
  filters: ModSearchFilters;
  totalCount: number;
  categories: ModCategory[];
  categoriesLoading: boolean;
  hasMore: boolean;
  // Remembered browse position (coverflow index / grid page derive from this) so
  // returning from a mod's detail page lands back where you were.
  browseIndex: number;
  // Identifies the currently-loaded result set; lets search() skip a redundant
  // refetch on back-navigation (which would otherwise reset the list + position).
  lastKey: string | null;
  setQuery: (query: string) => void;
  setSort: (sort: string) => void;
  setFilters: (filters: ModSearchFilters) => void;
  setBrowseIndex: (index: number) => void;
  loadCategories: (domain: string) => Promise<void>;
  search: (domain: string) => Promise<void>;
  loadMore: (domain: string) => Promise<void>;
}

function searchKey(
  domain: string,
  query: string,
  sort: string,
  filters: ModSearchFilters
): string {
  return `${domain}|${query}|${sort}|${JSON.stringify(filters)}`;
}

const MODS_PAGE_SIZE = 48;

export const useModsStore = create<ModsState>((set, get) => ({
  mods: [],
  loading: false,
  loadingMore: false,
  error: null,
  query: "",
  sort: "endorsements",
  filters: { ...DEFAULT_FILTERS },
  totalCount: 0,
  categories: [],
  categoriesLoading: false,
  hasMore: false,
  browseIndex: 0,
  lastKey: null,

  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setFilters: (filters) => set({ filters }),
  setBrowseIndex: (browseIndex) => set({ browseIndex }),

  loadCategories: async (domain) => {
    set({ categoriesLoading: true });
    try {
      const categories = await api.listModCategories(domain);
      set({ categories, categoriesLoading: false });
    } catch (e) {
      console.error("[NexusDeck] Failed to load mod categories:", e);
      set({ categories: [], categoriesLoading: false });
    }
  },

  search: async (domain) => {
    const { query, sort, filters, mods, lastKey } = get();
    const key = searchKey(domain, query, sort, filters);
    // Same query as what's already loaded (e.g. returning from a mod page) —
    // keep the results and the remembered position instead of refetching.
    if (key === lastKey && mods.length > 0) return;

    set({ loading: true, error: null, browseIndex: 0, mods: [], hasMore: false });
    try {
      const result = await api.searchModsFiltered(
        domain,
        query,
        sort,
        0,
        MODS_PAGE_SIZE,
        filters
      );
      set({
        mods: result.mods,
        totalCount: result.total_count,
        loading: false,
        error: null,
        hasMore: result.mods.length >= MODS_PAGE_SIZE,
        lastKey: key,
      });
    } catch (e) {
      set({
        loading: false,
        mods: [],
        hasMore: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  loadMore: async (domain) => {
    const { loading, loadingMore, mods, query, sort, filters, hasMore } = get();
    if (loading || loadingMore || !hasMore) return;

    set({ loadingMore: true, error: null });
    try {
      const result = await api.searchModsFiltered(
        domain,
        query,
        sort,
        mods.length,
        MODS_PAGE_SIZE,
        filters
      );
      set({
        mods: [...mods, ...result.mods],
        totalCount: result.total_count,
        loadingMore: false,
        hasMore: result.mods.length >= MODS_PAGE_SIZE,
      });
    } catch (e) {
      set({
        loadingMore: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));
