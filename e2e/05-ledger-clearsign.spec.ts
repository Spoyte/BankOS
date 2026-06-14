import {test, expect} from "@playwright/test";

/**
 * Ledger Clear-Signing (ERC-7730) UI in isolation, via the `?ledgerPreview=1` affordance — proves the
 * device-screen translation and approve/reject flow without any chain dependency.
 */
test.describe("Ledger Clear-Signing (ERC-7730)", () => {
  test("preview modal renders device screens, shows the descriptor, and signs", async ({page}) => {
    await page.goto("/?persona=steward&ledgerPreview=1");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Ledger Clear Signing")).toBeVisible();
    await expect(dialog.getByText("ERC-7730 · WYSIWYS · steward approval")).toBeVisible();
    await expect(dialog.getByText(/simulated device/i)).toBeVisible();

    // The raw ERC-7730 descriptor is inspectable.
    await dialog.getByRole("button", {name: /Show ERC-7730 descriptor/}).click();
    await expect(dialog.locator(".ledger-json")).toBeVisible();

    // Step through every device screen and approve.
    for (let i = 0; i < 12; i++) {
      const next = dialog.getByRole("button", {name: "Next ▶"});
      if (await next.isVisible().catch(() => false)) await next.click();
      else break;
    }
    await dialog.getByRole("button", {name: /Approve & sign/}).click();
    await expect(dialog).toBeHidden();
  });

  test("reject closes the modal", async ({page}) => {
    await page.goto("/?persona=steward&ledgerPreview=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", {name: "Reject"}).click();
    await expect(dialog).toBeHidden();
  });
});
