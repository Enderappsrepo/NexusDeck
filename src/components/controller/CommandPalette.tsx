import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import type { ModSummary } from "@/lib/nexus/types";

const RECENT_SEARCHES_KEY = "nexusdeck_recent_searches";

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(q: string) {
  const recent = loadRecentSearches().filter((r) => r !== q);
  recent.unshift(q);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 8)));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const profiles = useGamesStore((s) => s.profiles);

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setQuery("");
      setResults([]);
      setRecent(loadRecentSearches());
    };
    window.addEventListener("nexusdeck-open-command-palette", handler);
    return () => window.removeEventListener("nexusdeck-open-command-palette", handler);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const search = useCallback(
    async (q: string) => {
      const domain = profiles[0]?.game_domain;
      if (!domain || !q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const result = await api.searchModsFiltered(domain, q.trim(), "endorsements", 0, 12, {
          category: null,
          min_endorsements: null,
          updated_since_days: null,
          hide_adult: true,
          tags: [],
        });
        setResults(result.mods);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [profiles]
  );

  useEffect(() => {
    if (!open || !query.trim()) return;
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, open, search]);

  const goToMod = (domain: string, modId: number, q?: string) => {
    if (q) saveRecentSearch(q);
    setOpen(false);
    navigate({
      to: "/games/$domain/mods/$modId",
      params: { domain, modId: String(modId) },
    });
  };

  const goToRoute = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  const domain = profiles[0]?.game_domain;

  return (
    <AppDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Find mods, pages, and actions"
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mods..."
            className="pl-12"
            data-focusable="true"
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0] && domain) {
                goToMod(domain, results[0].mod_id, query);
              }
            }}
          />
        </div>

        {!query.trim() && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--color-muted)]">Quick nav</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Home", to: "/" },
                { label: "Games", to: "/games" },
                { label: "Settings", to: "/settings" },
                ...(domain
                  ? [
                      { label: "Browse", to: `/games/${domain}/mods` },
                      { label: "Library", to: `/games/${domain}/library` },
                    ]
                  : []),
              ].map((item) => (
                <button
                  key={item.to}
                  type="button"
                  className="focusable min-h-[48px] rounded-xl bg-[var(--color-secondary)] px-4 text-sm font-medium"
                  data-focusable="true"
                  onClick={() => goToRoute(item.to)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <>
                <p className="text-sm font-medium text-[var(--color-muted)]">Recent searches</p>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="focusable min-h-[48px] rounded-xl bg-[var(--color-secondary)] px-4 text-sm"
                      data-focusable="true"
                      onClick={() => setQuery(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {loading && <p className="text-sm text-[var(--color-muted)]">Searching...</p>}

        {results.length > 0 && domain && (
          <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin" data-scroll-pane>
            {results.map((mod) => (
              <button
                key={mod.mod_id}
                type="button"
                className="focusable flex w-full min-h-[52px] items-center gap-3 rounded-xl bg-[var(--color-secondary)] px-4 text-left transition-colors hover:bg-[var(--color-card-hover)]"
                data-focusable="true"
                onClick={() => goToMod(domain, mod.mod_id, query)}
              >
                <span className="font-medium">{mod.name}</span>
                <span className="ml-auto text-xs text-[var(--color-muted)]">
                  {mod.author}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppDialog>
  );
}
