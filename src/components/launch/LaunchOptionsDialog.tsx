import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OptionCard } from "@/components/mod/OptionCard";
import { useLaunchStore } from "@/stores/launchStore";
import { api } from "@/lib/commands";
import type { LaunchConfig } from "@/lib/nexus/types";
import { SteamShortcutDialog } from "./SteamShortcutDialog";

interface LaunchOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  gameDomain: string;
}

export function LaunchOptionsDialog({
  open,
  onOpenChange,
  profileId,
  gameDomain,
}: LaunchOptionsDialogProps) {
  const { configs, loadConfigs, launch, addToast } = useLaunchStore();
  const [selectedId, setSelectedId] = useState<string>("");
  const [argsText, setArgsText] = useState("");
  const [useF4se, setUseF4se] = useState(true);
  const [method, setMethod] = useState("steam");
  const [safeLaunch, setSafeLaunch] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadConfigs(profileId).then(() => {
        const list = useLaunchStore.getState().configs;
        const current = list.find((c) => c.is_default) ?? list[0];
        if (current) applyConfig(current);
      });
    }
  }, [open, profileId, loadConfigs]);

  const applyConfig = (config: LaunchConfig) => {
    setSelectedId(config.id);
    setUseF4se(config.use_f4se);
    setMethod(config.launch_method);
    try {
      const args: string[] = JSON.parse(config.args_json);
      setArgsText(args.join(" "));
    } catch {
      setArgsText("");
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const existing = configs.find((c) => c.id === selectedId);
      const args = argsText.trim() ? argsText.trim().split(/\s+/) : [];
      const config: LaunchConfig = {
        id: existing?.id ?? crypto.randomUUID(),
        profile_id: profileId,
        name: existing?.name ?? "Custom",
        use_f4se: useF4se,
        launch_method: method,
        custom_executable: existing?.custom_executable ?? null,
        args_json: JSON.stringify(args),
        pre_launch_actions_json: JSON.stringify(["sync_plugins"]),
        is_default: existing?.is_default ?? false,
        last_used_at: existing?.last_used_at ?? null,
        created_at: existing?.created_at ?? Math.floor(Date.now() / 1000),
      };
      await api.saveLaunchConfig(config);
      await loadConfigs(profileId);
      addToast("Saved", "Launch configuration updated.", "success");
    } finally {
      setSaving(false);
    }
  };

  const pickExecutable = async () => {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: "Executable", extensions: ["exe"] }],
    });
    if (typeof selected === "string" && selectedId) {
      const existing = configs.find((c) => c.id === selectedId);
      if (existing) {
        await api.saveLaunchConfig({
          ...existing,
          custom_executable: selected,
          launch_method: "custom",
        });
        setMethod("custom");
        await loadConfigs(profileId);
      }
    }
  };

  const handleLaunch = async () => {
    await saveConfig();
    onOpenChange(false);
    await launch(profileId, selectedId, {
      safe_launch: safeLaunch,
      sync_plugins: true,
    });
  };

  const batchLaunch = async () => {
    const results = await api.batchLaunchTools(profileId, ["game"]);
    addToast("Batch launch", results.join(", "), "default");
    onOpenChange(false);
  };

  return (
    <>
      <AppDialog open={open} onOpenChange={onOpenChange} title="Launch Options">
        <div className="space-y-5">
          <div>
            <Label>Preset</Label>
            <div className="mt-2 space-y-2">
              {configs.map((c) => (
                <OptionCard
                  key={c.id}
                  control="radio"
                  checked={selectedId === c.id}
                  onToggle={() => applyConfig(c)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="use-f4se">Use F4SE</Label>
            <Switch id="use-f4se" checked={useF4se} onCheckedChange={setUseF4se} />
          </div>

          <div>
            <Label>Launch method</Label>
            <select
              className="focusable mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              data-focusable="true"
            >
              <option value="steam">Steam (recommended)</option>
              <option value="direct">Direct executable</option>
              <option value="custom">Custom executable</option>
            </select>
          </div>

          <div>
            <Label htmlFor="launch-args">Command-line arguments</Label>
            <Input
              id="launch-args"
              className="mt-2"
              placeholder="-high"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="safe-launch">Safe Launch (backup plugins + saves)</Label>
            <Switch id="safe-launch" checked={safeLaunch} onCheckedChange={setSafeLaunch} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={pickExecutable} data-focusable="true">
              Pick executable
            </Button>
            <Button variant="outline" onClick={() => setShortcutOpen(true)} data-focusable="true">
              Steam shortcut
            </Button>
            {gameDomain === "fallout4" && (
              <Button variant="outline" onClick={batchLaunch} data-focusable="true">
                Batch: Game + tools
              </Button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={saving} onClick={saveConfig}>
              Save preset
            </Button>
            <Button loading={saving} onClick={handleLaunch}>
              Launch now
            </Button>
          </div>
        </div>
      </AppDialog>

      <SteamShortcutDialog
        open={shortcutOpen}
        onOpenChange={setShortcutOpen}
        profileId={profileId}
        configId={selectedId}
      />
    </>
  );
}
