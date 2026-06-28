import { useState } from "react";

import { Gamepad2, PlusCircle, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { AddToSteamDialog } from "@/components/steam/AddToSteamDialog";

import { useLaunchStore } from "@/stores/launchStore";

import { api } from "@/lib/commands";

import type { NexusDeckSteamShortcutResult } from "@/lib/nexus/types";

interface AddToSteamPanelProps {
  compact?: boolean;
}

export function AddToSteamPanel({ compact = false }: AddToSteamPanelProps) {
  const { addToast } = useLaunchStore();
  const [name, setName] = useState("NexusDeck");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [installingInput, setInstallingInput] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const onSuccess = (result: NexusDeckSteamShortcutResult) => {
    const detail = result.launch_options
      ? `${result.executable} ${result.launch_options}`
      : result.executable;
    setLastResult(detail);
    const steamInputNote =
      result.steam_input?.installed === true
        ? ` ${result.steam_input.message}`
        : result.steam_input?.message
          ? ` (${result.steam_input.message})`
          : "";

    addToast(
      result.already_existed ? "Already in Steam" : "Added to Steam",
      (result.already_existed
        ? `"${result.display_name}" is already in your library.`
        : `Open Steam and launch "${result.display_name}" from your library. Restart Steam if the shortcut does not appear.`) +
        steamInputNote,
      result.already_existed ? "default" : "success"
    );
  };

  const installControllerTemplate = async () => {
    setInstallingInput(true);
    try {
      const result = await api.installNexusDeckSteamInputLayout(name.trim() || "NexusDeck");
      addToast(
        result.installed ? "Controller template installed" : "Steam Input",
        result.message,
        result.installed ? "success" : "default"
      );
    } catch (e) {
      addToast("Install failed", e instanceof Error ? e.message : String(e), "danger");
    } finally {
      setInstallingInput(false);
    }
  };

  const repairShortcuts = async () => {
    setRepairing(true);
    try {
      const result = await api.repairSteamShortcuts();
      addToast(
        result.success ? "Shortcuts repaired" : "Repair shortcuts",
        result.message,
        result.success ? "success" : "default"
      );
    } catch (e) {
      addToast("Repair failed", e instanceof Error ? e.message : String(e), "danger");
    } finally {
      setRepairing(false);
    }
  };

  if (compact) {
    return (
      <>
        <Button onClick={() => setDialogOpen(true)} variant="secondary" data-focusable="true">
          <PlusCircle className="h-4 w-4" />
          Add to Steam
        </Button>
        <AddToSteamDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          displayName={name}
          onSuccess={onSuccess}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-[var(--color-primary)]" />
            Steam launcher
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            Add NexusDeck as a non-Steam game for Big Picture and Gaming Mode. NexusDeck closes
            Steam first, writes a safe binary shortcut, and installs the pass-through controller
            template (like EmuDeck).
          </p>

          <div>
            <Label htmlFor="steam-app-name">Library name</Label>
            <Input
              id="steam-app-name"
              className="mt-2 min-h-[48px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-focusable="true"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button onClick={() => setDialogOpen(true)} className="min-h-[48px]" data-focusable="true">
              <PlusCircle className="h-4 w-4" />
              Add NexusDeck to Steam
            </Button>
            <Button
              variant="secondary"
              className="min-h-[48px]"
              loading={installingInput}
              disabled={installingInput}
              onClick={() => void installControllerTemplate()}
              data-focusable="true"
            >
              <Gamepad2 className="h-4 w-4" />
              Install controller template
            </Button>
            <Button
              variant="outline"
              className="min-h-[48px]"
              loading={repairing}
              disabled={repairing}
              onClick={() => void repairShortcuts()}
              data-focusable="true"
            >
              <Wrench className="h-4 w-4" />
              Repair shortcuts
            </Button>
          </div>

          {lastResult && (
            <p className="rounded-xl bg-[var(--color-secondary)] p-3 font-mono text-xs">{lastResult}</p>
          )}

          <p className="text-xs text-[var(--color-muted)]">
            Shortcuts are written in Steam&apos;s binary VDF format with an automatic backup. Quit
            Steam completely before adding or repairing. After adding, restart Steam and pick the
            <strong> NexusDeck</strong> layout under Controller settings in Gaming Mode.
          </p>

          <p className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--color-foreground)]">
            <strong>Do not enable Proton</strong> on the NexusDeck Steam shortcut — NexusDeck is a
            native Linux app. Proton is only for games like Fallout 4.
          </p>
        </CardContent>
      </Card>

      <AddToSteamDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        displayName={name}
        onSuccess={onSuccess}
      />
    </>
  );
}
