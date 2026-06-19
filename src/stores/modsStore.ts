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
  setQuery: (query: string) => void;
  setSort: (sort: string) => void;
  setFilters: (filters: ModSearchFilters) => void;
  loadCategories: (domain: string) => Promise<void>;
  search: (domain: string) => Promise<void>;
  loadMore: (domain: string) => Promise<void>;
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

  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setFilters: (filters) => set({ filters }),

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
    set({ loading: true, error: null });
    try {
      const { query, sort, filters } = get();
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
      });
    } catch (e) {
      set({
        loading: false,
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
