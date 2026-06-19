import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppBack, useShowBackButton } from "@/hooks/useAppBack";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";

export function BackButton() {
  const show = useShowBackButton();
  const goBack = useAppBack();

  if (!show) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={goBack}
      className="mr-2 shrink-0"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
      <span className="hidden sm:inline">Back</span>
      <span className="hidden text-xs text-[var(--color-muted)] md:inline">
        ({GAMEPAD_HINTS.back})
      </span>
    </Button>
  );
}
