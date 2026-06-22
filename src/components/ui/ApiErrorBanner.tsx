import { AlertCircle, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { getUserMessage, logApiError, REPORT_ISSUE_URL, type ApiErrorContext } from "@/lib/apiError";

interface ApiErrorBannerProps {
  context: ApiErrorContext;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ApiErrorBanner({ context, error, onRetry, className = "" }: ApiErrorBannerProps) {
  const parsed = getUserMessage(context, error);
  logApiError(context, parsed.raw);
  const needsSignIn =
    !parsed.retryable ||
    parsed.userMessage.toLowerCase().includes("api key") ||
    parsed.raw.toLowerCase().includes("invalid api key");

  return (
    <div
      className={`rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-5 ${className}`}
      role="alert"
    >
      <div className="flex gap-4">
        <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-danger)]" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-semibold text-[var(--color-foreground)]">{parsed.title}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{parsed.userMessage}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {needsSignIn && (
              <Button size="sm" asChild data-focusable="true">
                <Link to="/settings">Open Settings</Link>
              </Button>
            )}
            {onRetry && parsed.retryable && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => openUrl(REPORT_ISSUE_URL).catch(() => undefined)}
            >
              Report issue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
