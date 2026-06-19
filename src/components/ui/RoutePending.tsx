export function RoutePending() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent motion-reduce:animate-none" />
      <p className="text-[var(--color-muted)]">Loading…</p>
    </div>
  );
}
