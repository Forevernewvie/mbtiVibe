import { PaymentStatus } from "@prisma/client";

import { APP_POLICY } from "@/config/app-policy";

export type AxisScoreItem = {
  axis: string;
  label: string;
  score: number;
};

export type ResultActionPlan = {
  id: string;
  dayIndex: number;
  title: string;
  details: string;
};

type LoadedAssessmentResult = {
  assessmentId: string;
  resultSnapshot: {
    archetype: string;
    summary: string;
    strengths: string[];
    blindSpots: string[];
    axisScores: unknown;
  };
  actionPlans: ResultActionPlan[];
  paid: boolean;
};

export type ResultPageData =
  | { kind: "not-found" }
  | { kind: "load-error" }
  | {
      kind: "ready";
      assessment: LoadedAssessmentResult;
      axisScores: AxisScoreItem[];
    };

type ResultPersistence = {
  assessment: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
  resultSnapshot: {
    findUnique(args: unknown): Promise<LoadedAssessmentResult["resultSnapshot"] | null>;
  };
  actionPlan: {
    findMany(args: unknown): Promise<ResultActionPlan[]>;
  };
  payment: {
    count(args: unknown): Promise<number>;
  };
};

type ResultPageLoaderDependencies = {
  assessmentId: string;
  prismaClient?: ResultPersistence;
  timeoutMs?: number;
};

const RESULT_QUERY_TIMEOUT_MS = APP_POLICY.time.secondMs * 8;
const DEMO_RESULT_ID = "demo";
const DEMO_RESULT: LoadedAssessmentResult = {
  assessmentId: DEMO_RESULT_ID,
  resultSnapshot: {
    archetype: "실행형 빌더",
    summary: "실행 속도는 높고 시장 검증 루틴이 강점입니다. 리스크 점검 루틴을 보완하면 전환 효율이 상승합니다.",
    strengths: [
      "아이디어를 빠르게 MVP로 전환하는 추진력",
      "피드백을 반영해 실험 주기를 유지하는 실행 루프",
      "핵심 지표 기반 우선순위 설정 능력",
    ],
    blindSpots: [
      "실험 기록의 체계화 부족",
      "결제 실패/환불 대응 프로세스 문서화 미흡",
      "주간 회고 지표 일관성 저하",
    ],
    axisScores: [
      { axis: "ACTION", label: "실행력", score: 83 },
      { axis: "RISK", label: "리스크 감수", score: 61 },
      { axis: "LEARNING", label: "학습 민첩성", score: 78 },
      { axis: "COLLABORATION", label: "협업력", score: 69 },
      { axis: "MARKET", label: "시장 감각", score: 75 },
    ],
  },
  actionPlans: [
    {
      id: "demo-day-1",
      dayIndex: 1,
      title: "핵심 CTA 대비 점검",
      details: "첫 화면 CTA 대비와 버튼 라벨 가독성을 점검해 클릭률 저하 요인을 제거하세요.",
    },
    {
      id: "demo-day-2",
      dayIndex: 2,
      title: "결제 퍼널 로그 정비",
      details: "체크아웃 생성/결제 성공/실패 이벤트를 표준 스키마로 기록하세요.",
    },
    {
      id: "demo-day-3",
      dayIndex: 3,
      title: "모바일 폼 오류 가독성 개선",
      details: "오류 메시지 대비, 포커스 이동, aria-live를 검증해 이탈을 줄이세요.",
    },
  ],
  paid: false,
};

/**
 * Loads result page state, including fallback and timeout recovery branches.
 */
export async function loadResultPageData(
  dependencies: ResultPageLoaderDependencies,
): Promise<ResultPageData> {
  if (dependencies.assessmentId === DEMO_RESULT_ID) {
    return {
      kind: "ready",
      assessment: DEMO_RESULT,
      axisScores: parseAxisScores(DEMO_RESULT.resultSnapshot.axisScores),
    };
  }

  try {
    const assessment = await loadAssessmentResult(
      dependencies.prismaClient ?? (await resolveResultPersistence()),
      dependencies.assessmentId,
      dependencies.timeoutMs ?? RESULT_QUERY_TIMEOUT_MS,
    );

    if (!assessment) {
      return {
        kind: "not-found",
      };
    }

    return {
      kind: "ready",
      assessment,
      axisScores: parseAxisScores(assessment.resultSnapshot.axisScores),
    };
  } catch {
    return {
      kind: "load-error",
    };
  }
}

/**
 * Guards async tasks with a timeout to avoid indefinite server-side hangs.
 */
async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return await Promise.race([task, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Loads result page assessment payload with bounded wait time.
 */
async function loadAssessmentResult(
  prismaClient: ResultPersistence,
  assessmentId: string,
  timeoutMs: number,
): Promise<LoadedAssessmentResult | null> {
  const [assessment, resultSnapshot, actionPlans, paidCount] = await Promise.all([
    withTimeout(
      prismaClient.assessment.findUnique({
        where: { id: assessmentId },
        select: { id: true },
      }),
      timeoutMs,
      "진단 기본 정보 조회 시간이 초과되었습니다.",
    ),
    withTimeout(
      prismaClient.resultSnapshot.findUnique({
        where: { assessmentId },
        select: {
          archetype: true,
          summary: true,
          strengths: true,
          blindSpots: true,
          axisScores: true,
        },
      }),
      timeoutMs,
      "결과 스냅샷 조회 시간이 초과되었습니다.",
    ),
    withTimeout(
      prismaClient.actionPlan.findMany({
        where: { assessmentId },
        orderBy: {
          dayIndex: "asc",
        },
        select: {
          id: true,
          dayIndex: true,
          title: true,
          details: true,
        },
      }),
      timeoutMs,
      "액션플랜 조회 시간이 초과되었습니다.",
    ),
    withTimeout(
      prismaClient.payment.count({
        where: {
          assessmentId,
          status: PaymentStatus.PAID,
        },
      }),
      timeoutMs,
      "결제 이력 조회 시간이 초과되었습니다.",
    ),
  ]);

  if (!assessment || !resultSnapshot) {
    return null;
  }

  return {
    assessmentId,
    resultSnapshot,
    actionPlans,
    paid: paidCount > 0,
  };
}

/**
 * Parses untyped JSON axis score payload from snapshot storage.
 */
function parseAxisScores(value: unknown): AxisScoreItem[] {
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
      return [
        {
          axis: "axis" in item && typeof item.axis === "string" ? item.axis : item.label,
          label: item.label,
          score: item.score,
        },
      ];
    }

    return [];
  });
}

/**
 * Lazily imports Prisma persistence so loader tests can inject isolated doubles.
 */
async function resolveResultPersistence(): Promise<ResultPersistence> {
  const { prisma } = await import("@/lib/prisma");
  return prisma as unknown as ResultPersistence;
}
