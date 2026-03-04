import { randomUUID } from "node:crypto";

import { AssessmentStatus, PrismaClient } from "@prisma/client";

import { APP_POLICY } from "@/config/app-policy";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import { calculateScores } from "@/lib/scoring";
import type { EventTracker } from "@/server/types/contracts";

type AssessmentServiceDependencies = {
  prismaClient: PrismaClient;
  tracker: EventTracker;
  logger: Logger;
  idGenerator?: () => string;
  now?: () => Date;
};

export type StartAssessmentInput = {
  sessionToken?: string;
  locale: string;
};

export type StartAssessmentOutput = {
  assessmentId: string;
  sessionToken: string;
  currentQuestion: number;
  totalQuestions: number;
  questions: Array<{
    id: string;
    order: number;
    prompt: string;
    axis: string;
    choices: Array<{ id: string; label: string; value: number }>;
  }>;
};

export type AnswerAssessmentInput = {
  assessmentId: string;
  questionId: string;
  choiceId: string;
};

export type CompleteAssessmentInput = {
  assessmentId: string;
};

export type WeeklyCheckinInput = {
  assessmentId: string;
  executionScore: number;
  focusScore: number;
  confidenceScore: number;
  note?: string;
};

/**
 * Encapsulates assessment lifecycle workflows and persistence interactions.
 */
export class AssessmentService {
  private readonly prismaClient: PrismaClient;
  private readonly tracker: EventTracker;
  private readonly logger: Logger;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;

  constructor(dependencies: AssessmentServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.tracker = dependencies.tracker;
    this.logger = dependencies.logger;
    this.idGenerator = dependencies.idGenerator ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * Starts a new assessment or resumes active one by session token.
   */
  async startAssessment(input: StartAssessmentInput): Promise<StartAssessmentOutput> {
    const existing = input.sessionToken
      ? await this.prismaClient.assessment.findFirst({
          where: {
            sessionToken: input.sessionToken,
            status: AssessmentStatus.IN_PROGRESS,
          },
        })
      : null;

    const assessment =
      existing ??
      (await this.prismaClient.assessment.create({
        data: {
          sessionToken: input.sessionToken ?? this.idGenerator(),
          status: AssessmentStatus.IN_PROGRESS,
          locale: input.locale || APP_POLICY.locale.fallback,
        },
      }));

    const questions = await this.prismaClient.question.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      include: {
        choices: {
          orderBy: { value: "asc" },
        },
      },
    });

    await this.tracker.track({
      name: existing ? "assessment_resumed" : "assessment_started",
      sessionToken: assessment.sessionToken,
      properties: {
        assessmentId: assessment.id,
        totalQuestions: questions.length,
      },
    });

    this.logger.info("Assessment initialized", {
      assessmentId: assessment.id,
      resumed: Boolean(existing),
      totalQuestions: questions.length,
    });

