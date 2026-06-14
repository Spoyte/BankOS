import {expect, type Page} from "@playwright/test";

export const BANK_NAME = "Brooklyn Mutual";

/** Personas are anvil keys read from `?persona=` by the WalletContext. */
export type Persona = "steward" | "alice" | "bob" | "dave";

/**
 * Open the seeded bank's detail page as a given persona. We navigate by query param (deterministic
 * wallet selection) and click the bank card by name, so no contract address is hard-coded — the suite
 * survives demo.sh's fresh redeploys.
 */
export async function openBank(page: Page, persona: Persona, opts: {steward?: boolean} = {}) {
  const tab = opts.steward ? "&tab=steward" : "";
  await page.goto(`/?persona=${persona}${tab}`);
  await expect(page.getByRole("heading", {name: "Discover banks"})).toBeVisible();
  const card = page.locator(".bank-card", {hasText: BANK_NAME}).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", {name: BANK_NAME})).toBeVisible();
}

/** Step through the simulated Ledger Clear-Signing modal and approve (sign) the transaction. */
export async function approveOnLedger(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Ledger Clear Signing")).toBeVisible();
  // Advance through every device screen, then sign.
  for (let i = 0; i < 12; i++) {
    const next = dialog.getByRole("button", {name: "Next ▶"});
    if (await next.isVisible().catch(() => false)) {
      await next.click();
    } else {
      break;
    }
  }
  await dialog.getByRole("button", {name: /Approve & sign/}).click();
  await expect(dialog).toBeHidden();
}
