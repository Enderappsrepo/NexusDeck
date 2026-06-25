import { useState } from "react";

import { Gamepad2, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { AddToSteamDialog } from "@/components/steam/AddToSteamDialog";

import { useLaunchStore } from "@/stores/launchStore";

import type { NexusDeckSteamShortcutResult } from "@/lib/nexus/types";



interface AddToSteamPanelProps {

  compact?: boolean;

}



export function AddToSteamPanel({ compact = false }: AddToSteamPanelProps) {

  const { addToast } = useLaunchStore();

  const [name, setName] = useState("NexusDeck");

  const [dialogOpen, setDialogOpen] = useState(false);

  const [lastResult, setLastResult] = useState<string | null>(null);



  const onSuccess = (result: NexusDeckSteamShortcutResult) => {

    const detail = result.launch_options

      ? `${result.executable} ${result.launch_options}`

      : result.executable;

    setLastResult(detail);

    addToast(

      result.already_existed ? "Already in Steam" : "Added to Steam",

      result.already_existed

        ? `"${result.display_name}" is already in your library.`

        : `Open Steam and launch "${result.display_name}" from your library.`,

      result.already_existed ? "default" : "success"

    );

  };



  if (compact) {

    return (

      <>

        <Button

          onClick={() => setDialogOpen(true)}

          variant="secondary"

          data-focusable="true"

        >

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

            Add NexusDeck as a non-Steam game for Big Picture and Gaming Mode. NexusDeck will ask

            you to close Steam first, then adds the shortcut automatically when Steam exits.

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

          <Button onClick={() => setDialogOpen(true)}>

            <PlusCircle className="h-4 w-4" />

            Add NexusDeck to Steam

          </Button>

          {lastResult && (

            <p className="rounded-xl bg-[var(--color-secondary)] p-3 font-mono text-xs">

              {lastResult}

            </p>

          )}

          <p className="text-xs text-[var(--color-muted)]">

            A backup of shortcuts.vdf is created automatically. Use &quot;Quit Steam for me&quot; in

            the dialog if you prefer not to exit manually.

          </p>

          <p className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--color-foreground)]">

            <strong>Do not enable Proton</strong> on the NexusDeck Steam shortcut — NexusDeck is a

            native Linux app. Proton is only for games like Fallout 4. If NexusDeck won&apos;t open

            after turning Proton on, use Desktop Mode → right-click NexusDeck in Steam → Properties →

            Compatibility → turn Proton off.

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


