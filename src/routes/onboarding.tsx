import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Gamepad2,
  KeyRound,
  Loader2,
  Rocket,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingStepIndicator } from "@/components/wizard/OnboardingStepIndicator";
import { useGamepadBackHandler } from "@/hooks/useGamepadRouter";
import { useAuthStore } from "@/stores";
import { api } from "@/lib/commands";
import type { GameCandidate, PlatformInfo, SevenZipInfo } from "@/lib/nexus/types";

const ONBOARDING_GAMES = [
  { domain: "skyrimspecialedition", label: "Skyrim SE" },
  { domain: "fallout4", label: "Fallout 4" },
] as const;

type DetectedGame = {
  domain: (typeof ONBOARDING_GAMES)[number]["domain"];
  label: string;
  candidate: GameCandidate;
};

type OnboardingStep = "welcome" | "steam" | "library" | "apikey" | "finish";

const ALL_STEPS: OnboardingStep[] = ["welcome", "steam", "library", "apikey", "finish"];
const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  steam: "Steam",
  library: "Library",
  apikey: "API Key",
  finish: "Finish",
};

const WELCOME_FEATURES = [
  { title: "Controller-first", body: "Built for Steam Deck and gamepad navigation." },
  { title: "Smart installs", body: "FOMOD wizards, native 7-Zip, and load-order tools." },
  { title: "Steam integration", body: "Detects games, Proton prefixes, and script extenders." },
  { title: "Works free or Premium", body: "Manual downloads work without Nexus Premium." },
];

function SummaryRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[var(--color-secondary)]/60 p-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-muted)]" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {detail && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{detail}</p>}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { login, loading, error, user, initialized } = useAuthStore();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [sevenZip, setSevenZip] = useState<SevenZipInfo | null>(null);
  const [steamPath, setSteamPath] = useState<string | null>(null);
  const [detectedGames, setDetectedGames] = useState<DetectedGame[]>([]);
  const [scanning, setScanning] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSkipped, setApiSkipped] = useState(false);
  const [steamName, setSteamName] = useState("NexusDeck");
  const [addingToSteam, setAddingToSteam] = useState(false);
  const [steamAdded, setSteamAdded] = useState(false);
  const [steamError, setSteamError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const activeSteps = useMemo(
    () => (platform?.is_steam_deck ? ALL_STEPS : ALL_STEPS.filter((s) => s !== "library")),
    [platform?.is_steam_deck]
  );

  useEffect(() => {
    if (user && step === "finish") return;
    if (user && step !== "apikey") {
      setStep("finish");
    }
  }, [user, step]);

  const visibleStep: OnboardingStep =
    user && step !== "apikey" && step !== "finish" ? "finish" : step;
  const stepIndex = activeSteps.indexOf(visibleStep);
  const stepHint = useMemo(() => {
    switch (visibleStep) {
      case "welcome":
        return "A quick setup to get NexusDeck ready on your device.";
      case "steam":
        return "We scan your Steam libraries for supported Bethesda games.";
      case "library":
        return "Optional but recommended on Steam Deck for Gaming Mode.";
      case "apikey":
        return "Connect Nexus Mods for browsing, downloads, and endorsements.";
      case "finish":
        return "Review what we found, then jump into a game setup or explore.";
      default:
        return "";
    }
  }, [visibleStep]);

  const goBackStep = () => {
    if (visibleStep === "finish") {
      setStep("apikey");
      return;
    }
    if (visibleStep === "apikey") {
      setStep(platform?.is_steam_deck ? "library" : "steam");
      return;
    }
    if (visibleStep === "library") {
      setStep("steam");
      return;
    }
    if (visibleStep === "steam") {
      setStep("welcome");
    }
  };

  useGamepadBackHandler(() => {
    if (visibleStep !== "welcome") goBackStep();
  });

  const scanSteam = async () => {
    setScanning(true);
    try {
      const steam = await api.detectSteamInstall();
      if (steam) {
        setSteamPath(steam.steam_path);
        const found: DetectedGame[] = [];
        for (const game of ONBOARDING_GAMES) {
          const candidates = await api.detectGame(game.domain);
          if (candidates[0]) {
            found.push({ domain: game.domain, label: game.label, candidate: candidates[0] });
          }
        }
        setDetectedGames(found);
      } else {
        setSteamPath(null);
        setDetectedGames([]);
      }
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    api.getPlatformInfo().then(setPlatform).catch(() => setPlatform(null));
    api.getSevenZipInfo().then(setSevenZip).catch(() => setSevenZip(null));
    void scanSteam();
  }, []);

  useEffect(() => {
    if (step === "finish" && detectedGames.length === 0 && !scanning) {
      void scanSteam();
    }
  }, [step, detectedGames.length, scanning]);

  const handleContinue = async () => {
    if (step === "welcome") {
      if (!steamPath && !scanning) {
        await scanSteam();
      }
      setStep("steam");
      return;
    }

    if (step === "steam") {
      if (platform?.is_steam_deck) {
        setStep("library");
      } else {
        setStep("apikey");
      }
      return;
    }

    if (step === "library") {
      setStep("apikey");
      return;
    }

    if (step === "apikey") {
      if (apiKey.trim()) {
        try {
          await login(apiKey);
          setApiSkipped(false);
        } catch {
          return;
        }
      } else {
        setApiSkipped(true);
      }
      setStep("finish");
    }
  };

  const addToSteam = async () => {
    setAddingToSteam(true);
    setSteamError(null);
    try {
      await api.addNexusDeckToSteam(steamName.trim() || "NexusDeck");
      setSteamAdded(true);
    } catch (e) {
      setSteamError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingToSteam(false);
    }
  };

  const finishSetup = async (domain?: DetectedGame["domain"]) => {
    setFinishing(true);
    try {
      await api.completeOnboarding();
      if (domain) {
        navigate({ to: "/games/$domain/setup", params: { domain } });
      } else {
        navigate({ to: "/" });
      }
    } finally {
      setFinishing(false);
    }
  };

  if (!initialized) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary)] motion-reduce:animate-none" />
        <p className="text-[var(--color-muted)]">Starting NexusDeck…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-8" data-scroll-pane>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-2xl font-bold text-white shadow-[var(--shadow-glow)]">
          ND
        </div>
        <span className="text-3xl font-bold tracking-tight">
          Nexus<span className="text-[var(--color-primary)]">Deck</span>
        </span>
        {platform?.is_steam_deck && (
          <p className="text-sm text-[var(--color-muted)]">
            Steam Deck setup
            {platform.steamos_version ? ` · SteamOS ${platform.steamos_version}` : ""}
          </p>
        )}
      </div>

      <OnboardingStepIndicator
        steps={activeSteps.map((s) => STEP_LABELS[s])}
        currentStep={Math.max(stepIndex, 0)}
      />
      <p className="text-center text-sm text-[var(--color-muted)]">{stepHint}</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl">
            {visibleStep === "welcome" && (
              <>
                <Sparkles className="h-6 w-6 text-[var(--color-primary)]" />
                Welcome
              </>
            )}
            {visibleStep === "steam" && (
              <>
                <Gamepad2 className="h-6 w-6 text-[var(--color-primary)]" />
                Steam detection
              </>
            )}
            {visibleStep === "library" && (
              <>
                <Gamepad2 className="h-6 w-6 text-[var(--color-primary)]" />
                Add to Steam library
              </>
            )}
            {visibleStep === "apikey" && (
              <>
                <KeyRound className="h-6 w-6 text-[var(--color-primary)]" />
                Connect Nexus Mods
              </>
            )}
            {visibleStep === "finish" && (
              <>
                <Rocket className="h-6 w-6 text-[var(--color-primary)]" />
                Ready to go
              </>
            )}
          </CardTitle>
          <CardDescription>
            {visibleStep === "welcome" &&
              "A lightweight mod manager built for Steam Deck and Windows."}
            {visibleStep === "steam" &&
              "NexusDeck works with your existing Steam library and Proton prefixes."}
            {visibleStep === "library" &&
              "Launch NexusDeck from Gaming Mode like any other game."}
            {visibleStep === "apikey" &&
              "Enter your personal API key to browse and download mods."}
            {visibleStep === "finish" &&
              "You're connected. Set up a game or explore the app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {visibleStep === "welcome" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {WELCOME_FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4"
                >
                  <p className="font-medium">{feature.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{feature.body}</p>
                </div>
              ))}
            </div>
          )}

          {visibleStep === "steam" && (
            <div className="space-y-3 text-sm">
              {scanning ? (
                <div className="flex items-center gap-3 rounded-xl bg-[var(--color-secondary)] p-4 text-[var(--color-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                  Scanning Steam libraries…
                </div>
              ) : steamPath ? (
                <SummaryRow ok label="Steam detected" detail={steamPath} />
              ) : (
                <SummaryRow
                  ok={false}
                  label="Steam not detected"
                  detail="You can set game paths manually later from each game's setup wizard."
                />
              )}

              {detectedGames.length > 0 ? (
                detectedGames.map((game) => (
                  <SummaryRow
                    key={game.domain}
                    ok
                    label={`${game.label} found`}
                    detail={game.candidate.install_path}
                  />
                ))
              ) : (
                !scanning && (
                  <SummaryRow
                    ok={false}
                    label="No supported games detected yet"
                    detail="Install Skyrim SE or Fallout 4 through Steam, or add a custom path later."
                  />
                )
              )}

              <Button
                variant="secondary"
                onClick={() => void scanSteam()}
                disabled={scanning}
                data-focusable="true"
              >
                {scanning ? "Scanning…" : "Scan again"}
              </Button>
            </div>
          )}

          {visibleStep === "library" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-muted)]">
                Adding NexusDeck to Steam lets you launch it from Big Picture or Gaming Mode with
                full controller support.
              </p>
              <div>
                <label htmlFor="onboarding-steam-name" className="text-sm font-medium">
                  Library name
                </label>
                <Input
                  id="onboarding-steam-name"
                  className="mt-2"
                  value={steamName}
                  onChange={(e) => setSteamName(e.target.value)}
                  data-focusable="true"
                />
              </div>
              {steamAdded ? (
                <p className="rounded-xl bg-[var(--color-success)]/10 p-4 text-sm text-[var(--color-success)]">
                  Added to Steam. Restart Steam for the shortcut to appear.
                </p>
              ) : (
                <Button
                  loading={addingToSteam}
                  onClick={() => void addToSteam()}
                  variant="secondary"
                  data-focusable="true"
                >
                  Add NexusDeck to Steam
                </Button>
              )}
              {steamError && <p className="text-sm text-[var(--color-danger)]">{steamError}</p>}
              <p className="text-xs text-[var(--color-muted)]">
                You can skip this and add it later from Settings.
              </p>
            </div>
          )}

          {visibleStep === "apikey" && (
            <>
              <Input
                type="password"
                placeholder="Nexus API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                data-focusable="true"
              />
              <Button
                variant="ghost"
                className="text-[var(--color-primary)]"
                onClick={() =>
                  void openUrl("https://www.nexusmods.com/users/myaccount?tab=api+access")
                }
                data-focusable="true"
              >
                Get your API key from Nexus Mods
              </Button>
              {error && <p className="text-[var(--color-danger)]">{error}</p>}
              <p className="text-xs text-[var(--color-muted)]">
                Skip for now if you only install manually downloaded archives.
              </p>
            </>
          )}

          {visibleStep === "finish" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <SummaryRow
                  ok={!!steamPath}
                  label="Steam"
                  detail={steamPath ?? "Not detected — set paths manually later"}
                />
                <SummaryRow
                  ok={!!user}
                  label="Nexus Mods account"
                  detail={
                    user
                      ? `Signed in as ${user.name}${user.is_premium ? " · Premium" : ""}`
                      : apiSkipped
                        ? "Skipped — add your API key in Settings anytime"
                        : "Not connected"
                  }
                />
                <SummaryRow
                  ok={!!sevenZip?.available}
                  label="Archive extractor"
                  detail={sevenZip?.message ?? "Checking…"}
                />
                {platform?.is_steam_deck && (
                  <SummaryRow
                    ok={steamAdded}
                    label="Steam library shortcut"
                    detail={
                      steamAdded
                        ? "Added — restart Steam to see it"
                        : "Skipped — add from Settings later"
                    }
                  />
                )}
                {detectedGames.length > 0 ? (
                  detectedGames.map((game) => (
                    <SummaryRow
                      key={game.domain}
                      ok
                      label={game.label}
                      detail={game.candidate.install_path}
                    />
                  ))
                ) : (
                  <SummaryRow
                    ok={false}
                    label="Game profiles"
                    detail="None yet — set up a game from the Games page or below"
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {detectedGames.map((game) => (
                  <Button
                    key={game.domain}
                    loading={finishing}
                    onClick={() => void finishSetup(game.domain)}
                    className="flex-1"
                    data-focusable="true"
                  >
                    Set up {game.label}
                  </Button>
                ))}
                <Button
                  variant={detectedGames.length > 0 ? "secondary" : "default"}
                  loading={finishing}
                  onClick={() => void finishSetup()}
                  className="flex-1"
                  data-focusable="true"
                >
                  Go to home
                </Button>
              </div>
              {detectedGames.length > 0 && (
                <Link
                  to="/games/$domain/setup"
                  params={{ domain: detectedGames[0].domain }}
                  className="focusable block text-center text-sm text-[var(--color-primary)]"
                  data-focusable="true"
                >
                  Open setup wizard later
                </Link>
              )}
            </div>
          )}

          {visibleStep !== "finish" && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {visibleStep !== "welcome" && (
                <Button
                  variant="outline"
                  onClick={goBackStep}
                  disabled={loading || addingToSteam || scanning}
                  data-focusable="true"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              <Button
                size="lg"
                className="flex-1"
                onClick={() => void handleContinue()}
                disabled={loading || addingToSteam || scanning}
                data-focusable="true"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    Connecting…
                  </>
                ) : scanning && visibleStep === "welcome" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    Scanning Steam…
                  </>
                ) : visibleStep === "welcome" ? (
                  "Get started"
                ) : visibleStep === "apikey" ? (
                  apiKey.trim() ? (
                    "Connect"
                  ) : (
                    "Skip for now"
                  )
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {visibleStep !== "finish" && scanning && visibleStep !== "steam" && (
        <p className="flex items-center justify-center gap-2 text-xs text-[var(--color-muted)]">
          <Circle className="h-2 w-2 fill-current" />
          Background scan running…
        </p>
      )}
    </div>
  );
}
