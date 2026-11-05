import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/dashboard/",
  // Saved pages (extended/lib/pageCache.ts) are tied to the build that wrote them.
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
});
