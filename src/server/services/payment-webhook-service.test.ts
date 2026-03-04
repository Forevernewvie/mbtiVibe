import { PaymentProvider, PaymentStatus, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@/lib/errors";
import { PaymentWebhookService } from "@/server/services/payment-webhook-service";

vi.mock("@/lib/env", () => ({
  env: {
    PAYMENT_PROVIDER: "manual",
    STRIPE_SECRET_KEY: undefined,
    STRIPE_WEBHOOK_SECRET: undefined,
  },
}));

type TransactionClientMock = {
  payment: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

type PrismaClientMock = {
  $transaction: ReturnType<typeof vi.fn>;
};

/**
 * Creates webhook service with fully controlled prisma/tracker/logger doubles.
 */
function buildServiceContext() {
  const txClient: TransactionClientMock = {
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const prismaClient: PrismaClientMock = {
    $transaction: vi.fn(async (callback: (tx: TransactionClientMock) => Promise<unknown>) =>
      callback(txClient),
    ),
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
  });

  return {
    service,
    txClient,
    tracker,
    logger,
  };
}

describe("PaymentWebhookService (manual provider)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Rejects malformed webhook requests missing required fields.
   */
  it("throws validation error when externalId or status is missing", async () => {
    const { service } = buildServiceContext();

    const request = new Request("http://localhost/api/webhooks/payment", {
      method: "POST",
      body: JSON.stringify({ externalId: "ext-1" }),
      headers: { "content-type": "application/json" },
    });

    await expect(service.handle(request)).rejects.toBeInstanceOf(BadRequestError);
  });

  /**
   * Applies failed status transition and emits webhook analytics event.
   */
  it("updates payment to FAILED and clears paidAt", async () => {
    const { service, txClient, tracker, logger } = buildServiceContext();

    txClient.payment.findUnique.mockResolvedValue({
      id: "payment-1",
      status: PaymentStatus.PAID,
      provider: PaymentProvider.MANUAL,
      paidAt: new Date("2026-03-03T00:00:00.000Z"),
      assessmentId: "assessment-1",
      userId: null,
    });
    txClient.payment.update.mockResolvedValue({ id: "payment-1" });

    const request = new Request("http://localhost/api/webhooks/payment", {
      method: "POST",
      body: JSON.stringify({
        externalId: "manual-checkout-1",
        status: "FAILED",
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await service.handle(request);

    expect(result).toEqual({ ok: true });
    expect(txClient.payment.update).toHaveBeenCalledTimes(1);
    expect(txClient.payment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: {
        status: PaymentStatus.FAILED,
        paidAt: null,
      },
    });
    expect(tracker.track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payment_webhook_updated",
      }),
    );
    expect(logger.info).toHaveBeenCalled();
  });

  /**
   * Ignores unknown external IDs safely without throwing to callers.
   */
  it("does not fail when payment external id is unknown", async () => {
    const { service, txClient, tracker, logger } = buildServiceContext();

    txClient.payment.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/webhooks/payment", {
      method: "POST",
      body: JSON.stringify({
        externalId: "unknown-external-id",
        status: "PAID",
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await service.handle(request);

    expect(result).toEqual({ ok: true });
    expect(txClient.payment.update).not.toHaveBeenCalled();
    expect(tracker.track).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Webhook payment not found",
      expect.objectContaining({
        externalId: "unknown-external-id",
      }),
    );
  });
});
