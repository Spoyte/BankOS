import {test, expect} from "@playwright/test";
import {openBank, approveOnLedger} from "./helpers";

/**
 * Steward desk proves the headline feature: an AI treasury agent proposes a move, and a Ledger
 * Clear-Signing approval gates a real on-chain steward action (feature #1), plus the yield-bearing
 * deposit controls (steward spread + harvest, feature #3).
 */
test.describe("Steward: treasury agent + Ledger approval", () => {
  test("steward desk renders agent, yield, and credit controls", async ({page}) => {
    await openBank(page, "steward", {steward: true});

    // Treasury agent (AI) card with a risk-rated proposal.
    const agent = page.locator(".card").filter({has: page.getByRole("heading", {name: "Treasury agent"})});
    await expect(agent).toBeVisible();
    await expect(agent.getByText(/risk/i).first()).toBeVisible();
    // The agent always renders a reasoned proposal (its decision — allocate/redeem/hold — is state-dependent).
    await expect(agent.locator(".agent-thought").first()).toBeVisible();

    // Yield-bearing deposits: steward spread + harvest-to-depositors.
    const treasury = page.locator(".card").filter({has: page.getByRole("heading", {name: "Treasury yield"})});
    await expect(treasury.getByText("Yield-bearing deposits")).toBeVisible();
    await expect(treasury.getByRole("button", {name: /Harvest → depositors/})).toBeVisible();

    // Credit desk + Ledger-secured toggle (on by default).
    await expect(page.getByRole("button", {name: "Open credit line"})).toBeVisible();
    await expect(page.getByText("Ledger-secured steward")).toBeVisible();
  });

  test("a Ledger-gated steward action settles on-chain (set spread)", async ({page}) => {
    await openBank(page, "steward", {steward: true});
    const treasury = page.locator(".card").filter({has: page.getByRole("heading", {name: "Treasury yield"})});

    await treasury.getByPlaceholder("spread %").fill("10");
    await treasury.getByRole("button", {name: "Set spread"}).click();

    // The action is gated by an on-device Clear-Signing approval before it touches the chain.
    await approveOnLedger(page);

    await expect(treasury.getByText(/Spread updated/i)).toBeVisible({timeout: 40_000});
    await expect(treasury.getByText("10%")).toBeVisible();
  });

  test("treasury agent move is gated by Ledger when an action is proposed", async ({page}) => {
    await openBank(page, "steward", {steward: true});
    const agent = page.locator(".card").filter({has: page.getByRole("heading", {name: "Treasury agent"})});

    const execute = agent.getByRole("button", {name: /Approve on Ledger & execute|Execute agent move/});
    if (await execute.isVisible().catch(() => false)) {
      await execute.click();
      await approveOnLedger(page);
      // Either the move executes or the chain rejects it — either way the Ledger gate fired and we
      // get a result notice rather than a silent action.
      await expect(agent.getByText(/approved & executed|Reverted|Rejected/i)).toBeVisible({timeout: 40_000});
    } else {
      // Agent decided to hold (idle reserve within buffer) — assert it surfaced that reasoning.
      await expect(agent.getByText(/hold/i).first()).toBeVisible();
    }
  });
});
