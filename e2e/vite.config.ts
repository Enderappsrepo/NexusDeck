import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const e2eRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.join(e2eRoot, "app"),
  resolve: {
    alias: {
      "@": path.resolve(e2eRoot, "../src"),
    },
  },
  server: {
    port: 4174,
    strictPort: true,
  },
});
