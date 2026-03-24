import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    emptyOutDir: false,
    copyPublicDir: false,
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
      exclude: ["**/ci-cd/**", "**/{app,public,test,docs,dist}/**", "**/**.test.ts", "vite.config.ts"],
      thresholds: {
        autoUpdate: true,
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
      reporter: ["text", "lcovonly"],
    },
  },
});
