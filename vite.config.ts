import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

/// <reference types="vitest" />
import { type Plugin, type ResolvedConfig, defineConfig } from "vite";

function clearPublicFiles(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "clear-public-files",
    configResolved(_config) {
      config = _config;
    },
    buildEnd() {
      readdir(resolve(__dirname, config.publicDir)).then((files) => {
        for (const file of files) {
          rm(resolve(`${config.build.outDir}/${file}`), { recursive: true });
        }
      });
    },
  };
}

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
    rollupOptions: {
      plugins: [clearPublicFiles()],
    },
  },
  test: {
    coverage: {
      exclude: ["**/ci-cd/**", "**/{app,public,test}/**", "**/docs/**"],
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
