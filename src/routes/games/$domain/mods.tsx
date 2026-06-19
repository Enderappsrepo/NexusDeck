import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/games/$domain/mods")({
  component: ModsLayout,
});

function ModsLayout() {
  return <Outlet />;
}
