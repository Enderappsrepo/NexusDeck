import { Link } from "@tanstack/react-router";
import { Sparkles, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostSetupBannerProps {
  domain: string;
  gameName: string;
  showDeckFix?: boolean;
  onDismiss: () => void;
}

export function PostSetupBanner({
  domain,
  gameName,
  showDeckFix = false,
  onDismiss,
}: PostSetupBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-primary)]/30 bg-[image:var(--gradient-primary)] p-6 text-white">
      <button
        type="button"
        onClick={onDismiss}
        className="focusable absolute right-3 top-3 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label="Dismiss"
        data-focusable="true"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4 pr-10">
        <div className="max-w-xl">
          <p className="text-sm font-medium uppercase tracking-wide text-white/80">
            Setup complete
          </p>
          <h2 className="mt-1 text-2xl font-bold">{gameName} is ready</h2>
          <p className="mt-2 text-sm text-white/85">
            Browse mods, download your first one, and NexusDeck will walk you through install.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/games/$domain/mods" params={{ domain }} search={{ modId: undefined }}>
            <Button variant="secondary" className="bg-white text-[var(--color-primary)]" data-focusable="true">
              <Sparkles className="h-4 w-4" />
              Browse mods
            </Button>
          </Link>
          {showDeckFix && (
            <Link to="/games/$domain/troubleshoot" params={{ domain }}>
              <Button variant="outline" className="border-white/30 text-white hover:bg-white/10" data-focusable="true">
                <Wrench className="h-4 w-4" />
                Run DeckModFix
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
