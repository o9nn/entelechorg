import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/shared",
      "packages/db",
      "packages/adapter-utils",
      "packages/adapters/acpx-local",
      "packages/adapters/claude-local",
      "packages/adapters/codex-local",
      "packages/adapters/cursor-local",
      "packages/adapters/gemini-local",
      "packages/adapters/opencode-local",
      "packages/adapters/pi-local",
      "server",
      "ui",
      "cli",
      // entelechorg cognitive-tier tests (echo-agent-loop, GlobalWorkspaceBroadcaster, memory)
      {
        test: {
          name: "echo",
          include: ["__tests__/**/*.test.ts"],
          environment: "node",
        },
        esbuild: {
          tsconfigRaw: {
            compilerOptions: {
              target: "ES2023",
              module: "NodeNext",
              moduleResolution: "NodeNext",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              resolveJsonModule: true,
            },
          },
        },
      },
    ],
  },
});
