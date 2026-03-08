import { describe, expect, it, vi } from "vitest";

import { loadAdminExperimentsPageData } from "@/server/loaders/admin-experiments-page-loader";

/**
 * Creates experiment and metrics service doubles for admin page loading.
 */
function createServicesDouble() {
  return {
    experiment: {
      list: vi.fn(async () => [
        {
          id: "exp-1",
          key: "pricing_hero",
          name: "Pricing hero",
          variants: ["A", "B"],
          isActive: true,
        },
      ]),
    },
    metrics: {
      getFunnelMetrics: vi.fn(async () => ({
        windowDays: 7,
        windowStartedAt: "2026-03-01T00:00:00.000Z",
        generatedAt: "2026-03-08T00:00:00.000Z",
        counts: {
          startedAssessments: 100,
          completedAssessments: 40,
          checkoutCreated: 20,
          paidPayments: 10,
        },
        rates: {
          completionRateFromStart: 0.4,
          checkoutRateFromCompleted: 0.5,
          paidRateFromCheckout: 0.5,
          paidRateFromStart: 0.1,
        },
      })),
    },
  };
}

describe("loadAdminExperimentsPageData", () => {
  /**
   * Returns experiments and funnel metrics when admin token is available.
   */
  it("loads experiments and metrics together", async () => {
    const services = createServicesDouble();

    const result = await loadAdminExperimentsPageData({
      services,
      adminToken: "admin-token",
      windowDays: 7,
    });

    expect(result.experiments).toHaveLength(1);
    expect(result.funnelDashboard.metrics?.counts.paidPayments).toBe(10);
    expect(services.metrics.getFunnelMetrics).toHaveBeenCalledWith(7, "admin-token");
  });

  /**
   * Returns a resilient error state when admin token is unavailable.
   */
  it("returns fallback message when admin token is missing", async () => {
    const services = createServicesDouble();

    const result = await loadAdminExperimentsPageData({
      services,
      adminToken: null,
      windowDays: 7,
    });

    expect(result.funnelDashboard).toEqual({
      metrics: null,
      errorMessage: "ADMIN_API_TOKEN 미설정으로 퍼널 지표를 불러올 수 없습니다.",
    });
    expect(services.metrics.getFunnelMetrics).not.toHaveBeenCalled();
  });
});
