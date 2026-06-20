import { useState } from "react";
import { Download, Eye, GitCompare, Power } from "lucide-react";import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GP } from "@/lib/gamepad/buttons";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onAction: () => void;
  variant?: "default" | "danger";
}

export function useControllerContextMenu(actions: ContextMenuAction[], title?: string) {  const [open, setOpen] = useState(false);

  useGamepadContextAction(GP.Y, () => {
    if (actions.length > 0) setOpen(true);
  });

  const menu = (
    <AppDialog open={open} onOpenChange={setOpen} title={title ?? "Actions"}>
      <div className="flex flex-col gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.id}
              variant={action.variant === "danger" ? "outline" : "secondary"}
              className="min-h-[52px] w-full justify-start gap-3"
              data-focusable="true"
              onClick={() => {
                action.onAction();
                setOpen(false);
              }}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
              {action.label}
            </Button>
          );
        })}
      </div>
    </AppDialog>
  );

  return { open, setOpen, menu };
}

export const CONTEXT_MENU_ICONS = {
  download: Download,
  view: Eye,
  compare: GitCompare,
  toggle: Power,
  remove: Power,
};