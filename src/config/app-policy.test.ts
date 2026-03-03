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
    expect(APP_POLICY.pricing.report.amount).toBeGreaterThan(0);
    expect(APP_POLICY.pricing.coachingMonthly.amount).toBeGreaterThan(0);
    expect(APP_POLICY.pricing.report.code.length).toBeGreaterThan(0);
    expect(APP_POLICY.pricing.coachingMonthly.code.length).toBeGreaterThan(0);
  });

  /**
   * Ensures KRW formatter includes currency symbol.
   */
  it("formats KRW values", () => {
    expect(formatKrw(990)).toBe("₩990");
    expect(formatKrw(2990)).toBe("₩2,990");
  });
});
