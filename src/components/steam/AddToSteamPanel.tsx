import { useState } from "react";
import { Gamepad2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/commands";
import { useLaunchStore } from "@/stores/launchStore";

interface AddToSteamPanelProps {
  compact?: boolean;
}

export function AddToSteamPanel({ compact = false }: AddToSteamPanelProps) {
  const { addToast } = useLaunchStore();
  const [name, setName] = useState("NexusDeck");
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const addToSteam = async () => {
    setLoading(true);
    setLastResult(null);
    try {
      const result = await api.addNexusDeckToSteam(name.trim() || "NexusDeck");
      const detail = result.launch_options
        ? `${result.executable} ${result.launch_options}`
        : result.executable;
      setLastResult(detail);
      addToast(
        result.already_existed ? "Already in Steam" : "Added to Steam",
        result.already_existed
          ? `"${result.display_name}" is already in shortcuts.vdf. Restart Steam if you do not see it.`
          : `Restart Steam, then launch "${result.display_name}" from your library. Command: ${detail}`,
        result.already_existed ? "default" : "success"
      );
    } catch (e) {
      addToast(
        "Could not add to Steam",
        e instanceof Error ? e.message : String(e),
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <Button loading={loading} onClick={addToSteam} variant="secondary" data-focusable="true">
        <PlusCircle className="h-4 w-4" />
        Add to Steam
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-[var(--color-primary)]" />
          Steam launcher
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">
          Add NexusDeck as a non-Steam game so you can launch it from Steam Big Picture
          or Gaming Mode on Steam Deck. Uses{" "}
          <span className="font-mono text-xs">flatpak run com.nexusdeck.app</span> on the
          host — not the in-sandbox app path.
        </p>
        <div>
          <Label htmlFor="steam-app-name">Library name</Label>
          <Input
            id="steam-app-name"
            className="mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button loading={loading} onClick={addToSteam}>
          <PlusCircle className="h-4 w-4" />
          Add NexusDeck to Steam
        </Button>
        {lastResult && (
          <p className="rounded-xl bg-[var(--color-secondary)] p-3 font-mono text-xs">
            {lastResult}
          </p>
        )}
        <p className="text-xs text-[var(--color-muted)]">
          Fully quit Steam (not just suspend) and reopen it for the shortcut to appear. A
          backup of shortcuts.vdf is created automatically. If Play does nothing, remove
          any old NexusDeck shortcut and add again after updating.
        </p>
      </CardContent>
    </Card>
  );
}
