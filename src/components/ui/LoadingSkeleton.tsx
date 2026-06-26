import { cn } from "@/lib/utils";

function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-[var(--color-secondary)] motion-reduce:animate-none",
        className
      )}
    />
  );
}

export function TextSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]",
        className
      )}
    >
      <Bone className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Bone className="h-5 w-3/4" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function ModGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("mod-grid", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ModListSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("mod-list", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2.5"
        >
          <Bone className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Bone className="h-4 w-4/5" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListRowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Bone key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
