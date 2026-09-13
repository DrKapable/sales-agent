import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/lib/ai/prompt", replacement: resolve(root, "lib/ai/prompt-kaunda.ts") },
      { find: /^@\//, replacement: `${root}/` }
    ]
  },
  test: {
    environment: "node"
  }
});
