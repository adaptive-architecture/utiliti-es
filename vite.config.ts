/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "./dist/index.js",
      name: "adaptArch_utilitiEs",
      fileName: "utiliti-es",
      formats: ["es", "cjs", "umd", "iife"],
    },
    outDir: "./dist/bundle",
    minify: true,
  },
  test: {
    coverage: {
      exclude: ["**/ci-cd/**", "**/src/app/**"],
      thresholds: {
        autoUpdate: true,
      },
      reporter: ["text", "lcovonly"],
    },
  },
});
