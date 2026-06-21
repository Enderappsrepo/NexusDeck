import { useEffect, useState } from "react";
import { Shirt, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import type { BodySlideInfo } from "@/lib/nexus/types";

/**
 * BodySlide launcher. Detects a deployed BodySlide install and runs it through
 * the game's Proton prefix (one-click) so built body meshes land in Data.
 */
export function BodySlidePanel({ profileId }: { profileId: string }) {
  const [info, setInfo] = useState<BodySlideInfo | null>(null);
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setInfo(null);
    setMessage(null);
    setError(null);
    api
      .detectBodyslide(profileId)
      .then((res) => active && setInfo(res))
      .catch(() => active && setInfo({ installed: false }));
    return () => {
      active = false;
    };
  }, [profileId]);

  if (!info) return null;

  const launch = async () => {
    setLaunching(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await api.launchBodyslide(profileId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  };

  if (!info.installed) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-secondary)] text-[var(--color-muted)]">
          <Shirt className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">BodySlide</p>
          <p className="text-sm text-[var(--color-muted)]">
            Not detected. Install BodySlide and Outfit Studio as a mod and deploy it to
            build body meshes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
            <Shirt className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">BodySlide</h3>
              <Badge variant="success">Detected</Badge>
            </div>
            <p className="text-sm text-[var(--color-muted)]">
              Build body meshes from your presets — runs in this game's Proton prefix.
            </p>
          </div>
        </div>
        <Button onClick={launch} loading={launching} className="shrink-0">
          <Sparkles className="h-5 w-5" />
          Launch BodySlide
        </Button>
      </div>

      {(message || error) && (
        <div className="border-t border-[var(--color-border)] px-5 py-3 text-sm">
          {error ? (
            <p className="text-[var(--color-danger)]">{error}</p>
          ) : (
            <p className="text-[var(--color-muted)]">{message}</p>
          )}
        </div>
      )}
    </section>
  );
}
