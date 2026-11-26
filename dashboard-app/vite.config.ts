import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

// Lists the build's files for the service worker (public/sw.js), which keeps them for offline use.
const precacheList = (): Plugin => ({
  name: "precache-list",
  apply: "build",
  generateBundle(_, bundle) {
    this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify(Object.keys(bundle).filter((f) => f.startsWith("assets/"))) });
  },
});

export default defineConfig({
  plugins: [react(), precacheList()],
  base: "/dashboard/",
  // Saved pages (extended/lib/pageCache.ts) are tied to the build that wrote them.
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
});
