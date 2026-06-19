import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function RouteError({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-[var(--color-muted)]">{message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
