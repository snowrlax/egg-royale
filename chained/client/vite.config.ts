import wasm from "vite-plugin-wasm";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [wasm()],
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d"],
  },
  server: {
    host: true,
    port: 5174,
  },
});
