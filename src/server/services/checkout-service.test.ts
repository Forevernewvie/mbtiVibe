import { BillingPeriod, PaymentProvider, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@/lib/errors";
import { CheckoutService } from "@/server/services/checkout-service";
import type { AppUrlResolver, PaymentGateway } from "@/server/types/contracts";

const createCheckoutMock = vi.fn();
const getProviderMock = vi.fn();

type TransactionClientMock = {
  payment: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  subscription: {
    create: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

type PrismaClientMock = {
  assessment: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  price: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

/**
 * Builds service dependencies with injectable prisma/tracker/logger mocks.
 */
function buildServiceContext() {
  const txClient: TransactionClientMock = {
    payment: {
      create: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const prismaClient: PrismaClientMock = {
    assessment: {
      findUnique: vi.fn(),
    },
    price: {
      findUnique: vi.fn(),
    },
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

  const paymentGateway: PaymentGateway = {
    getProvider: getProviderMock,
    createCheckout: createCheckoutMock,
  };

  const appUrlResolver: AppUrlResolver = {
    getAppUrl: () => "http://localhost:3000",
  };

  const service = new CheckoutService({
    prismaClient: prismaClient as unknown as PrismaClient,
    tracker,
    logger,
    paymentGateway,
    appUrlResolver,
    now: () => new Date("2026-03-04T00:00:00.000Z"),
  });

  return {
    service,
    prismaClient,
    txClient,
    tracker,
    logger,
  };
}

describe("CheckoutService", () => {
  beforeEach(() => {
    createCheckoutMock.mockReset();
    getProviderMock.mockReset();
  });

  /**
   * Rejects checkout creation when assessment is missing completion timestamp.
   */
  it("throws bad request error for incomplete assessments", async () => {
    const { service, prismaClient } = buildServiceContext();

    prismaClient.assessment.findUnique.mockResolvedValue({
      id: "assessment-1",
      completedAt: null,
    });
    prismaClient.price.findUnique.mockResolvedValue({
      id: "price-1",
      isActive: true,
      product: { isActive: true },
    });

    getProviderMock.mockReturnValue(PaymentProvider.MANUAL);
    createCheckoutMock.mockResolvedValue({
      externalId: "manual-checkout-1",
      checkoutUrl: "http://localhost:3000/results/assessment-1?demoPaid=1",
    });

    await expect(
      service.createCheckout({
        assessmentId: "assessment-1",
        priceCode: "REPORT_SINGLE_990",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  /**
   * Persists manual monthly purchases atomically and creates active subscription row.
   */
  it("creates payment and subscription within transaction for manual recurring checkout", async () => {
    const { service, prismaClient, txClient, tracker } = buildServiceContext();

    prismaClient.assessment.findUnique.mockResolvedValue({
      id: "assessment-2",
      sessionToken: "session-2",
      userId: null,
      completedAt: new Date("2026-03-03T00:00:00.000Z"),
    });

    prismaClient.price.findUnique.mockResolvedValue({
      id: "price-2",
      code: "COACH_MONTHLY_2990",
      amount: 2990,
      currency: "KRW",
      billingPeriod: BillingPeriod.MONTHLY,
      isActive: true,
      product: { isActive: true },
    });

    getProviderMock.mockReturnValue(PaymentProvider.MANUAL);
    createCheckoutMock.mockResolvedValue({
      externalId: "manual-checkout-2",
      checkoutUrl: "http://localhost:3000/results/assessment-2?demoPaid=1",
    });

    txClient.payment.create.mockResolvedValue({ id: "payment-2" });
    txClient.payment.update.mockResolvedValue({ id: "payment-2" });
    txClient.user.findUnique.mockResolvedValue(null);
    txClient.user.create.mockResolvedValue({ id: "demo-user-1" });
    txClient.subscription.create.mockResolvedValue({ id: "subscription-1" });

    const result = await service.createCheckout({
      assessmentId: "assessment-2",
      priceCode: "COACH_MONTHLY_2990",
      email: "demo@example.com",
    });

    expect(result.demoPaid).toBe(true);
    expect(result.provider).toBe(PaymentProvider.MANUAL);
    expect(result.externalId).toBe("manual-checkout-2");
    expect(prismaClient.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.payment.create).toHaveBeenCalledTimes(1);
    expect(txClient.payment.update).toHaveBeenCalledTimes(1);
    expect(txClient.subscription.create).toHaveBeenCalledTimes(1);
    expect(tracker.track).toHaveBeenCalledTimes(1);
  });
});
