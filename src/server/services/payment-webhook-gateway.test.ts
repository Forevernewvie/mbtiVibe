import { PaymentProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  ManualPaymentWebhookGateway,
  PaymentWebhookGatewayRegistry,
} from "@/server/services/payment-webhook-gateway";
import type { PaymentWebhookGateway } from "@/server/types/contracts";

/**
 * Creates a minimal webhook parser double for registry delegation checks.
 */
function createGatewayDouble(responseBody: Record<string, unknown>): PaymentWebhookGateway {
  return {
    parse: vi.fn(async () => ({
      responseBody,
      paymentUpdates: [],
      subscriptionUpdates: [],
      logContext: {},
    })),
  };
}

describe("PaymentWebhookGatewayRegistry", () => {
  /**
   * Delegates to the strategy matching the configured provider.
   */
  it("routes requests to the active provider strategy", async () => {
    const stripeGateway = createGatewayDouble({ received: true });
    const registry = new PaymentWebhookGatewayRegistry(PaymentProvider.STRIPE, {
      [PaymentProvider.MANUAL]: new ManualPaymentWebhookGateway(),
      [PaymentProvider.STRIPE]: stripeGateway,
    });

    const request = new Request("http://localhost/api/webhooks/payment", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "ignored-in-double",
      },
    });

    const result = await registry.parse(request);

    expect(result).toEqual({
      responseBody: { received: true },
      paymentUpdates: [],
      subscriptionUpdates: [],
      logContext: {},
    });
    expect(stripeGateway.parse).toHaveBeenCalledTimes(1);
  });

  /**
   * Fails fast when the configured provider strategy is not registered.
   */
  it("throws when the provider strategy is missing", async () => {
    const registry = new PaymentWebhookGatewayRegistry(PaymentProvider.STRIPE, {
      [PaymentProvider.MANUAL]: new ManualPaymentWebhookGateway(),
    });

    await expect(
      registry.parse(
        new Request("http://localhost/api/webhooks/payment", {
          method: "POST",
          body: "{}",
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    ).rejects.toThrow(/Unsupported payment webhook provider/);
  });
});
