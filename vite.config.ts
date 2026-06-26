import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version?: string;
};

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const gitCommit = git("rev-parse --short HEAD");
// Commits since the latest tag (falls back to total commit count when untagged).
const gitAhead =
  git("rev-list --count HEAD ^$(git describe --tags --abbrev=0 2>/dev/null) 2>/dev/null") ||
  git("rev-list --count HEAD");

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __GIT_AHEAD__: JSON.stringify(gitAhead),
  },
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
