import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "NexusDeck";

/** GitHub Pages serves this at https://<user>.github.io/<repo>/companion/ */
const base = process.env.VITE_COMPANION_BASE ?? `/${repoName}/companion/`;

export default defineConfig({
  root,
  base,
  publicDir: path.resolve(root, "public"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(root, "../docs/companion"),
    emptyOutDir: true,
  },
});