    return {
      assessmentId: assessment.id,
      sessionToken: assessment.sessionToken,
      currentQuestion: assessment.currentQuestion,
      totalQuestions: questions.length,
      questions: questions.map((question) => ({
        id: question.id,
        order: question.order,
        prompt: question.prompt,
        axis: question.axis,
        choices: question.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          value: choice.value,
        })),
      })),
    };
  }

  /**
   * Persists a single answer and returns latest progress snapshot.
   */
  async answerAssessment(input: AnswerAssessmentInput) {
    const assessment = await this.prismaClient.assessment.findUnique({
      where: { id: input.assessmentId },
    });

    if (!assessment || assessment.status !== AssessmentStatus.IN_PROGRESS) {
      throw new NotFoundError("진행 중인 진단이 아닙니다.", {
        assessmentId: input.assessmentId,
      });
    }

    const choice = await this.prismaClient.choice.findUnique({
      where: { id: input.choiceId },
      select: {
        id: true,
        questionId: true,
      },
    });

    if (!choice || choice.questionId !== input.questionId) {
      throw new BadRequestError("질문/선택지 매칭이 올바르지 않습니다.", {
        questionId: input.questionId,
        choiceId: input.choiceId,
      });
    }

    await this.prismaClient.response.upsert({
      where: {
        assessmentId_questionId: {
          assessmentId: input.assessmentId,
          questionId: input.questionId,
        },
      },
      create: {
        assessmentId: input.assessmentId,
        questionId: input.questionId,
        choiceId: input.choiceId,
      },
      update: {
        choiceId: input.choiceId,
        answeredAt: this.now(),
      },
    });

    const [responseCount, totalQuestions] = await Promise.all([
      this.prismaClient.response.count({ where: { assessmentId: input.assessmentId } }),
      this.prismaClient.question.count({ where: { isActive: true } }),
    ]);

    await this.prismaClient.assessment.update({
      where: { id: input.assessmentId },
      data: {
        currentQuestion: responseCount,
      },
    });

    await this.tracker.track({
      name: "assessment_answered",
      sessionToken: assessment.sessionToken,
      properties: {
        assessmentId: input.assessmentId,
        questionId: input.questionId,
        progress: responseCount,
        totalQuestions,
      },
    });

    return {
      assessmentId: input.assessmentId,
      currentQuestion: responseCount,
      totalQuestions,
      isLast: responseCount >= totalQuestions,
    };
  }

  /**
   * Finalizes assessment, computes scores, and snapshots result/action plan in one transaction.
   */
  async completeAssessment(input: CompleteAssessmentInput) {
    const assessment = await this.prismaClient.assessment.findUnique({
      where: { id: input.assessmentId },
      include: {
        responses: {
          include: {
            question: {
              select: { axis: true },
            },
            choice: {
              select: { value: true },
            },
          },
        },
        resultSnapshot: true,
      },
    });

    if (!assessment) {
      throw new NotFoundError("진단 정보를 찾을 수 없습니다.", {
        assessmentId: input.assessmentId,
      });
    }

    if (assessment.status === AssessmentStatus.COMPLETED && assessment.resultSnapshot) {
      return {
        assessmentId: assessment.id,
        resultId: assessment.resultSnapshot.id,
        alreadyCompleted: true,
        archetype: assessment.resultSnapshot.archetype,
      };
    }

    if (assessment.responses.length === 0) {
      throw new BadRequestError("응답 데이터가 없습니다.", {
        assessmentId: input.assessmentId,
      });
    }

    const scoring = calculateScores(assessment.responses);

    const result = await this.prismaClient.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id: input.assessmentId },
        data: {
          status: AssessmentStatus.COMPLETED,
          completedAt: this.now(),
          currentQuestion: assessment.responses.length,
        },
      });

      const snapshot = await tx.resultSnapshot.upsert({
        where: { assessmentId: input.assessmentId },
        create: {
          assessmentId: input.assessmentId,
          archetype: scoring.archetype,
          summary: scoring.summary,
          strengths: scoring.strengths,
          blindSpots: scoring.blindSpots,
          axisScores: scoring.axisScores,
          recommendedNext: scoring.recommendedNext,
        },
        update: {
          archetype: scoring.archetype,
          summary: scoring.summary,
          strengths: scoring.strengths,
          blindSpots: scoring.blindSpots,
          axisScores: scoring.axisScores,
          recommendedNext: scoring.recommendedNext,
        },
      });

      await tx.actionPlan.deleteMany({ where: { assessmentId: input.assessmentId } });
      await tx.actionPlan.createMany({
        data: scoring.recommendedNext.map((item) => ({
          assessmentId: input.assessmentId,
          dayIndex: item.day,
          title: item.title,
          details: item.details,
        })),
      });

      return snapshot;
    });

    await this.tracker.track({
      name: "assessment_completed",
      sessionToken: assessment.sessionToken,
      properties: {
        assessmentId: input.assessmentId,
        resultId: result.id,
        archetype: result.archetype,
      },
    });

    return {
      assessmentId: input.assessmentId,
      resultId: result.id,
      archetype: result.archetype,
      alreadyCompleted: false,
    };
  }

  /**
   * Stores weekly check-in metrics and returns current action-plan completion percentage.
   */
  async submitWeeklyCheckin(input: WeeklyCheckinInput) {
    const assessment = await this.prismaClient.assessment.findUnique({
      where: { id: input.assessmentId },
    });

    if (!assessment) {
      throw new NotFoundError("진단 정보를 찾을 수 없습니다.", {
        assessmentId: input.assessmentId,
      });
    }

    await this.prismaClient.weeklyCheckin.create({
      data: {
        assessmentId: input.assessmentId,
        userId: assessment.userId,
        executionScore: input.executionScore,
        focusScore: input.focusScore,
        confidenceScore: input.confidenceScore,
        note: input.note,
      },
    });

    const [totalPlans, completedPlans] = await Promise.all([
      this.prismaClient.actionPlan.count({ where: { assessmentId: input.assessmentId } }),
      this.prismaClient.actionPlan.count({
        where: {
          assessmentId: input.assessmentId,
          completed: true,
        },
      }),
    ]);

    const completionRate =
      totalPlans === 0 ? 0 : Math.round((completedPlans / totalPlans) * 100);

    await this.tracker.track({
      name: "weekly_checkin_submitted",
      sessionToken: assessment.sessionToken,
      userId: assessment.userId ?? undefined,
      properties: {
        assessmentId: input.assessmentId,
        executionScore: input.executionScore,
        focusScore: input.focusScore,
        confidenceScore: input.confidenceScore,
        completionRate,
      },
    });

    return {
      ok: true,
      completionRate,
    };
  }
}
