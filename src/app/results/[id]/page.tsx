import Link from "next/link";
import { notFound } from "next/navigation";

import { PurchaseReportButton } from "@/components/purchase-report-button";
import { loadResultPageData } from "@/server/loaders/result-page-loader";

export const dynamic = "force-dynamic";

/**
 * Renders assessment result summary and paid report CTA.
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pageData = await loadResultPageData({
    assessmentId: id,
  });

  if (pageData.kind === "load-error") {
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

  if (pageData.kind === "not-found") {
    notFound();
  }

  const { assessment, axisScores } = pageData;
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
