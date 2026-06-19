import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores";
import { api } from "@/lib/commands";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { login, loading, error, user } = useAuthStore();
  const [apiKey, setApiKey] = useState("");
  const [step, setStep] = useState<"welcome" | "apikey">("welcome");
  const [steamInfo, setSteamInfo] = useState<string | null>(null);

  const handleContinue = async () => {
    if (step === "welcome") {
      const steam = await api.detectSteamInstall();
      if (steam) {
        setSteamInfo(`Steam found at ${steam.steam_path}`);
        const fo4 = await api.detectGame("fallout4");
        if (fo4.length > 0) {
          setSteamInfo(`Steam found — Fallout 4 detected at ${fo4[0].install_path}`);
        }
      } else {
        setSteamInfo("Steam not detected — you can set game paths manually");
      }
      setStep("apikey");
      return;
    }

    await login(apiKey);
    navigate({ to: "/" });
  };

  if (user) {
    navigate({ to: "/" });
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
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">
            {step === "welcome" ? "Welcome to NexusDeck" : "Connect Nexus Mods"}
          </CardTitle>
          <CardDescription>
            {step === "welcome"
              ? "A lightweight mod manager built for Steam Deck and Windows"
              : "Enter your personal API key to browse and download mods"}
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

          {step === "apikey" && (
            <>
              {steamInfo && (
                <p className="rounded-xl bg-[var(--color-secondary)] p-4 text-sm">{steamInfo}</p>
              )}
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
              {error && (
                <p className="text-[var(--color-danger)]">{error}</p>
              )}
            </>
          )}

          <Button
            size="lg"
            onClick={handleContinue}
            disabled={loading || (step === "apikey" && !apiKey.trim())}
          >
            {loading ? "Connecting..." : step === "welcome" ? "Get Started" : "Connect"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
