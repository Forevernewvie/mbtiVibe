import { describe, expect, it, vi } from "vitest";

import { loadResultPageData } from "@/server/loaders/result-page-loader";

type ResultPersistenceDouble = {
  assessment: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  resultSnapshot: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  actionPlan: {
    findMany: ReturnType<typeof vi.fn>;
  };
  payment: {
    count: ReturnType<typeof vi.fn>;
  };
};

/**
 * Creates a minimal result-page persistence double for loader-state tests.
 */
function createPersistenceDouble(): ResultPersistenceDouble {
  return {
    assessment: {
      findUnique: vi.fn(),
    },
    resultSnapshot: {
      findUnique: vi.fn(),
    },
    actionPlan: {
      findMany: vi.fn(),
    },
    payment: {
      count: vi.fn(),
    },
  };
}

describe("loadResultPageData", () => {
  /**
   * Returns built-in demo state without touching persistence.
   */
  it("returns ready demo state for the demo result id", async () => {
    const persistence = createPersistenceDouble();

    const result = await loadResultPageData({
      assessmentId: "demo",
      prismaClient: persistence as never,
    });

    expect(result.kind).toBe("ready");
    expect(persistence.assessment.findUnique).not.toHaveBeenCalled();
  });

  /**
   * Returns not-found when the assessment or snapshot payload is missing.
   */
  it("returns not-found when assessment data is incomplete", async () => {
    const persistence = createPersistenceDouble();
    persistence.assessment.findUnique.mockResolvedValue(null);
    persistence.resultSnapshot.findUnique.mockResolvedValue(null);
    persistence.actionPlan.findMany.mockResolvedValue([]);
    persistence.payment.count.mockResolvedValue(0);

    const result = await loadResultPageData({
      assessmentId: "missing",
      prismaClient: persistence as never,
    });

    expect(result).toEqual({
      kind: "not-found",
    });
  });

  /**
   * Maps result payload, payment status, and axis scores into a page-ready view model.
   */
  it("returns ready state with parsed axis scores", async () => {
    const persistence = createPersistenceDouble();
    persistence.assessment.findUnique.mockResolvedValue({ id: "assessment-1" });
    persistence.resultSnapshot.findUnique.mockResolvedValue({
      archetype: "실행형 빌더",
      summary: "요약",
      strengths: ["강점"],
      blindSpots: ["약점"],
      axisScores: [{ axis: "ACTION", label: "실행력", score: 80 }],
    });
    persistence.actionPlan.findMany.mockResolvedValue([
      {
        id: "plan-1",
        dayIndex: 1,
        title: "첫 작업",
        details: "설명",
      },
    ]);
    persistence.payment.count.mockResolvedValue(1);

    const result = await loadResultPageData({
      assessmentId: "assessment-1",
      prismaClient: persistence as never,
    });

    expect(result).toEqual({
      kind: "ready",
      assessment: {
        assessmentId: "assessment-1",
        resultSnapshot: {
          archetype: "실행형 빌더",
          summary: "요약",
          strengths: ["강점"],
          blindSpots: ["약점"],
          axisScores: [{ axis: "ACTION", label: "실행력", score: 80 }],
        },
        actionPlans: [
          {
            id: "plan-1",
            dayIndex: 1,
            title: "첫 작업",
            details: "설명",
          },
        ],
        paid: true,
      },
      axisScores: [
        {
          axis: "ACTION",
          label: "실행력",
          score: 80,
        },
      ],
    });
  });
});
