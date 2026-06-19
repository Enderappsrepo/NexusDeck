import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex flex-wrap gap-2 rounded-xl bg-[var(--color-secondary)] p-2",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "focusable min-h-[48px] min-w-[48px] rounded-lg px-5 py-2 text-base font-medium text-[var(--color-muted)] transition-all data-[state=active]:bg-[var(--color-card)] data-[state=active]:text-[var(--color-foreground)] data-[state=active]:shadow-[var(--shadow-sm)] data-[state=active]:ring-1 data-[state=active]:ring-[var(--color-primary)]/30",
        className
      )}
      data-focusable="true"
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-4 focus:outline-none", className)}
      {...props}
    />
  );
}
