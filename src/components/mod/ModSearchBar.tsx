import { Search } from "lucide-react";
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
}

export function ModSearchBar({
  value,
  onChange,
  onSearch,
  loading = false,
  placeholder = "Search mods...",
  className,
}: ModSearchBarProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input
          placeholder={placeholder}
          className="h-14 border-2 pl-12 text-base shadow-[var(--shadow-sm)]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          data-focusable="true"
          data-mod-search
          autoComplete="off"
        />
      </div>
      <Button
        onClick={onSearch}
        disabled={loading}
        loading={loading}
        size="lg"
        className="sm:min-w-[140px]"
        data-focusable="true"
      >
        Search
      </Button>
    </div>
  );
}
