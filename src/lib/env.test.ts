import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
type EnvOverrides = Partial<NodeJS.ProcessEnv>;

/**
 * Resets imported env module and restores process env between cases.
 */
async function loadEnvModule(overrides: EnvOverrides) {
  vi.resetModules();
  process.env = { ...originalEnv };
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    APP_URL: "http://localhost:3000",
    PAYMENT_PROVIDER: "manual",
  });
  Object.assign(process.env, overrides);

  return import("@/lib/env");
}

describe("env", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  /**
   * Rejects startup when Stripe is selected without required secrets.
   */
  it("requires Stripe secrets when provider is stripe", async () => {
    await expect(
      loadEnvModule({
        PAYMENT_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
      }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);
  });

  /**
   * Accepts Stripe configuration when all provider-specific secrets are present.
   */
  it("accepts Stripe configuration when required secrets exist", async () => {
    const envModule = await loadEnvModule({
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test_123",
    });

    expect(envModule.env.PAYMENT_PROVIDER).toBe("stripe");
    expect(envModule.env.STRIPE_SECRET_KEY).toBe("sk_test_123");
  });
});
