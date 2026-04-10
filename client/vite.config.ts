import wasm from "vite-plugin-wasm";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [wasm()],
  resolve: {
    alias: {
      "@fish-jam/shared": new URL("../packages/shared/src", import.meta.url)
        .pathname,
    },
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d"],
  },
  server: {
    host: true,
    port: 5173,
  },
});
