import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const previewRoot = path.dirname(fileURLToPath(import.meta.url));

// Mounts the real companion App (../../src/App) against the mocked device API.
export default defineConfig({
  root: previewRoot,
  plugins: [react(), tailwindcss()],
  server: { port: 4176, strictPort: true },
});
