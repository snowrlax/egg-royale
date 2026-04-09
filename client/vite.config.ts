import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@fish-jam/shared": path.resolve(__dirname, "../packages/shared/src"),
    },
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d"],
  },
});
