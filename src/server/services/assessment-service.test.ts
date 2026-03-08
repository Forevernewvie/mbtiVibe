import { Axis, AssessmentStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AssessmentService } from "@/server/services/assessment-service";
import type { AssessmentScorer } from "@/server/types/contracts";

type TransactionClientMock = {
  assessment: {
    update: ReturnType<typeof vi.fn>;
  };
  resultSnapshot: {
    upsert: ReturnType<typeof vi.fn>;
  };
  actionPlan: {
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

type PrismaClientMock = {
  assessment: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  question: {
    findMany: ReturnType<typeof vi.fn>;
  };
  response: {
    upsert: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  choice: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  weeklyCheckin: {
    create: ReturnType<typeof vi.fn>;
  };
  actionPlan: {
    count: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

/**
 * Creates assessment service with fully controlled dependency doubles.
 */
function buildServiceContext() {
  const txClient: TransactionClientMock = {
    assessment: {
      update: vi.fn(),
    },
    resultSnapshot: {
      upsert: vi.fn(),
    },
    actionPlan: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  };

  const prismaClient: PrismaClientMock = {
    assessment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
    },
    response: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
    choice: {
      findUnique: vi.fn(),
    },
    weeklyCheckin: {
      create: vi.fn(),
    },
    actionPlan: {
      count: vi.fn(),
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

  const scorer: AssessmentScorer = {
    calculate: vi.fn(),
  };

  const service = new AssessmentService({
    prismaClient: prismaClient as unknown as PrismaClient,
    tracker,
    logger,
    scorer,
    idGenerator: () => "generated-session-token",
    now: () => new Date("2026-03-08T00:00:00.000Z"),
  });

  return {
    service,
    prismaClient,
    txClient,
    tracker,
    logger,
    scorer,
  };
}

describe("AssessmentService", () => {
  /**
   * Starts a new assessment and maps active questions into response payload.
   */
  it("creates assessment when no in-progress session exists", async () => {
    const { service, prismaClient, tracker, logger } = buildServiceContext();

    prismaClient.assessment.findFirst.mockResolvedValue(null);
    prismaClient.assessment.create.mockResolvedValue({
      id: "assessment-1",
      sessionToken: "generated-session-token",
      currentQuestion: 0,
    });
    prismaClient.question.findMany.mockResolvedValue([
      {
        id: "question-1",
        order: 1,
        prompt: "질문",
        axis: Axis.ACTION,
        choices: [
          {
            id: "choice-1",
            label: "선택",
            value: 5,
          },
        ],
      },
    ]);

    const result = await service.startAssessment({
      locale: "ko-KR",
    });

    expect(result.assessmentId).toBe("assessment-1");
    expect(result.questions).toHaveLength(1);
    expect(prismaClient.assessment.create).toHaveBeenCalledWith({
      data: {
        sessionToken: "generated-session-token",
        status: AssessmentStatus.IN_PROGRESS,
        locale: "ko-KR",
      },
    });
    expect(tracker.track).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  /**
   * Finalizes assessment using injected scorer and persists snapshot/action plan transactionally.
   */
  it("completes assessment with injected scorer output", async () => {
    const { service, prismaClient, txClient, tracker, scorer } = buildServiceContext();

    prismaClient.assessment.findUnique.mockResolvedValue({
      id: "assessment-2",
      sessionToken: "session-2",
      status: AssessmentStatus.IN_PROGRESS,
      responses: [
        {
          question: { axis: Axis.ACTION },
          choice: { value: 5 },
        },
      ],
      resultSnapshot: null,
    });

    vi.mocked(scorer.calculate).mockReturnValue({
      archetype: "실행형",
      summary: "요약",
      strengths: ["강점"],
      blindSpots: ["약점"],
      axisScores: [
        {
          axis: Axis.ACTION,
          score: 80,
          label: "실행력",
          description: "설명",
        },
      ],
      recommendedNext: [
        {
          day: 1,
          title: "첫 액션",
          details: "상세",
        },
      ],
    });

    txClient.assessment.update.mockResolvedValue(undefined);
    txClient.resultSnapshot.upsert.mockResolvedValue({
      id: "result-2",
      archetype: "실행형",
    });
    txClient.actionPlan.deleteMany.mockResolvedValue({ count: 0 });
    txClient.actionPlan.createMany.mockResolvedValue({ count: 1 });

    const result = await service.completeAssessment({
      assessmentId: "assessment-2",
    });

    expect(result.resultId).toBe("result-2");
    expect(scorer.calculate).toHaveBeenCalledTimes(1);
    expect(prismaClient.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.resultSnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(txClient.actionPlan.createMany).toHaveBeenCalledTimes(1);
    expect(tracker.track).toHaveBeenCalledTimes(1);
  });
});
