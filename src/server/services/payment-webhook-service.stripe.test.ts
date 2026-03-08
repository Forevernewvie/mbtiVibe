import Stripe from "stripe";
import { PaymentProvider, PaymentStatus, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@/lib/errors";
import { EnvPaymentWebhookGateway } from "@/server/services/payment-webhook-gateway";
import { PaymentWebhookService } from "@/server/services/payment-webhook-service";

const STRIPE_WEBHOOK_SECRET = vi.hoisted(() => "whsec_test_secret_key");

vi.mock("@/lib/env", () => ({
  env: {
    PAYMENT_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_test_123456789",
    STRIPE_WEBHOOK_SECRET,
  },
}));

type TransactionClientMock = {
  payment: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  subscription: {
    updateMany: ReturnType<typeof vi.fn>;
  };
};

type PrismaClientMock = {
  $transaction: ReturnType<typeof vi.fn>;
  subscription: {
    updateMany: ReturnType<typeof vi.fn>;
  };
};

/**
 * Creates Stripe webhook service with injectable persistence and analytics doubles.
 */
function buildServiceContext() {
  const txClient: TransactionClientMock = {
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      updateMany: vi.fn(),
    },
  };

  const prismaClient: PrismaClientMock = {
    $transaction: vi.fn(async (callback: (tx: TransactionClientMock) => Promise<unknown>) =>
      callback(txClient),
    ),
    subscription: {
      updateMany: vi.fn(),
    },
  };

  const tracker = {
    track: vi.fn(async () => undefined),
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const service = new PaymentWebhookService({
    prismaClient: prismaClient as unknown as PrismaClient,
    tracker,
    logger,
    webhookGateway: new EnvPaymentWebhookGateway(),
  });

  return {
    service,
    txClient,
    tracker,
    logger,
  };
}

/**
 * Creates signed Stripe webhook request payload for realistic signature verification.
 */
function buildSignedStripeRequest(
  event: Stripe.Event,
  overrideSignature?: string,
): Request {
  const payload = JSON.stringify(event);
  const signature =
    overrideSignature ??
    Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: STRIPE_WEBHOOK_SECRET,
    });

  return new Request("http://localhost/api/webhooks/payment", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
  });
}

describe("PaymentWebhookService (stripe signature E2E)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Accepts valid signed checkout completion event and marks payment as paid.
   */
  it("processes signed checkout completion webhook successfully", async () => {
    const { service, txClient, tracker } = buildServiceContext();

    txClient.payment.findUnique.mockResolvedValue({
      id: "payment-stripe-1",
      status: PaymentStatus.PENDING,
      provider: PaymentProvider.STRIPE,
      paidAt: null,
      assessmentId: "assessment-1",
      userId: null,
    });
    txClient.payment.update.mockResolvedValue({ id: "payment-stripe-1" });

    const request = buildSignedStripeRequest({
      id: "evt_checkout_completed_1",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_checkout_1",
          object: "checkout.session",
        } as Stripe.Checkout.Session,
      },
    } as Stripe.Event);

    const result = await service.handle(request);

    expect(result).toEqual({ received: true });
    expect(txClient.payment.update).toHaveBeenCalledTimes(1);
    expect(tracker.track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payment_webhook_updated",
      }),
    );
  });

  /**
   * Rejects webhook with invalid signature to block forged Stripe payloads.
   */
  it("throws bad request for invalid signature", async () => {
    const { service } = buildServiceContext();

    const request = buildSignedStripeRequest(
      {
        id: "evt_checkout_completed_2",
        object: "event",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_checkout_2",
            object: "checkout.session",
          } as Stripe.Checkout.Session,
        },
      } as Stripe.Event,
      "t=123,v1=invalid-signature",
    );

    await expect(service.handle(request)).rejects.toBeInstanceOf(BadRequestError);
  });

  /**
   * Handles duplicate delivery idempotently by ignoring already-applied payment status.
   */
  it("ignores duplicate retry webhook when status is already applied", async () => {
    const { service, txClient, tracker } = buildServiceContext();

    const paidAt = new Date("2026-03-04T00:00:00.000Z");

    txClient.payment.findUnique
      .mockResolvedValueOnce({
        id: "payment-stripe-3",
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.STRIPE,
        paidAt: null,
        assessmentId: "assessment-3",
        userId: null,
      })
      .mockResolvedValueOnce({
        id: "payment-stripe-3",
        status: PaymentStatus.PAID,
        provider: PaymentProvider.STRIPE,
        paidAt,
        assessmentId: "assessment-3",
        userId: null,
      });

    txClient.payment.update.mockResolvedValue({ id: "payment-stripe-3" });

    const event = {
      id: "evt_checkout_completed_retry",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_checkout_retry",
          object: "checkout.session",
        } as Stripe.Checkout.Session,
      },
    } as Stripe.Event;

    await service.handle(buildSignedStripeRequest(event));
    await service.handle(buildSignedStripeRequest(event));

    expect(txClient.payment.update).toHaveBeenCalledTimes(1);
    expect(tracker.track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payment_webhook_updated",
      }),
    );
    expect(tracker.track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payment_webhook_ignored",
      }),
    );
  });
});
