import { defineConfig } from "vite";

// Built into the Android app's assets (the version it ships with), or into
// OPENLITE_OUT for an update (see .github/workflows/bundle.yml). Served at
// /__openlite/ either way (MainActivity).
export default defineConfig({
  base: "/__openlite/",
  resolve: { alias: { "@highlite/core": "@ryelite/core" } },
  define: { __OPENLITE_VERSION__: JSON.stringify(process.env.OPENLITE_VERSION ?? "local") },
  build: {
    outDir: process.env.OPENLITE_OUT ?? "../android/app/src/main/assets/web",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 10000
  }
});
