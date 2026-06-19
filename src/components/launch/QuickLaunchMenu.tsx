import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLaunchStore } from "@/stores/launchStore";

interface QuickLaunchMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  onSelect: (configId: string) => void;
}

export function QuickLaunchMenu({
  open,
  onOpenChange,
  profileId,
  onSelect,
}: QuickLaunchMenuProps) {
  const { configs, recentConfigs, loadConfigs } = useLaunchStore();

  const handleOpen = (next: boolean) => {
    if (next) loadConfigs(profileId);
    onOpenChange(next);
  };

  const displayConfigs =
    recentConfigs.length > 0
      ? recentConfigs
      : configs.slice(0, 5);

  return (
    <AppDialog open={open} onOpenChange={handleOpen} title="Quick Launch">
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Choose a saved launch preset. Recent configs appear first.
      </p>
      <div className="flex flex-col gap-2">
        {displayConfigs.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No launch presets yet.</p>
        ) : (
          displayConfigs.map((config) => (
            <Button
              key={config.id}
              variant="secondary"
              className="h-auto min-h-[56px] justify-between py-3"
              onClick={() => onSelect(config.id)}
              data-focusable="true"
            >
              <span className="text-left">
                <span className="block font-semibold">{config.name}</span>
                <span className="text-sm font-normal text-[var(--color-muted)]">
                  {config.use_f4se ? "F4SE" : "Vanilla"} · {config.launch_method}
                </span>
              </span>
              {config.is_default && <Badge>Default</Badge>}
            </Button>
          ))
        )}
      </div>
    </AppDialog>
  );
}
