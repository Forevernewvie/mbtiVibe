import { describe, expect, it } from "vitest";

import { mapServerRuntimeConfig } from "@/server/services/server-runtime-config";

describe("server-runtime-config", () => {
  /**
   * Maps development runtime input into readable adapter configuration with safe defaults.
   */
  it("builds database and analytics defaults for development", () => {
    const result = mapServerRuntimeConfig({
      nodeEnv: "development",
      databaseUrl: "postgres://localhost:5432/test",
      appUrl: "http://localhost:3000",
      paymentProvider: "manual",
    });

    expect(result.database).toEqual({
      connectionString: "postgres://localhost:5432/test",
      logLevels: ["error", "warn"],
      reuseGlobalClient: true,
    });
    expect(result.analytics).toEqual({
      posthogKey: undefined,
      posthogHost: "https://app.posthog.com",
    });
  });

  /**
   * Disables Prisma global reuse in production and preserves explicit analytics host overrides.
   */
  it("preserves production-specific runtime settings", () => {
    const result = mapServerRuntimeConfig({
      nodeEnv: "production",
      databaseUrl: "postgres://db.example.com:5432/app",
      appUrl: "https://app.example.com",
      paymentProvider: "stripe",
      posthogKey: "phc_test_key",
      posthogHost: "https://eu.i.posthog.com",
      stripeSecretKey: "sk_live_123",
      stripeWebhookSecret: "whsec_live_123",
    });

    expect(result.database).toEqual({
      connectionString: "postgres://db.example.com:5432/app",
      logLevels: ["error"],
      reuseGlobalClient: false,
    });
    expect(result.analytics).toEqual({
      posthogKey: "phc_test_key",
      posthogHost: "https://eu.i.posthog.com",
    });
    expect(result.paymentProvider).toBe("stripe");
  });
});
