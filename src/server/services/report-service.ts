import { PaymentStatus, type PrismaClient } from "@prisma/client";

import { APP_POLICY } from "@/config/app-policy";
import { NotFoundError, PaymentRequiredError } from "@/lib/errors";
import { buildReportPdf } from "@/lib/report";

type ReportServiceDependencies = {
  prismaClient: ReportPersistence;
};

type ReportPersistence = {
  assessment: Pick<PrismaClient["assessment"], "findUnique">;
};

type AxisScorePayload = Array<{ label: string; score: number }>;
type ActionPayload = Array<{ day: number; title: string; details: string }>;

/**
 * Handles paid report access validation and PDF content assembly.
 */
export class ReportService {
  private readonly prismaClient: ReportPersistence;

  constructor(dependencies: ReportServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
  }

  /**
   * Builds downloadable report PDF after validating payment conditions.
   */
  async buildDownloadableReport(assessmentId: string, forceDemoPaid: boolean) {
    const assessment = await this.prismaClient.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        resultSnapshot: true,
        actionPlans: {
          orderBy: {
            dayIndex: "asc",
          },
        },
        payments: {
          where: {
            status: PaymentStatus.PAID,
          },
        },
      },
    });

    if (!assessment || !assessment.resultSnapshot) {
      throw new NotFoundError("리포트를 찾을 수 없습니다.", {
        assessmentId,
      });
    }

    const isPaid = forceDemoPaid || assessment.payments.length > 0;

    if (!isPaid) {
      throw new PaymentRequiredError("유료 리포트 결제가 필요합니다.", {
        checkoutHint: APP_POLICY.pricing.reportCheckoutHintCode,
      });
    }

    const axisScores = this.toAxisPayload(assessment.resultSnapshot.axisScores);
    const recommendedNext = this.toActionPayload(assessment.resultSnapshot.recommendedNext);

    const pdf = await buildReportPdf({
      assessmentId: assessment.id,
      archetype: assessment.resultSnapshot.archetype,
      summary: assessment.resultSnapshot.summary,
      axisScores,
      strengths: assessment.resultSnapshot.strengths,
      blindSpots: assessment.resultSnapshot.blindSpots,
      actionPlans:
        assessment.actionPlans.length > 0
          ? assessment.actionPlans.map((plan) => ({
              day: plan.dayIndex,
              title: plan.title,
              details: plan.details,
            }))
          : recommendedNext,
    });

    return {
      pdf,
      filename: `growth-report-${assessment.id}.pdf`,
    };
  }

  /**
   * Safely converts untyped JSON payload into axis score array.
   */
  private toAxisPayload(value: unknown): AxisScorePayload {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        "score" in item &&
        typeof item.label === "string" &&
        typeof item.score === "number"
      ) {
        return [{ label: item.label, score: item.score }];
      }

      return [];
    });
  }

  /**
   * Safely converts untyped JSON payload into action-plan array.
   */
  private toActionPayload(value: unknown): ActionPayload {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (
        typeof item === "object" &&
        item !== null &&
        "day" in item &&
        "title" in item &&
        "details" in item &&
        typeof item.day === "number" &&
        typeof item.title === "string" &&
        typeof item.details === "string"
      ) {
        return [{ day: item.day, title: item.title, details: item.details }];
      }

      return [];
    });
  }
}
