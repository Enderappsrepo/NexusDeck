import { Link } from "@tanstack/react-router";
import { CheckCircle2, Gamepad2, Library, Search } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLaunchStore } from "@/stores/launchStore";
import type { Profile } from "@/lib/nexus/types";

interface InstallSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  modName: string;
}

export function InstallSuccessDialog({
  open,
  onOpenChange,
  profile,
  modName,
}: InstallSuccessDialogProps) {
  const launch = useLaunchStore((s) => s.launch);
  const launching = useLaunchStore((s) => s.launching);

  if (!profile) return null;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mod installed"
      description={`${modName} is ready in your library.`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-success)]/20">
          <CheckCircle2 className="h-6 w-6 text-[var(--color-success)]" />
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          View it in your library, launch the game to test, or keep browsing for more mods.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link to="/games/$domain/library" params={{ domain: profile.game_domain }}>
          <Button className="w-full sm:w-auto" data-focusable="true">
            <Library className="h-4 w-4" />
            View in library
          </Button>
        </Link>
        <Button
          variant="secondary"
          loading={launching}
          onClick={() => void launch(profile.id)}
          data-focusable="true"
        >
          <Gamepad2 className="h-4 w-4" />
          Launch game
        </Button>
        <Link
          to="/games/$domain/mods"
          params={{ domain: profile.game_domain }}
          search={{ modId: undefined }}
        >
          <Button variant="outline" className="w-full sm:w-auto" data-focusable="true">
            <Search className="h-4 w-4" />
            Browse more mods
          </Button>
        </Link>
      </div>
    </AppDialog>
  );
}
