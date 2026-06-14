import {test, expect} from "@playwright/test";
import {BANK_NAME} from "./helpers";

test.describe("Discover & Operator", () => {
  test("landing → discover lists the seeded bank, contract-backed", async ({page}) => {
    await page.goto("/?persona=steward");

    // App chrome.
    await expect(page.locator(".nav")).toContainText("BankOS");
    await expect(page.getByRole("heading", {name: "Discover banks"})).toBeVisible();

    // The system-status pill proves we're reading a real chain, not a simulator.
    await expect(page.locator(".nav")).toContainText(/Contract-backed/i);

    // Seeded bank card with on-chain assets.
    const card = page.locator(".bank-card", {hasText: BANK_NAME}).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Total assets");
    await expect(card.getByText("Checking")).toBeVisible();
    await expect(card.getByText("Yield")).toBeVisible();
    await expect(card.getByText("Credit")).toBeVisible();
  });

  test("operator tab shows the steward's chartered bank + charter form", async ({page}) => {
    await page.goto("/?persona=steward");
    await page.getByRole("button", {name: "Operator"}).click();

    await expect(page.getByRole("heading", {name: /Charter a new bank/i})).toBeVisible();
    await expect(page.getByText("Your banks")).toBeVisible();
    // Steward owns Brooklyn Mutual (from the seed).
    await expect(page.locator(".bank-card", {hasText: BANK_NAME})).toBeVisible();

    // Charter form is wired with product toggles + risk guard-rails.
    await expect(page.getByText("Private checking")).toBeVisible();
    await expect(page.getByText("Treasury yield")).toBeVisible();
    await expect(page.getByText("Global deposit cap (USDC)")).toBeVisible();
    await expect(page.getByRole("button", {name: "Charter bank"})).toBeVisible();
  });
});
