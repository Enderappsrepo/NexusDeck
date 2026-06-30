import { useEffect, useState } from "react";
import {
  DEFAULT_FILTERS,
  MOD_SORT_OPTIONS,
  QUICK_PRESETS,
  type ModBrowseSort,
} from "../lib/modFilters";
import { fetchModCategories, isApiNotFoundError, type PairedDeck } from "../deckApi";
import type { ModCategory, ModSearchFilters } from "../types";
import { Sheet } from "./Sheet";

export function BrowseFilterSheet({
  open,
  paired,
  gameDomain,
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  onApply,
  onClose,
}: {
  open: boolean;
  paired: PairedDeck;
  gameDomain: string;
  filters: ModSearchFilters;
  sort: ModBrowseSort;
  onFiltersChange: (next: ModSearchFilters) => void;
  onSortChange: (sort: ModBrowseSort) => void;
  onApply: (next: { filters: ModSearchFilters; sort: ModBrowseSort }) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [draftSort, setDraftSort] = useState(sort);
  const [tagInput, setTagInput] = useState("");
  const [categories, setCategories] = useState<ModCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(filters);
    setDraftSort(sort);
    setTagInput("");
  }, [open, filters, sort]);

  useEffect(() => {
    if (!open || !paired || !gameDomain) return;
    let cancelled = false;
    setCategoriesLoading(true);
    setCategoriesError(null);
    void fetchModCategories(paired, gameDomain)
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setCategories([]);
          setCategoriesError(
            isApiNotFoundError(err)
              ? "Update NexusDeck on your device for category filters."
              : err instanceof Error
                ? err.message
                : String(err)
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, paired, gameDomain]);

  const update = (patch: Partial<ModSearchFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (draft.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput("");
      return;
    }
    update({ tags: [...draft.tags, trimmed] });
    setTagInput("");
  };

  const applyPreset = (patch: Partial<ModSearchFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const clearAll = () => {
    setDraft(DEFAULT_FILTERS);
    setDraftSort("downloads");
  };

  const handleApply = () => {
    onFiltersChange(draft);
    onSortChange(draftSort);
    onApply({ filters: draft, sort: draftSort });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Browse filters"
      title="Filters"
      headerActions={
        <button type="button" className="cc-btn-ghost text-xs" onClick={clearAll}>
          Clear all
        </button>
      }
      footer={
        <>
          <button type="button" className="cc-btn w-full" onClick={handleApply}>
            Apply filters
          </button>
          <button type="button" className="cc-btn-secondary w-full" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <p className="cc-panel-label">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="cc-chip"
                onClick={() => applyPreset(preset.patch)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="cc-panel-label">Sort by</p>
          <div className="flex flex-wrap gap-2">
            {MOD_SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`cc-chip ${draftSort === opt.value ? "cc-chip-active" : ""}`}
                onClick={() => setDraftSort(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="cc-panel-label">Category</p>
          {categoriesLoading && (
            <p className="text-xs text-[var(--cc-muted)]">Loading categories…</p>
          )}
          {categoriesError && (
            <p className="text-xs text-[var(--cc-muted)]">{categoriesError}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`cc-chip ${!draft.category ? "cc-chip-active" : ""}`}
              onClick={() => update({ category: null })}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={`${c.category_id}-${c.name}`}
                type="button"
                className={`cc-chip ${draft.category === c.name ? "cc-chip-active" : ""}`}
                onClick={() => update({ category: c.name })}
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="cc-panel-label">Tags</p>
          <div className="flex gap-2">
            <input
              className="cc-input min-w-0 flex-1"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <button type="button" className="cc-btn-secondary shrink-0 px-4" onClick={addTag}>
              Add
            </button>
          </div>
          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draft.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="cc-filter-chip"
                  onClick={() => update({ tags: draft.tags.filter((t) => t !== tag) })}
                >
                  <span>{tag}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <label className="block space-y-2">
            <span className="cc-panel-label">Author</span>
            <input
              className="cc-input"
              placeholder="Exact author name"
              value={draft.author ?? ""}
              onChange={(e) => update({ author: e.target.value.trim() || null })}
            />
          </label>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <label className="space-y-2">
            <span className="cc-panel-label">Min endorsements</span>
            <input
              className="cc-input"
              type="number"
              min={0}
              placeholder="Any"
              value={draft.min_endorsements ?? ""}
              onChange={(e) =>
                update({
                  min_endorsements: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label className="space-y-2">
            <span className="cc-panel-label">Updated within (days)</span>
            <input
              className="cc-input"
              type="number"
              min={0}
              placeholder="Any time"
              value={draft.updated_since_days ?? ""}
              onChange={(e) =>
                update({
                  updated_since_days: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
        </section>

        <label className="flex items-center gap-3 rounded-xl border border-[var(--cc-border-subtle)] px-4 py-3">
          <input
            type="checkbox"
            checked={draft.hide_adult}
            onChange={(e) => update({ hide_adult: e.target.checked })}
          />
          <span className="text-sm font-medium">Hide adult content</span>
        </label>
      </div>
    </Sheet>
  );
}
