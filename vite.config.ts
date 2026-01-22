import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser', // Enable minification for production
    terserOptions: {
      sourceMap: true, // Disable source maps in terser
      compress: {
        drop_console: true, // Remove console.log statements
        drop_debugger: true, // Remove debugger statements
      },
      mangle: true, // Obfuscate variable names
    },
    sourcemap: "inline", // Disable source maps completely for production
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, "src/background/background.ts"),
        content: path.resolve(__dirname, "src/content/content.ts"),
        devtools: path.resolve(__dirname, "src/devtools/index.html"),
        panel: path.resolve(__dirname, "src/panel/index.html"),
        floatingWindow: path.resolve(__dirname, "src/indicatorFloatingWindow/floating-window.html"),
        indicatorFloatingWindow: path.resolve(__dirname, "src/indicatorFloatingWindow/floating-window.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  publicDir: "public",
});
