import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DiagnosticReport } from "@/components/autofix/DiagnosticReport";
import { LogViewer } from "@/components/autofix/LogViewer";
import { Mo2SetupWizard } from "@/components/mo2/Mo2SetupWizard";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { isSupportedDomain, loadSupportedGames } from "@/lib/games";
import { resolveGameDomain, usePathname } from "@/lib/routeParams";
import type { DiagnosticScanResult, RemedyDefinition } from "@/lib/autofix-types";

export const Route = createFileRoute("/games/$domain/troubleshoot")({
  component: TroubleshootPage,
});

function TroubleshootPage() {
  const pathname = usePathname();
  const domain = resolveGameDomain(Route.useParams().domain, pathname);
  const getProfile = useGamesStore((s) => s.getProfile);
  const profile = getProfile(domain);

  const [scan, setScan] = useState<DiagnosticScanResult | null>(null);
  const [remedies, setRemedies] = useState<RemedyDefinition[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [applyingRemedy, setApplyingRemedy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [wabbajack, setWabbajack] = useState<string[]>([]);

  const runScan = useCallback(async () => {
    if (!profile) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api.runDiagnosticScan(profile.id);
      setScan(result);
      setMessage(`Scan complete — ${result.findings.length} finding(s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!domain || !isSupportedDomain(domain)) return;
    void loadSupportedGames();
    void api.listAutofixRemedies(domain).then(setRemedies).catch(() => setRemedies([]));
    void api.getWabbajackChecklist().then(setWabbajack).catch(() => setWabbajack([]));
  }, [domain]);

  useEffect(() => {
    if (profile) void runScan();
  }, [profile, runScan]);

  const applyFix = async (remedyId: string) => {
    if (!profile) return;
    setApplyingRemedy(remedyId);
    setMessage("");
    try {
      const result = await api.applyAutofix(profile.id, remedyId);
      setMessage(result.results.map((r) => r.message).join(" "));
      await runScan();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingRemedy(null);
    }
  };

  const applySafe = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const result = await api.applySafeAutofixes(profile.id);
      setMessage(result.results.map((r) => r.message).join("\n"));
      await runScan();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportReport = async () => {
    if (!profile) return;
    try {
      const md = await api.exportDiagnosticMarkdown(profile.id);
      setMarkdown(md);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  if (!domain || !isSupportedDomain(domain)) {
    return (
      <div className="py-16 text-center">
        <p>Unsupported game.</p>
        <Link to="/games">Back to games</Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold">DeckModFix Troubleshoot</h1>
        <p className="mt-4 text-[var(--color-muted)]">Complete game setup first.</p>
        <Link to="/games/$domain/setup" params={{ domain }} className="mt-8 inline-block">
          <Button size="lg">Run setup wizard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-scroll-pane>
      <div>
        <h1 className="text-3xl font-bold">DeckModFix Troubleshoot</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Diagnostic scan, one-click fixes, and Deck-specific guidance for {profile.name}.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => void runScan()} disabled={busy} data-focusable="true">
          {busy ? "Scanning…" : "Run full scan"}
        </Button>
        <Button variant="secondary" onClick={() => void applySafe()} disabled={busy} data-focusable="true">
          Fix all safe issues
        </Button>
        <Button variant="outline" onClick={() => void exportReport()} data-focusable="true">
          Export report
        </Button>
      </div>

      {message && <p className="text-sm text-[var(--color-muted)]">{message}</p>}

      {scan && (
        <DiagnosticReport
          findings={scan.findings}
          onApplyFix={(id) => void applyFix(id)}
          applyingRemedy={applyingRemedy}
        />
      )}

      {domain === "skyrimspecialedition" && (
        <Mo2SetupWizard profileId={profile.id} onComplete={() => void runScan()} />
      )}

      {wabbajack.length > 0 && domain === "skyrimspecialedition" && (
        <Card>
          <CardHeader>
            <CardTitle>Wabbajack checklist</CardTitle>
            <CardDescription>Steps before running a Wabbajack modlist on Deck.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-2 text-sm">
              {wabbajack.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {remedies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Knowledge base</CardTitle>
            <CardDescription>{remedies.length} documented remedies for this game.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {remedies.map((r) => (
              <div key={r.id} className="rounded-lg bg-[var(--color-secondary)] p-3">
                <strong>{r.title}</strong>
                <p className="text-[var(--color-muted)]">{r.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {markdown && (
        <Card>
          <CardHeader>
            <CardTitle>Exported report</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{markdown}</pre>
          </CardContent>
        </Card>
      )}

      <LogViewer lines={logLines} />
    </div>
  );
}
