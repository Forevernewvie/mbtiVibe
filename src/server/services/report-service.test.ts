import { PaymentStatus, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentRequiredError } from "@/lib/errors";
import { buildReportPdf } from "@/lib/report";
import { ReportService } from "@/server/services/report-service";

vi.mock("@/lib/report", () => ({
  buildReportPdf: vi.fn(),
}));

type PrismaClientMock = {
  assessment: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

/**
 * Builds report service with isolated persistence and PDF renderer doubles.
 */
function buildServiceContext() {
  const prismaClient: PrismaClientMock = {
    assessment: {
      findUnique: vi.fn(),
    },
  };

  const service = new ReportService({
    prismaClient: prismaClient as unknown as PrismaClient,
  });

  return {
    service,
    prismaClient,
  };
}

describe("ReportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Blocks paid report downloads until a paid payment exists or demo override is enabled.
   */
  it("rejects unpaid report download attempts", async () => {
    const { service, prismaClient } = buildServiceContext();

    prismaClient.assessment.findUnique.mockResolvedValue({
      id: "assessment-1",
      resultSnapshot: {
        archetype: "Explorer",
        summary: "Summary",
        axisScores: [],
        strengths: [],
        blindSpots: [],
        recommendedNext: [],
      },
      actionPlans: [],
      payments: [],
    });

    await expect(service.buildDownloadableReport("assessment-1", false)).rejects.toBeInstanceOf(
      PaymentRequiredError,
    );
  });

  /**
   * Builds PDF payload from stored snapshot data once paid access is satisfied.
   */
  it("builds report pdf with normalized snapshot payloads", async () => {
    const { service, prismaClient } = buildServiceContext();

    prismaClient.assessment.findUnique.mockResolvedValue({
      id: "assessment-2",
      resultSnapshot: {
        archetype: "Strategist",
        summary: "Detailed summary",
        axisScores: [{ label: "Energy", score: 88 }],
        strengths: ["Focus"],
        blindSpots: ["Pacing"],
        recommendedNext: [{ day: 1, title: "Pause", details: "Rest briefly" }],
      },
      actionPlans: [],
      payments: [{ id: "pay-1", status: PaymentStatus.PAID }],
    });

    vi.mocked(buildReportPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));

    const result = await service.buildDownloadableReport("assessment-2", false);

    expect(buildReportPdf).toHaveBeenCalledWith({
      assessmentId: "assessment-2",
      archetype: "Strategist",
      summary: "Detailed summary",
      axisScores: [{ label: "Energy", score: 88 }],
      strengths: ["Focus"],
      blindSpots: ["Pacing"],
      actionPlans: [{ day: 1, title: "Pause", details: "Rest briefly" }],
    });
    expect(result).toEqual({
      pdf: new Uint8Array([1, 2, 3]),
      filename: "growth-report-assessment-2.pdf",
    });
  });
});
