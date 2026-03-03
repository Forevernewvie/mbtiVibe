import Link from "next/link";
import { notFound } from "next/navigation";

import { PaymentStatus } from "@prisma/client";
import { PurchaseReportButton } from "@/components/purchase-report-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AxisScoreItem = {
  axis: string;
  label: string;
  score: number;
};

/**
 * Renders assessment result summary and paid report CTA.
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id },
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
    notFound();
  }

  const axisScores = parseAxisScores(assessment.resultSnapshot.axisScores);
  const paid = assessment.payments.length > 0;

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
            {assessment.resultSnapshot.strengths.map((item) => (
              <p key={item}>- {item}</p>
            ))}
            <p className="mt-2 font-semibold text-slate-900">개선 포인트</p>
            {assessment.resultSnapshot.blindSpots.map((item) => (
              <p key={item}>- {item}</p>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">7일 액션플랜</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-700">
          {assessment.actionPlans.map((plan) => (
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
            <Link
              href={`/api/report/${assessment.id}`}
              className="inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900"
            >
              PDF 다운로드
            </Link>
          ) : (
            <PurchaseReportButton assessmentId={assessment.id} />
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
