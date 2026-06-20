import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Gamepad2,
  Gauge,
  Gem,
  Monitor,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { api } from "@/lib/commands";
import { getUserMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type {
  GameSettingDefinition,
  GameSettingRange,
  GameSettingsPreset,
  GameSettingsSchema,
} from "@/lib/nexus/types";

interface GameSettingsPanelProps {
  profileId: string;
}

const CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
  display: { label: "Display", icon: Monitor },
  graphics: { label: "Graphics", icon: Sparkles },
  performance: { label: "Performance", icon: Gauge },
};

const PRESET_ICONS: Record<string, LucideIcon> = {
  deck: Gamepad2,
  performance: Zap,
  balanced: SlidersHorizontal,
  quality: Gem,
};

export function GameSettingsPanel({ profileId }: GameSettingsPanelProps) {
  const [schema, setSchema] = useState<GameSettingsSchema | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
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
      setSavedValues(nextValues.values);
      setActivePreset(null);
    } catch (e) {
      setError(e);
      setSchema(null);
      setValues({});
      setSavedValues({});
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

  const dirtyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const key of Object.keys(values)) {
      if (values[key] !== savedValues[key]) ids.add(key);
    }
    return ids;
  }, [values, savedValues]);
  const dirtyCount = dirtyIds.size;

  const applyPreset = async (preset: GameSettingsPreset) => {
    setApplyingPreset(preset.id);
    setError(null);
    setSavedMessage(null);
    try {
      await api.applyGameSettingsPreset(profileId, preset.id);
      const refreshed = await api.getGameSettingsValues(profileId);
      setValues(refreshed.values);
      setSavedValues(refreshed.values);
      setActivePreset(preset.id);
      setSavedMessage(`Applied the ${preset.label} preset.`);
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
      setSavedValues(values);
      setSavedMessage("Settings saved.");
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const setValue = (id: string, value: string) => {
    setActivePreset(null);
    setSavedMessage(null);
    setValues((current) => ({ ...current, [id]: value }));
  };

  const resetChanges = () => {
    setValues(savedValues);
    setSavedMessage(null);
  };

  if (loading) {
    return <p className="text-sm text-[var(--color-muted)]">Loading game settings…</p>;
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
    <div className="space-y-5">
      <p className="text-sm text-[var(--color-muted)]">
        INI files · <span className="font-mono text-xs">{schema.config_dir}</span>
      </p>

      {!!error && (
        <ApiErrorBanner
          context="generic"
          error={getUserMessage("generic", error).userMessage}
          onRetry={load}
        />
      )}

      {/* Presets */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Presets
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {schema.presets.map((preset) => {
            const Icon = PRESET_ICONS[preset.id] ?? SlidersHorizontal;
            const active = activePreset === preset.id;
            const applying = applyingPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                disabled={applyingPreset !== null}
                aria-pressed={active}
                title={preset.description}
                className={cn(
                  "focusable flex flex-col items-start gap-1 rounded-xl border-2 p-3.5 text-left transition-all disabled:opacity-60",
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-card-hover)]"
                )}
                data-focusable="true"
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      active
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[var(--color-primary)]/12 text-[var(--color-primary)]"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {applying ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent motion-reduce:animate-none" />
                  ) : active ? (
                    <Badge variant="default">Active</Badge>
                  ) : null}
                </div>
                <span className="mt-1.5 font-semibold">{preset.label}</span>
                <span className="text-xs leading-relaxed text-[var(--color-muted)]">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Categories */}
      <div className="space-y-4">
        {grouped.map(([category, settings]) => {
          const meta = CATEGORY_META[category] ?? { label: category, icon: SlidersHorizontal };
          const CatIcon = meta.icon;
          return (
            <section key={category} className="surface-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
                  <CatIcon className="h-4.5 w-4.5" />
                </div>
                <h3 className="text-base font-bold">{meta.label}</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {settings.map((setting) => (
                  <SettingField
                    key={setting.id}
                    setting={setting}
                    value={values[setting.id] ?? ""}
                    dirty={dirtyIds.has(setting.id)}
                    onChange={(value) => setValue(setting.id, value)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 z-10">
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-[var(--color-surface-2)] px-4 py-3 shadow-[var(--shadow-lg)]",
            dirtyCount > 0 ? "border-[var(--color-primary)]/40" : "border-[var(--color-border)]"
          )}
        >
          <div className="flex items-center gap-2 text-sm">
            {dirtyCount > 0 ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                <span className="font-medium">
                  {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
                </span>
              </>
            ) : savedMessage ? (
              <span className="text-[var(--color-success)]">{savedMessage}</span>
            ) : (
              <span className="text-[var(--color-muted)]">All changes saved</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetChanges}
              disabled={dirtyCount === 0 || saving}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button size="sm" loading={saving} disabled={dirtyCount === 0} onClick={saveChanges}>
              <Save className="h-4 w-4" />
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({
  id,
  label,
  dirty,
}: {
  id?: string;
  label: string;
  dirty: boolean;
}) {
  return (
    <Label htmlFor={id} className="flex items-center gap-1.5 text-sm">
      {label}
      {dirty && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
          aria-label="unsaved"
        />
      )}
    </Label>
  );
}

function SettingField({
  setting,
  value,
  dirty,
  onChange,
}: {
  setting: GameSettingDefinition;
  value: string;
  dirty: boolean;
  onChange: (value: string) => void;
}) {
  if (setting.kind === "bool") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5">
        <div className="min-w-0">
          <Label className="text-sm">{setting.label}</Label>
          {setting.description && (
            <p className="truncate text-xs text-[var(--color-muted)]">{setting.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />}
          <Switch
            checked={value === "1"}
            onCheckedChange={(checked) => onChange(checked ? "1" : "0")}
          />
        </div>
      </div>
    );
  }

  if (setting.range) {
    return (
      <SliderField setting={setting} range={setting.range} value={value} dirty={dirty} onChange={onChange} />
    );
  }

  if (setting.kind === "choice" && setting.options) {
    return (
      <div className="sm:col-span-2">
        <FieldLabel id={setting.id} label={setting.label} dirty={dirty} />
        <select
          id={setting.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="focusable mt-2 h-11 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 text-sm transition-colors hover:border-[var(--color-primary)]/40"
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
      <FieldLabel id={setting.id} label={setting.label} dirty={dirty} />
      <Input
        id={setting.id}
        className="mt-2 h-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={setting.kind === "int" ? "numeric" : "decimal"}
      />
    </div>
  );
}

function SliderField({
  setting,
  range,
  value,
  dirty,
  onChange,
}: {
  setting: GameSettingDefinition;
  range: GameSettingRange;
  value: string;
  dirty: boolean;
  onChange: (value: string) => void;
}) {
  const parsed = Number(value);
  const num = Number.isFinite(parsed) ? parsed : range.min;
  const clamped = Math.min(range.max, Math.max(range.min, num));
  const pct =
    range.max > range.min ? ((clamped - range.min) / (range.max - range.min)) * 100 : 0;
  const unit = range.unit ? ` ${range.unit}` : "";

  return (
    <div className="rounded-lg bg-[var(--color-surface-2)] px-3 py-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel id={setting.id} label={setting.label} dirty={dirty} />
        <span className="rounded-md bg-[var(--color-surface-3)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--color-primary)]">
          {Math.round(clamped)}
          {unit}
        </span>
      </div>
      <input
        id={setting.id}
        type="range"
        className="nd-range focusable mt-3"
        min={range.min}
        max={range.max}
        step={range.step}
        value={clamped}
        onChange={(e) => onChange(e.target.value)}
        style={{ "--nd-fill": `${pct}%` } as CSSProperties}
        data-focusable="true"
      />
      <div className="mt-1 flex justify-between text-[0.625rem] text-[var(--color-muted)]">
        <span>
          {range.min}
          {unit}
        </span>
        <span>
          {range.max}
          {unit}
        </span>
      </div>
    </div>
  );
}
