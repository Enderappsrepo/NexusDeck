import { Link } from "@tanstack/react-router";
import { Gamepad2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

interface SetupRequiredStateProps {
  domain: string;
  gameName?: string;
  title?: string;
  description?: string;
}

export function SetupRequiredState({
  domain,
  gameName,
  title = "Set up this game first",
  description = "Create a profile with your game path and staging folder before browsing or installing mods.",
}: SetupRequiredStateProps) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <EmptyState
        icon={Gamepad2}
        title={title}
        description={description}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/games/$domain/setup" params={{ domain }}>
              <Button data-focusable="true">
                <Sparkles className="h-4 w-4" />
                Set up {gameName ?? "game"}
              </Button>
            </Link>
            <Link to="/games">
              <Button variant="secondary" data-focusable="true">
                Browse supported games
              </Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
