import {test, expect} from "@playwright/test";
import {openBank} from "./helpers";

/**
 * Member view proves three shipped features for an eligible member (Alice, from the seed):
 *   #2 private-by-default  — the shielded Unlink balance is the headline; checking is "optional · public"
 *   #3 yield-bearing deposits — checking surfaces claimable "Earned savings (yield)"
 *   Unlink privacy — derive a real private account and shield USDC into the on-chain PrivacyPool
 *
 * The private-account path exercises @unlink-xyz/sdk EdDSA in the browser (which required the
 * createRequire/Buffer shims in vite.config.ts + polyfills.ts to work at all).
 */
test.describe("Member: private-by-default + yield (Unlink)", () => {
  test("private balance is the default; checking is optional/public with yield", async ({page}) => {
    await openBank(page, "alice");

    const priv = page.locator(".card").filter({has: page.getByRole("heading", {name: "Private balance"})});
    await expect(priv).toBeVisible();
    await expect(priv.getByText("default", {exact: true})).toBeVisible();
    await expect(priv.getByText("Unlink", {exact: true})).toBeVisible();

    const checking = page.locator(".card").filter({has: page.getByRole("heading", {name: "Transparent checking"})});
    await expect(checking.getByText(/optional · public/i)).toBeVisible();
    await expect(checking.getByText(/Earned savings \(yield\)/i)).toBeVisible();
  });

  test("member derives a private Unlink account and shields USDC on-chain", async ({page}) => {
    await openBank(page, "alice");
    const priv = page.locator(".card").filter({has: page.getByRole("heading", {name: "Private balance"})});

    // 1) Set up the private account FIRST (needs only gas). Waiting for the button also waits for the
    //    member's on-chain eligibility policy to load. Doing this before the faucet avoids a nonce race
    //    between the faucet mint and the registerMember tx (which would hang waitForTransactionReceipt).
    const setup = priv.getByRole("button", {name: "Set up private account"});
    await expect(setup).toBeVisible({timeout: 25_000});
    await setup.click();
    // Success notice is the reliable readiness signal (real EdDSA derive + engine register + on-chain).
    await expect(priv.getByText(/Private account ready/i)).toBeVisible({timeout: 60_000});
    await expect(priv.getByText(/Your unlink address/i)).toBeVisible();

    // 2) Fund the wallet — members spend their whole minted balance into the bank during seeding.
    await page.getByRole("button", {name: "Faucet"}).click();
    await expect(page.locator(".wallet .chip")).toContainText(/,\d{3}/, {timeout: 30_000});

    // 3) Shield 250 USDC into the on-chain PrivacyPool via the Unlink engine.
    await priv.locator(".inline-input", {hasText: "Shield"}).locator("input").fill("250");
    await priv.getByRole("button", {name: "Shield", exact: true}).click();
    await expect(priv.getByText(/Shielded 250 USDC/i)).toBeVisible({timeout: 60_000});
  });
});
