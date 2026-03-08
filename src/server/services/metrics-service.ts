import { AssessmentStatus, PaymentStatus, type PrismaClient } from "@prisma/client";

import { APP_POLICY } from "@/config/app-policy";
import { BadRequestError } from "@/lib/errors";
import type { AdminAccessPolicy } from "@/server/types/contracts";

type MetricsServiceDependencies = {
  prismaClient: MetricsPersistence;
  adminAccessPolicy: AdminAccessPolicy;
  now?: () => Date;
};

type MetricsPersistence = {
  assessment: Pick<PrismaClient["assessment"], "count">;
  payment: Pick<PrismaClient["payment"], "count">;
};

type FunnelCounts = {
  startedAssessments: number;
  completedAssessments: number;
  checkoutCreated: number;
  paidPayments: number;
};

type ConversionRates = {
  completionRateFromStart: number;
  checkoutRateFromCompleted: number;
  paidRateFromCheckout: number;
  paidRateFromStart: number;
};

export type FunnelMetricsOutput = {
  windowDays: number;
  windowStartedAt: string;
  generatedAt: string;
  counts: FunnelCounts;
  rates: ConversionRates;
};

/**
 * Provides conversion-funnel metrics for paid report and subscription flows.
 */
export class MetricsService {
  private readonly prismaClient: MetricsPersistence;
  private readonly adminAccessPolicy: AdminAccessPolicy;
  private readonly now: () => Date;

  constructor(dependencies: MetricsServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.adminAccessPolicy = dependencies.adminAccessPolicy;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * Returns funnel metrics for a rolling day window after admin authorization.
   */
  async getFunnelMetrics(daysInput: number | undefined, adminToken?: string | null): Promise<FunnelMetricsOutput> {
    this.adminAccessPolicy.assertAuthorized(adminToken);

    const windowDays = this.resolveWindowDays(daysInput);
    const now = this.now();
    const windowStartedAt = new Date(now.getTime() - windowDays * APP_POLICY.time.dayMs);

    const [startedAssessments, completedAssessments, checkoutCreated, paidPayments] = await Promise.all([
      this.prismaClient.assessment.count({
        where: {
          startedAt: { gte: windowStartedAt },
        },
      }),
      this.prismaClient.assessment.count({
        where: {
          startedAt: { gte: windowStartedAt },
          status: AssessmentStatus.COMPLETED,
        },
      }),
      this.prismaClient.payment.count({
        where: {
          createdAt: { gte: windowStartedAt },
        },
      }),
      this.prismaClient.payment.count({
        where: {
          status: PaymentStatus.PAID,
          paidAt: { gte: windowStartedAt },
        },
      }),
    ]);

    return {
      windowDays,
      windowStartedAt: windowStartedAt.toISOString(),
      generatedAt: now.toISOString(),
      counts: {
        startedAssessments,
        completedAssessments,
        checkoutCreated,
        paidPayments,
      },
      rates: {
        completionRateFromStart: this.toRate(completedAssessments, startedAssessments),
        checkoutRateFromCompleted: this.toRate(checkoutCreated, completedAssessments),
        paidRateFromCheckout: this.toRate(paidPayments, checkoutCreated),
        paidRateFromStart: this.toRate(paidPayments, startedAssessments),
      },
    };
  }

  /**
   * Parses and validates rolling day window for funnel calculations.
   */
  private resolveWindowDays(daysInput: number | undefined): number {
    if (daysInput === undefined) {
      return APP_POLICY.analytics.funnelDefaultWindowDays;
    }

    if (!Number.isInteger(daysInput)) {
      throw new BadRequestError("days는 정수여야 합니다.", {
        days: daysInput,
      });
    }

    if (
      daysInput < APP_POLICY.analytics.funnelMinWindowDays ||
      daysInput > APP_POLICY.analytics.funnelMaxWindowDays
    ) {
      throw new BadRequestError("days 범위를 벗어났습니다.", {
        min: APP_POLICY.analytics.funnelMinWindowDays,
        max: APP_POLICY.analytics.funnelMaxWindowDays,
      });
    }

    return daysInput;
  }

  /**
   * Converts numerator/denominator values into a 4-decimal ratio.
   */
  private toRate(numerator: number, denominator: number): number {
    if (denominator <= 0) {
      return 0;
    }

    return Number((numerator / denominator).toFixed(4));
  }
}
