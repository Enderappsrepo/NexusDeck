import { useState } from "react";
import { FileUp } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api } from "@/lib/commands";

type ImportFormat = "wabbajack" | "mo2" | "txt";

export function ModlistImportWizard({ profileId: _profileId }: { profileId: string }) {
  const [format, setFormat] = useState<ImportFormat>("wabbajack");
  const [entries, setEntries] = useState<Array<{ name: string; source: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = async () => {
    setError(null);
    const selected = await open({
      multiple: false,
      filters: [{ name: "Mod list", extensions: ["txt", "json", "md"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    setLoading(true);
    try {
      const content = await api.readTextFile(selected);
      const parsed = await api.parseModlistImport(content, format);
      setEntries(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4">
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <FileUp className="h-5 w-5" />
        Import mod list
      </p>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Parse a Wabbajack checklist, MO2 modlist.txt, or plain text list to see what to install.
      </p>
      <SegmentedControl
        value={format}
        onValueChange={(v) => setFormat(v as ImportFormat)}
        options={[
          { value: "wabbajack", label: "Wabbajack" },
          { value: "mo2", label: "MO2" },
          { value: "txt", label: "Plain text" },
        ]}
      />
      <Button
        className="mt-4"
        size="sm"
        loading={loading}
        onClick={() => void importFile()}
        data-focusable="true"
      >
        Choose file
      </Button>
      {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
      {entries.length > 0 && (
        <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto text-sm scrollbar-thin" data-scroll-pane>
          {entries.map((e, i) => (
            <li key={`${e.name}-${i}`} className="truncate rounded bg-[var(--color-secondary)] px-2 py-1">
              {e.name}
              {e.source && (
                <span className="ml-2 text-xs text-[var(--color-muted)]">({e.source})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
