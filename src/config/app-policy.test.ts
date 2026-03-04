import { describe, expect, it } from "vitest";

import { APP_POLICY, formatKrw } from "@/config/app-policy";

/**
 * Verifies pricing and formatting constants used by UI and seed scripts.
 */
describe("APP_POLICY pricing", () => {
  /**
   * Ensures paid prices are positive and aligned with configured codes.
   */
  it("contains valid positive amounts", () => {
    expect(APP_POLICY.pricing.report.amount).toBe(990);
    expect(APP_POLICY.pricing.coachingMonthly.amount).toBe(2990);
    expect(APP_POLICY.pricing.report.code.length).toBeGreaterThan(0);
    expect(APP_POLICY.pricing.coachingMonthly.code.length).toBeGreaterThan(0);
    expect(APP_POLICY.pricing.report.code.endsWith(String(APP_POLICY.pricing.report.amount))).toBe(true);
    expect(
      APP_POLICY.pricing.coachingMonthly.code.endsWith(
        String(APP_POLICY.pricing.coachingMonthly.amount),
      ),
    ).toBe(true);
    expect(APP_POLICY.pricing.reportCheckoutHintCode).toBe(APP_POLICY.pricing.report.code);
  });

  /**
   * Ensures KRW formatter includes currency symbol.
   */
  it("formats KRW values", () => {
    expect(formatKrw(990)).toBe("₩990");
    expect(formatKrw(2990)).toBe("₩2,990");
  });
});
