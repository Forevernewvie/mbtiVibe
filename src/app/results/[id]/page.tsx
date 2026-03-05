import Link from "next/link";
import { notFound } from "next/navigation";

import { PaymentStatus } from "@prisma/client";
import { APP_POLICY } from "@/config/app-policy";
import { PurchaseReportButton } from "@/components/purchase-report-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AxisScoreItem = {
  axis: string;
  label: string;
  score: number;
};

type ResultActionPlan = {
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
async function loadAssessmentResult(assessmentId: string) {
  const [assessment, resultSnapshot, actionPlans, paidCount] = await Promise.all([
    withTimeout(
      prisma.assessment.findUnique({
        where: { id: assessmentId },
        select: { id: true },
      }),
      RESULT_QUERY_TIMEOUT_MS,
      "진단 기본 정보 조회 시간이 초과되었습니다.",
    ),
    withTimeout(
      prisma.resultSnapshot.findUnique({
        where: { assessmentId },
        select: {
          archetype: true,
          summary: true,
          strengths: true,
          blindSpots: true,
          axisScores: true,
        },
      }),
      RESULT_QUERY_TIMEOUT_MS,
      "결과 스냅샷 조회 시간이 초과되었습니다.",
    ),
    withTimeout(
      prisma.actionPlan.findMany({
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
      RESULT_QUERY_TIMEOUT_MS,
      "액션플랜 조회 시간이 초과되었습니다.",
    ),
    withTimeout(
      prisma.payment.count({
        where: {
          assessmentId,
          status: PaymentStatus.PAID,
        },
      }),
      RESULT_QUERY_TIMEOUT_MS,
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
  } satisfies LoadedAssessmentResult;
}

/**
 * Renders assessment result summary and paid report CTA.
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let assessment: LoadedAssessmentResult | null = null;

  if (id === DEMO_RESULT_ID) {
    assessment = DEMO_RESULT;
  } else {
    try {
      assessment = await loadAssessmentResult(id);
    } catch {
      return (
        <main className="mx-auto w-full max-w-3xl px-6 py-14">
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <h1 className="text-2xl font-semibold">결과를 불러오는 데 시간이 오래 걸리고 있습니다</h1>
            <p className="mt-2 text-sm text-amber-800">
              잠시 후 다시 시도해 주세요. 문제가 지속되면 문의 페이지를 통해 알려주세요.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard" className="btn btn-primary">
                대시보드로 이동
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                문의하기
              </Link>
            </div>
          </section>
        </main>
      );
    }
  }

  if (!assessment || !assessment.resultSnapshot) {
    notFound();
  }

  const axisScores = parseAxisScores(assessment.resultSnapshot.axisScores);
  const paid = assessment.paid;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-14">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">진단 결과</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{assessment.resultSnapshot.archetype}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">{assessment.resultSnapshot.summary}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">5축 점수</h2>
          <div className="mt-4 space-y-3">
            {axisScores.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>{item.label}</span>
                  <span>{item.score}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-slate-900" style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">강점/개선 포인트</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">강점</p>
            {assessment.resultSnapshot.strengths.map((item: string) => (
              <p key={item}>- {item}</p>
            ))}
            <p className="mt-2 font-semibold text-slate-900">개선 포인트</p>
            {assessment.resultSnapshot.blindSpots.map((item: string) => (
              <p key={item}>- {item}</p>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">7일 액션플랜</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-700">
          {assessment.actionPlans.map((plan: ResultActionPlan) => (
            <li key={plan.id}>
              <span className="font-semibold">Day {plan.dayIndex}. {plan.title}</span>
              <br />
              {plan.details}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-900 p-8 text-slate-100">
        <h2 className="text-2xl font-semibold">상세 리포트(PDF)</h2>
        <p className="mt-2 text-sm text-slate-300">
          점수 해석, 리스크 관리 체크리스트, 7일 실행 템플릿이 포함된 다운로드 리포트입니다.
        </p>

        <div className="mt-5">
          {paid ? (
            <Link href={`/api/report/${assessment.assessmentId}`} className="btn btn-contrast">
              PDF 다운로드
            </Link>
          ) : (
            <PurchaseReportButton assessmentId={assessment.assessmentId} />
          )}
        </div>

        <div className="mt-4">
          <Link href="/dashboard" className="text-sm text-slate-300 underline underline-offset-4">
            대시보드에서 액션플랜 관리하기
          </Link>
        </div>
      </section>
    </main>
  );
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
