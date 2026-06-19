import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

/** WebKitGTK on Linux rejects crossorigin assets over Tauri's custom protocol (white screen). */
function removeCrossoriginPlugin(): Plugin {
  return {
    name: "remove-crossorigin",
    transformIndexHtml(html) {
      return html
        .replace(/<script([^>]*?)\scrossorigin(?:="[^"]*")?([^>]*)>/gi, "<script$1$2>")
        .replace(/<link([^>]*?)\scrossorigin(?:="[^"]*")?([^>]*)>/gi, "<link$1$2>");
    },
  };
}

export default defineConfig(async () => ({
  base: "./",
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    removeCrossoriginPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    modulePreload: {
      polyfill: false,
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
