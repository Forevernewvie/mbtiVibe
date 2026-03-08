import { describe, expect, it, vi } from "vitest";

import { loadDashboardPageData } from "@/server/loaders/dashboard-page-loader";

type DashboardPersistenceDouble = {
  assessment: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

/**
 * Creates a minimal dashboard persistence double for loader-state tests.
 */
function createPersistenceDouble(): DashboardPersistenceDouble {
  return {
    assessment: {
      findFirst: vi.fn(),
    },
  };
}

describe("loadDashboardPageData", () => {
  /**
   * Returns missing-session state without touching persistence when no session token exists.
   */
  it("returns missing-session when the user has no session token", async () => {
    const persistence = createPersistenceDouble();

    const result = await loadDashboardPageData({
      prismaClient: persistence as never,
      sessionToken: null,
    });

    expect(result).toEqual({
      kind: "missing-session",
    });
    expect(persistence.assessment.findFirst).not.toHaveBeenCalled();
  });

  /**
   * Returns missing-assessment when no completed assessment exists for the session.
   */
  it("returns missing-assessment when no completed assessment is found", async () => {
    const persistence = createPersistenceDouble();
    persistence.assessment.findFirst.mockResolvedValue(null);

    const result = await loadDashboardPageData({
      prismaClient: persistence as never,
      sessionToken: "session-1",
    });

    expect(result).toEqual({
      kind: "missing-assessment",
    });
  });

  /**
   * Maps the latest completed assessment into a page-ready dashboard view model.
   */
  it("returns ready state with mapped plans and weekly checkins", async () => {
    const persistence = createPersistenceDouble();
    persistence.assessment.findFirst.mockResolvedValue({
      id: "assessment-1",
      resultSnapshot: {
        archetype: "실행형 빌더",
        summary: "요약",
      },
      actionPlans: [
        {
          id: "plan-1",
          dayIndex: 1,
          title: "첫 작업",
          details: "설명",
          completed: false,
        },
      ],
      weeklyCheckins: [
        {
          id: "checkin-1",
          executionScore: 4,
          focusScore: 5,
          confidenceScore: 3,
          note: "회고",
        },
      ],
    });

    const result = await loadDashboardPageData({
      prismaClient: persistence as never,
      sessionToken: "session-1",
    });

    expect(result).toEqual({
      kind: "ready",
      assessmentId: "assessment-1",
      archetype: "실행형 빌더",
      summary: "요약",
      plans: [
        {
          id: "plan-1",
          dayIndex: 1,
          title: "첫 작업",
          details: "설명",
          completed: false,
        },
      ],
      weeklyCheckins: [
        {
          id: "checkin-1",
          executionScore: 4,
          focusScore: 5,
          confidenceScore: 3,
          note: "회고",
        },
      ],
    });
  });
});
