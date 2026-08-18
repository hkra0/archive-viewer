import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ["react-markdown", "remark-gfm", "remark-math", "rehype-katex", "katex", "prismjs"],
          archive: ["jszip", "minisearch", "zod"],
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
