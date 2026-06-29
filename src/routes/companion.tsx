import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import { getPairedDeck, sendNexusModToPairedDeck } from "@/lib/remote/sendToDeck";
import { loadPairedDeck } from "@/lib/remote/pairedDeck";
import { useGamesStore, useSettingsStore } from "@/stores";
import type { ModSummary, Profile } from "@/lib/nexus/types";
import { groupModFiles } from "@/components/mod/ModFileSections";

export const Route = createFileRoute("/companion")({
  component: CompanionPage,
});

/**
 * Mobile-first remote sender — browse Nexus mods and queue install on a paired Deck.
 * The Deck downloads from Nexus itself (no multi-GB upload from your phone).
 */
function CompanionPage() {
  const deckDetected = useSettingsStore((s) => s.deckDetected);
  const profiles = useGamesStore((s) => s.profiles);
  const loadProfiles = useGamesStore((s) => s.loadProfiles);

  const [paired] = useState(() => loadPairedDeck());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [query, setQuery] = useState("");
  const [mods, setMods] = useState<ModSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (profiles.length > 0 && !profile) {
      setProfile(profiles[0] ?? null);
    }
  }, [profiles, profile]);

  const search = useCallback(async () => {
    if (!profile || !query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setMods(
        await api.searchMods(profile.game_domain, query.trim(), "downloads", 0, 20)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profile, query]);

  const sendMod = async (mod: ModSummary) => {
    const deck = getPairedDeck();
    if (!deck || !profile) return;
    setSendingId(mod.mod_id);
    setError(null);
    setNote(null);
    try {
      const files = await api.getModFiles(profile.game_domain, mod.mod_id);
      const { mainFiles } = groupModFiles(files);
      const file = mainFiles.find((f) => f.is_primary) ?? mainFiles[0];
      if (!file) throw new Error("No downloadable file found for this mod.");
      setNote(
        await sendNexusModToPairedDeck(deck, profile.game_domain, mod.mod_id, mod.name, file)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingId(null);
    }
  };

  if (deckDetected) {
    return (
      <div className="page-section mx-auto max-w-lg space-y-4 p-4">
        <h1 className="page-header-title">Mobile companion</h1>
        <p className="text-sm text-[var(--color-muted)]">
          This mode is for phones and PCs sending mods <strong>to</strong> a Deck. On the Deck
          itself, turn on <strong>Receive</strong> in Settings so another device can pair.
        </p>
        <Link to="/settings">
          <Button>Open Settings</Button>
        </Link>
      </div>
    );
  }

  if (!paired) {
    return (
      <div className="page-section mx-auto max-w-lg space-y-4 p-4">
        <div className="flex items-center gap-3">
          <MonitorSmartphone className="h-8 w-8 text-[var(--color-primary)]" />
          <div>
            <h1 className="page-header-title">Mobile companion</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Pair with your Steam Deck first, then browse and send mods from here.
            </p>
          </div>
        </div>
        <Link to="/settings">
          <Button className="w-full">Pair in Settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="page-section mx-auto max-w-lg space-y-4 p-4 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-header-title">Send to Deck</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Paired with <strong>{paired.name}</strong> — installs run on the Deck using its Nexus
            connection.
          </p>
        </div>
        <Badge variant="success">Online</Badge>
      </div>

      {profiles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={profile?.id === p.id ? "default" : "outline"}
              onClick={() => setProfile(p)}
            >
              {p.name}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Nexus mods…"
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <Button onClick={() => void search()} loading={loading}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <p className="rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {note && (
        <p className="rounded-xl bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
          {note}
        </p>
      )}

      <div className="space-y-2">
        {mods.map((mod) => (
          <Card key={mod.mod_id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{mod.name}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{mod.author}</p>
            </div>
            <Button
              size="sm"
              loading={sendingId === mod.mod_id}
              disabled={sendingId !== null}
              onClick={() => void sendMod(mod)}
            >
              <Send className="h-4 w-4" />
              Send
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
