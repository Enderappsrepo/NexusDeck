import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { api } from "@/lib/commands";
import { getUserMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type {
  GameSettingDefinition,
  GameSettingsPreset,
  GameSettingsSchema,
} from "@/lib/nexus/types";

interface GameSettingsPanelProps {
  profileId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  display: "Display",
  graphics: "Graphics",
  performance: "Performance",
};

export function GameSettingsPanel({ profileId }: GameSettingsPanelProps) {
  const [schema, setSchema] = useState<GameSettingsSchema | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setSavedMessage(null);
    try {
      const [nextSchema, nextValues] = await Promise.all([
        api.getGameSettingsSchema(profileId),
        api.getGameSettingsValues(profileId),
      ]);
      setSchema(nextSchema);
      setValues(nextValues.values);
    } catch (e) {
      setError(e);
      setSchema(null);
      setValues({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [profileId]);

  const grouped = useMemo(() => {
    if (!schema) return [];
    const map = new Map<string, GameSettingDefinition[]>();
    for (const setting of schema.settings) {
      const list = map.get(setting.category) ?? [];
      list.push(setting);
      map.set(setting.category, list);
    }
    return Array.from(map.entries());
  }, [schema]);

  const applyPreset = async (preset: GameSettingsPreset) => {
    setApplyingPreset(preset.id);
    setError(null);
    setSavedMessage(null);
    try {
      await api.applyGameSettingsPreset(profileId, preset.id);
      const refreshed = await api.getGameSettingsValues(profileId);
      setValues(refreshed.values);
      setSavedMessage(`Applied ${preset.label} preset.`);
    } catch (e) {
      setError(e);
    } finally {
      setApplyingPreset(null);
    }
  };

  const saveChanges = async () => {
    if (!schema) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      await api.applyGameSettings(profileId, values);
      setSavedMessage("Settings saved.");
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const setValue = (id: string, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--color-muted)]">Loading game settings…</p>
    );
  }

  if (error && !schema) {
    return (
      <ApiErrorBanner
        context="generic"
        error={getUserMessage("generic", error).userMessage}
        onRetry={load}
      />
    );
  }

  if (!schema) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          INI files · <span className="font-mono text-xs">{schema.config_dir}</span>
        </p>
        <Button loading={saving} onClick={saveChanges} size="sm" data-focusable="true">
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>

      {error && (
        <ApiErrorBanner
          context="generic"
          error={getUserMessage("generic", error).userMessage}
          onRetry={load}
        />
      )}

      {savedMessage && (
        <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-3 py-2 text-sm">
          {savedMessage}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {schema.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset)}
            disabled={applyingPreset !== null}
            title={preset.description}
            className="focusable rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--color-primary)]/40"
            data-focusable="true"
          >
            {applyingPreset === preset.id ? "Applying…" : preset.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
        {grouped.map(([category, settings], index) => (
          <div
            key={category}
            className={cn(index > 0 && "mt-5 border-t border-[var(--color-border)] pt-5")}
          >
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div
              className={cn(
                category === "graphics"
                  ? "grid gap-3 sm:grid-cols-2"
                  : category === "display"
                    ? "grid gap-3 sm:grid-cols-2"
                    : "space-y-3"
              )}
            >
              {settings.map((setting) => (
                <SettingField
                  key={setting.id}
                  setting={setting}
                  value={values[setting.id] ?? ""}
                  onChange={(value) => setValue(setting.id, value)}
                  compact
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingField({
  setting,
  value,
  onChange,
  compact = false,
}: {
  setting: GameSettingDefinition;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  if (setting.kind === "bool") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5">
        <Label className="text-sm">{setting.label}</Label>
        <Switch
          checked={value === "1"}
          onCheckedChange={(checked) => onChange(checked ? "1" : "0")}
        />
      </div>
    );
  }

  if (setting.kind === "choice" && setting.options) {
    return (
      <div className={compact ? "" : "sm:col-span-2"}>
        <Label htmlFor={setting.id} className="text-sm">
          {setting.label}
        </Label>
        <select
          id={setting.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="focusable mt-1.5 h-11 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 text-sm"
          data-focusable="true"
        >
          {setting.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={setting.id} className="text-sm">
        {setting.label}
      </Label>
      <Input
        id={setting.id}
        className="mt-1.5 h-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={setting.kind === "int" ? "numeric" : "decimal"}
      />
    </div>
  );
}
