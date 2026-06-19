import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { RouteError } from "@/components/ui/RouteError";
import { RoutePending } from "@/components/ui/RoutePending";
import { logStartupEvent } from "@/lib/commands";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

declare global {
  interface Window {
    __nexusdeckBootStatus?: (message: string, isError?: boolean) => void;
    __nexusdeckBootReady?: () => void;
  }
}

function setBootStatus(message: string, isError = false) {
  window.__nexusdeckBootStatus?.(message, isError);
}

async function bootLog(step: string, detail?: string) {
  try {
    await logStartupEvent(step, detail);
  } catch {
    // Browser dev or invoke unavailable during early boot.
  }
}

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

function showFatalError(message: string) {
  setBootStatus(message, true);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:2rem;background:#0a0b10;color:#f2f3f8;font-family:system-ui,sans-serif;text-align:center;">
        <div style="max-width:36rem;">
          <h1 style="margin:0 0 1rem;font-size:1.5rem;">NexusDeck failed to start</h1>
          <p style="margin:0;color:#f87171;white-space:pre-wrap;">${message}</p>
        </div>
      </div>
    `;
  }
}

void bootLog("frontend_boot", "main.tsx loaded");
setBootStatus("Starting NexusDeck…");

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
  void bootLog("react_mounted");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  void bootLog("react_mount_failed", message);
  showFatalError(message);
  console.error(error);
}
