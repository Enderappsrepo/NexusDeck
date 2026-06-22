import { Link } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignInPromptProps {
  className?: string;
  compact?: boolean;
}

export function SignInPrompt({ className, compact = false }: SignInPromptProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4",
        className
      )}
      role="status"
    >
      <div className="flex min-w-0 items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
        <div className="min-w-0">
          <p className="font-semibold">Sign in to browse and download mods</p>
          {!compact && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Add your Nexus Mods personal API key in Settings. It is stored locally on this device.
            </p>
          )}
        </div>
      </div>
      <Button variant="secondary" size="sm" asChild data-focusable="true">
        <Link to="/settings">Open Settings</Link>
      </Button>
    </div>
  );
}
