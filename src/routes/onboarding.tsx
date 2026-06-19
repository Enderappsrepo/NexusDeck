import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Gamepad2, KeyRound, Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingStepIndicator } from "@/components/wizard/OnboardingStepIndicator";
import { useAuthStore } from "@/stores";
import { api } from "@/lib/commands";
import type { GameCandidate, PlatformInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

type OnboardingStep = "welcome" | "steam" | "library" | "apikey" | "finish";

const STEPS: OnboardingStep[] = ["welcome", "steam", "library", "apikey", "finish"];
const STEP_LABELS = ["Welcome", "Steam", "Library", "API Key", "Finish"];

function OnboardingPage() {
  const navigate = useNavigate();
  const { login, loading, error, user } = useAuthStore();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [steamPath, setSteamPath] = useState<string | null>(null);
  const [detectedGames, setDetectedGames] = useState<GameCandidate[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [steamName, setSteamName] = useState("NexusDeck");
  const [addingToSteam, setAddingToSteam] = useState(false);
  const [steamAdded, setSteamAdded] = useState(false);
  const [steamError, setSteamError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const scanSteam = async () => {
    const steam = await api.detectSteamInstall();
    if (steam) {
      setSteamPath(steam.steam_path);
      const fo4 = await api.detectGame("fallout4");
      setDetectedGames(fo4);
    } else {
      setSteamPath(null);
      setDetectedGames([]);
    }
  };

  useEffect(() => {
    api.getPlatformInfo().then(setPlatform).catch(() => setPlatform(null));
  }, []);

  useEffect(() => {
    if (step === "finish" && detectedGames.length === 0) {
      void scanSteam();
    }
  }, [step, detectedGames.length]);

  useEffect(() => {
    if (user && step === "finish") return;
    if (user && step !== "apikey") {
      setStep("finish");
    }
  }, [user, step]);

  const handleContinue = async () => {
    if (step === "welcome") {
      await scanSteam();
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
      await login(apiKey);
      setStep("finish");
      return;
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

  const finishSetup = async (goToGameSetup: boolean) => {
    setFinishing(true);
    try {
      await api.completeOnboarding();
      if (goToGameSetup) {
        navigate({ to: "/games/$domain/setup", params: { domain: "fallout4" } });
      } else {
        navigate({ to: "/" });
      }
    } finally {
      setFinishing(false);
    }
  };

  if (user && step !== "finish" && step !== "apikey") {
    return null;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-8">
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

      <OnboardingStepIndicator steps={STEP_LABELS} currentStep={stepIndex} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl">
            {step === "welcome" && (
              <>
                <Sparkles className="h-6 w-6 text-[var(--color-primary)]" />
                Welcome
              </>
            )}
            {step === "steam" && (
              <>
                <Gamepad2 className="h-6 w-6 text-[var(--color-primary)]" />
                Steam detection
              </>
            )}
            {step === "library" && (
              <>
                <Gamepad2 className="h-6 w-6 text-[var(--color-primary)]" />
                Add to Steam library
              </>
            )}
            {step === "apikey" && (
              <>
                <KeyRound className="h-6 w-6 text-[var(--color-primary)]" />
                Connect Nexus Mods
              </>
            )}
            {step === "finish" && (
              <>
                <Rocket className="h-6 w-6 text-[var(--color-primary)]" />
                Ready to go
              </>
            )}
          </CardTitle>
          <CardDescription>
            {step === "welcome" &&
              "A lightweight mod manager built for Steam Deck and Windows."}
            {step === "steam" &&
              "NexusDeck works with your existing Steam library and Proton prefixes."}
            {step === "library" &&
              "Launch NexusDeck from Gaming Mode like any other game."}
            {step === "apikey" &&
              "Enter your personal API key to browse and download mods."}
            {step === "finish" &&
              "You're connected. Set up Fallout 4 or explore the app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === "welcome" && (
            <ul className="list-inside list-disc space-y-2 text-[var(--color-muted)]">
              <li>Controller-friendly interface</li>
              <li>Auto-detect Steam games</li>
              <li>Fallout 4 setup wizard</li>
              <li>Secure API key storage</li>
            </ul>
          )}

          {step === "steam" && (
            <div className="space-y-3 text-sm">
              {steamPath ? (
                <p className="rounded-xl bg-[var(--color-secondary)] p-4">
                  Steam found at <span className="font-mono">{steamPath}</span>
                </p>
              ) : (
                <p className="rounded-xl bg-[var(--color-secondary)] p-4 text-[var(--color-muted)]">
                  Steam not detected — you can set game paths manually later.
                </p>
              )}
              {detectedGames.length > 0 && (
                <p className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-4">
                  Fallout 4 detected at{" "}
                  <span className="font-mono">{detectedGames[0].install_path}</span>
                </p>
              )}
              <Button variant="secondary" onClick={scanSteam}>
                Scan again
              </Button>
            </div>
          )}

          {step === "library" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-muted)]">
                Adding NexusDeck to Steam lets you launch it from Big Picture or
                Gaming Mode with full controller support.
              </p>
              <div>
                <label
                  htmlFor="onboarding-steam-name"
                  className="text-sm font-medium"
                >
                  Library name
                </label>
                <Input
                  id="onboarding-steam-name"
                  className="mt-2"
                  value={steamName}
                  onChange={(e) => setSteamName(e.target.value)}
                />
              </div>
              {steamAdded ? (
                <p className="rounded-xl bg-[var(--color-success)]/10 p-4 text-sm text-[var(--color-success)]">
                  Added to Steam. Restart Steam for the shortcut to appear.
                </p>
              ) : (
                <Button loading={addingToSteam} onClick={addToSteam} variant="secondary">
                  Add NexusDeck to Steam
                </Button>
              )}
              {steamError && (
                <p className="text-sm text-[var(--color-danger)]">{steamError}</p>
              )}
              <p className="text-xs text-[var(--color-muted)]">
                You can skip this and add it later from Settings.
              </p>
            </div>
          )}

          {step === "apikey" && (
            <>
              <Input
                type="password"
                placeholder="Nexus API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button
                variant="ghost"
                className="text-[var(--color-primary)]"
                onClick={() =>
                  openUrl("https://www.nexusmods.com/users/myaccount?tab=api+access")
                }
              >
                Get your API key from Nexus Mods
              </Button>
              {error && <p className="text-[var(--color-danger)]">{error}</p>}
            </>
          )}

          {step === "finish" && (
            <div className="space-y-4">
              {detectedGames.length > 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  Fallout 4 is ready to configure. The setup wizard will detect your
                  game path, staging folder, and F4SE.
                </p>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">
                  You can set up a game profile anytime from the Games page.
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {detectedGames.length > 0 && (
                  <Button
                    loading={finishing}
                    onClick={() => finishSetup(true)}
                    className="flex-1"
                  >
                    Set up Fallout 4
                  </Button>
                )}
                <Button
                  variant={detectedGames.length > 0 ? "secondary" : "default"}
                  loading={finishing}
                  onClick={() => finishSetup(false)}
                  className="flex-1"
                >
                  Go to home
                </Button>
              </div>
              {detectedGames.length > 0 && (
                <Link
                  to="/games/$domain/setup"
                  params={{ domain: "fallout4" }}
                  className="text-center text-sm text-[var(--color-primary)]"
                >
                  Open setup wizard later
                </Link>
              )}
            </div>
          )}

          {step !== "finish" && (
            <Button
              size="lg"
              onClick={handleContinue}
              disabled={
                loading ||
                (step === "apikey" && !apiKey.trim()) ||
                addingToSteam
              }
            >
              {loading
                ? "Connecting..."
                : step === "welcome"
                  ? "Get Started"
                  : step === "apikey"
                    ? "Connect"
                    : "Continue"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
