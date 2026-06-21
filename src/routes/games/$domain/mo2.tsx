import { createFileRoute, Link } from "@tanstack/react-router";
import { Mo2SetupWizard } from "@/components/mo2/Mo2SetupWizard";
import { useGamesStore } from "@/stores";
import { isSupportedDomain } from "@/lib/games";
import { resolveGameDomain, usePathname } from "@/lib/routeParams";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/$domain/mo2")({
  component: Mo2Page,
});

function Mo2Page() {
  const pathname = usePathname();
  const domain = resolveGameDomain(Route.useParams().domain, pathname);
  const profile = useGamesStore((s) => s.getProfile(domain));

  if (!domain || !isSupportedDomain(domain)) {
    return <p className="p-8">Unsupported game.</p>;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="mb-4 text-[var(--color-muted)]">Set up your game profile first.</p>
        <Link to="/games/$domain/setup" params={{ domain }}>
          <Button>Setup wizard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4" data-scroll-pane>
      <h1 className="text-3xl font-bold">Mod Organizer 2</h1>
      <Mo2SetupWizard profileId={profile.id} />
      <Link to="/games/$domain/troubleshoot" params={{ domain }}>
        <Button variant="outline" data-focusable="true">
          Back to troubleshoot
        </Button>
      </Link>
    </div>
  );
}
