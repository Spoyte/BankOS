import {defineConfig} from "vitest/config";

// Unit tests for pure logic across the JS/TS packages (no chain, no network).
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    environment: "node",
  },
});
