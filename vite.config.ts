import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GITHUB_PAGES_BASE lets the deploy workflow build with the repo-name
// subpath GitHub Pages serves from (e.g. /dota-dashboard/) without affecting
// local dev, which always runs at the root.
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? "/",
  plugins: [react()],
});
