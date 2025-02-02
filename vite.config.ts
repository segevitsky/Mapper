import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    minify: false,
    terserOptions: {
      sourceMap: true,
    },
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, "src/background/background.ts"),
        content: path.resolve(__dirname, "src/content/content.ts"),
        devtools: path.resolve(__dirname, "src/devtools/index.html"),
        panel: path.resolve(__dirname, "src/panel/index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]",
        sourcemapExcludeSources: false,
      },
    },
  },
  publicDir: "public",
});
