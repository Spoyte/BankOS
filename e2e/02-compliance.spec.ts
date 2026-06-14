import {test, expect} from "@playwright/test";
import {openBank} from "./helpers";

/**
 * Chainlink CRE compliance: a sanctioned jurisdiction is declined; a clean applicant is approved and
 * an eligibility Policy is attested on-chain. Driven as "Dave", the un-onboarded seed persona.
 */
test.describe("Compliance (Chainlink CRE)", () => {
  test("dave onboards: KP rejected, US approved → eligible on-chain", async ({page}) => {
    await openBank(page, "dave");

    const compliance = page.locator(".card", {hasText: "Compliance"}).first();
    await expect(compliance).toBeVisible();

    const alreadyEligible = await compliance
      .getByText(/Eligible · tier/i)
      .isVisible()
      .catch(() => false);

    if (!alreadyEligible) {
      await compliance.getByRole("button", {name: "Start onboarding"}).click();

      // 1) Sanctioned jurisdiction is rejected by the CRE workflow.
      await compliance.getByLabel("Country (ISO-2)").fill("KP");
      await compliance.getByRole("button", {name: "Submit to CRE workflow"}).click();
      await expect(compliance.getByText(/Declined/i)).toBeVisible();

      // 2) Clean applicant is approved; policy attested on-chain.
      await compliance.getByLabel("Country (ISO-2)").fill("US");
      await compliance.getByRole("button", {name: "Submit to CRE workflow"}).click();
    }

    await expect(compliance.getByText(/Eligible · tier/i)).toBeVisible();
    await expect(compliance.getByText(/never your PII/i)).toBeVisible();
  });
});
