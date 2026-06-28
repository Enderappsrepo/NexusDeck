import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const previewRoot = path.dirname(fileURLToPath(import.meta.url));

// Mirrors the app's plugin pipeline (react + tailwind v4) but mounts the real
// app against the permissive Tauri mock in this folder. Not part of the build.
export default defineConfig({
  root: previewRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(previewRoot, "../../src"),
    },
  },
  server: {
    port: 4175,
    strictPort: true,
  },
});
