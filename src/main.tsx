import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { RouteError } from "@/components/ui/RouteError";
import { RoutePending } from "@/components/ui/RoutePending";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

const router = createRouter({
  routeTree,
  defaultPendingComponent: RoutePending,
  defaultErrorComponent: RouteError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
} catch (error) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:2rem;background:#0a0b10;color:#f2f3f8;font-family:system-ui,sans-serif;text-align:center;">
        <div>
          <h1 style="margin:0 0 1rem;font-size:1.5rem;">NexusDeck failed to start</h1>
          <p style="margin:0;color:#9499b0;">${error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    `;
  }
  console.error(error);
}
