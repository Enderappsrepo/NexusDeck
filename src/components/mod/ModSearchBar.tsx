import { useEffect, useRef } from "react";
import { ChevronUp, Mic, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  loading?: boolean;
  placeholder?: string;
  className?: string;
  /** Slightly shorter on Deck / narrow layouts */
  compact?: boolean;
  /** Collapse to a single chip row (Deck / narrow) */
  collapsible?: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

export function ModSearchBar({
  value,
  onChange,
  onSearch,
  loading = false,
  placeholder = "Search mods...",
  className,
  compact = false,
  collapsible = false,
  collapsed = false,
  onExpand,
  onCollapse,
}: ModSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!collapsed && collapsible) {
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [collapsed, collapsible]);

  const expand = () => onExpand?.();

  if (collapsible && collapsed) {
    const label = value.trim() || placeholder;
    return (
      <button
        type="button"
        className={cn(
          "focusable flex w-full items-center gap-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-4 text-left shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-primary)]/40",
          compact ? "h-12" : "h-14",
          className
        )}
        onClick={expand}
        onFocus={expand}
        data-focusable="true"
        data-mod-search
        data-touch-target="true"
        aria-label={value.trim() ? `Search: ${value.trim()}. Activate to edit.` : "Open search"}
      >
        <Search className="h-5 w-5 shrink-0 text-[var(--color-cyan)]" aria-hidden="true" />
        <span className={cn("min-w-0 flex-1 truncate text-base", !value.trim() && "text-[var(--color-muted)]")}>
          {label}
        </span>
        {value.trim() && (
          <span className="shrink-0 rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
            Active
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:gap-3", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-cyan)] sm:left-4" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          className={cn(
            "border-2 pl-10 pr-10 text-base shadow-[var(--shadow-sm)] sm:pl-12 sm:pr-12",
            compact ? "h-12" : "h-14",
            collapsible && "pr-16 sm:pr-16"
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          data-focusable="true"
          data-mod-search
          autoComplete="off"
        />
        {collapsible ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-11 w-11 min-h-[44px] min-w-[44px] -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            onClick={onCollapse}
            aria-label="Collapse search"
            data-focusable="true"
          >
            <ChevronUp className="h-5 w-5" />
          </Button>
        ) : (
          <Mic
            className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-cyan)]/80"
            aria-hidden="true"
          />
        )}
        {collapsible && value.trim() && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-10 top-1/2 hidden h-9 w-9 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-foreground)] sm:inline-flex"
            onClick={() => onChange("")}
            aria-label="Clear search"
            data-focusable="true"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Button
        onClick={onSearch}
        disabled={loading}
        loading={loading}
        size={compact ? "default" : "lg"}
        className="sm:min-w-[140px]"
        data-focusable="true"
      >
        Search
      </Button>
    </div>
  );
}
