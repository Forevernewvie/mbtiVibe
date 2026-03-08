import { SESSION_COOKIE } from "@/lib/constants";

export type DashboardPlan = {
  id: string;
  dayIndex: number;
  title: string;
  details: string;
  completed: boolean;
};

export type DashboardCheckin = {
  id: string;
  executionScore: number;
  focusScore: number;
  confidenceScore: number;
  note: string | null;
};

export type DashboardPageData =
  | { kind: "missing-session" }
  | { kind: "missing-assessment" }
  | {
      kind: "ready";
      assessmentId: string;
      archetype: string;
      summary: string;
      plans: DashboardPlan[];
      weeklyCheckins: DashboardCheckin[];
    };

type DashboardAssessmentRecord = {
  id: string;
  resultSnapshot: {
    archetype: string;
    summary: string;
  } | null;
  actionPlans: DashboardPlan[];
  weeklyCheckins: DashboardCheckin[];
};

type DashboardPersistence = {
  assessment: {
    findFirst(args: unknown): Promise<DashboardAssessmentRecord | null>;
  };
};

type DashboardPageLoaderDependencies = {
  prismaClient?: DashboardPersistence;
  sessionToken?: string | null;
};

/**
 * Loads the latest completed dashboard payload for the current assessment session.
 */
export async function loadDashboardPageData(
  dependencies: DashboardPageLoaderDependencies = {},
): Promise<DashboardPageData> {
  const sessionToken = await resolveSessionToken(dependencies.sessionToken);

  if (!sessionToken) {
    return {
      kind: "missing-session",
    };
  }

  const prismaClient = dependencies.prismaClient ?? (await resolveDashboardPersistence());
  const latestAssessment = await prismaClient.assessment.findFirst({
    where: {
      sessionToken,
      completedAt: {
        not: null,
      },
    },
    orderBy: {
      completedAt: "desc",
    },
    include: {
      resultSnapshot: true,
      actionPlans: {
        orderBy: {
          dayIndex: "asc",
        },
      },
      weeklyCheckins: {
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      },
    },
  });

  if (!latestAssessment || !latestAssessment.resultSnapshot) {
    return {
      kind: "missing-assessment",
    };
  }

  return {
    kind: "ready",
    assessmentId: latestAssessment.id,
    archetype: latestAssessment.resultSnapshot.archetype,
    summary: latestAssessment.resultSnapshot.summary,
    plans: latestAssessment.actionPlans.map((plan) => ({
      id: plan.id,
      dayIndex: plan.dayIndex,
      title: plan.title,
      details: plan.details,
      completed: plan.completed,
    })),
    weeklyCheckins: latestAssessment.weeklyCheckins.map((checkin) => ({
      id: checkin.id,
      executionScore: checkin.executionScore,
      focusScore: checkin.focusScore,
      confidenceScore: checkin.confidenceScore,
      note: checkin.note,
    })),
  };
}

/**
 * Resolves the active session token lazily to keep loader tests framework-free.
 */
async function resolveSessionToken(sessionToken?: string | null): Promise<string | null> {
  if (sessionToken !== undefined) {
    return sessionToken;
  }

  const { cookies } = await import("next/headers");
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Lazily imports Prisma persistence to keep loader tests infrastructure-free.
 */
async function resolveDashboardPersistence(): Promise<DashboardPersistence> {
  const { prisma } = await import("@/lib/prisma");
  return prisma as unknown as DashboardPersistence;
}
