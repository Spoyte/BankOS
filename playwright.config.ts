import {defineConfig} from "@playwright/test";

/**
 * E2E tests run against the FULL local stack (anvil + CRE policy service + Unlink engine + seeded
 * "Brooklyn Mutual" bank + web app), exactly what `bash scripts/demo.sh` boots. Every flow exercises
 * real on-chain transactions on local Arc — these are not mocks.
 *
 * The OS here is newer than Playwright's bundled chromium supports, so we drive the system Google
 * Chrome via `channel: "chrome"`. Tests run serially on a single worker because they share one chain.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // Flows hit a real chain + engine; allow one retry to absorb transient nonce/RPC timing.
  retries: 1,
  timeout: 120_000,
  expect: {timeout: 20_000},
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: "chrome",
    headless: true,
    launchOptions: {args: ["--no-sandbox", "--disable-dev-shm-usage"]},
    actionTimeout: 25_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },
  // Reuses the already-running stack; in a clean environment it boots one via demo.sh (which always
  // clean-slates + reseeds, so the suite starts from the known seed state).
  webServer: {
    command: "bash scripts/demo.sh",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
