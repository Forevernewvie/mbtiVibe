import { type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { MetricsService } from "@/server/services/metrics-service";
import type { AdminAccessPolicy } from "@/server/types/contracts";

type PrismaClientMock = {
  assessment: {
    count: ReturnType<typeof vi.fn>;
  };
  payment: {
    count: ReturnType<typeof vi.fn>;
  };
};

/**
 * Builds isolated MetricsService instance with deterministic now() and mock counts.
 */
function buildServiceContext() {
  const prismaClient: PrismaClientMock = {
    assessment: {
      count: vi.fn(),
    },
    payment: {
      count: vi.fn(),
    },
  };
  const adminAccessPolicy: AdminAccessPolicy = {
    assertAuthorized: vi.fn(),
  };

  const service = new MetricsService({
    prismaClient: prismaClient as unknown as PrismaClient,
    adminAccessPolicy,
    now: () => new Date("2026-03-04T00:00:00.000Z"),
  });

  return {
    service,
    prismaClient,
    adminAccessPolicy,
  };
}

describe("MetricsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Blocks unauthorized metric reads when admin token mismatches configured token.
   */
  it("throws unauthorized error for invalid token", async () => {
    const { service, adminAccessPolicy } = buildServiceContext();

    vi.mocked(adminAccessPolicy.assertAuthorized).mockImplementation(() => {
      throw new UnauthorizedError("Unauthorized");
    });

    await expect(service.getFunnelMetrics(undefined, "invalid-token")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  /**
   * Returns computed conversion rates from funnel counts in the requested window.
   */
  it("computes funnel rates using count queries", async () => {
    const { service, prismaClient, adminAccessPolicy } = buildServiceContext();

    prismaClient.assessment.count.mockResolvedValueOnce(100).mockResolvedValueOnce(40);
    prismaClient.payment.count.mockResolvedValueOnce(20).mockResolvedValueOnce(10);

    const result = await service.getFunnelMetrics(7, "admin-secret-token");

    expect(result.windowDays).toBe(7);
    expect(result.counts).toEqual({
      startedAssessments: 100,
      completedAssessments: 40,
      checkoutCreated: 20,
      paidPayments: 10,
    });
    expect(result.rates).toEqual({
      completionRateFromStart: 0.4,
      checkoutRateFromCompleted: 0.5,
      paidRateFromCheckout: 0.5,
      paidRateFromStart: 0.1,
    });
    expect(adminAccessPolicy.assertAuthorized).toHaveBeenCalledWith("admin-secret-token");
    expect(prismaClient.assessment.count).toHaveBeenCalledTimes(2);
    expect(prismaClient.payment.count).toHaveBeenCalledTimes(2);
  });

  /**
   * Rejects non-integer or out-of-range day window values.
   */
  it("throws bad request for invalid day window", async () => {
    const { service } = buildServiceContext();

    await expect(service.getFunnelMetrics(0, "admin-secret-token")).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(service.getFunnelMetrics(7.5, "admin-secret-token")).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });
});
