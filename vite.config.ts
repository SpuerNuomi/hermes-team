import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          if (
            id.includes("/react-markdown/") ||
            id.includes("/remark-gfm/") ||
            id.includes("/mdast-util-") ||
            id.includes("/micromark") ||
            id.includes("/unified/") ||
            id.includes("/unist-") ||
            id.includes("/hast-") ||
            id.includes("/vfile")
          ) {
            return "vendor-markdown";
          }
          if (
            id.includes("/react-syntax-highlighter/") ||
            id.includes("/refractor/") ||
            id.includes("/prismjs/")
          ) {
            return "vendor-highlight";
          }
          if (id.includes("/lucide-react/") || id.includes("/lucide/")) return "vendor-icons";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 17331,
    strictPort: false,
  },
});
