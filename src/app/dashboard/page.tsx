import Link from "next/link";

import { ActionPlanChecklist } from "@/components/action-plan-checklist";
import { WeeklyCheckinForm } from "@/components/weekly-checkin-form";
import { loadDashboardPageData } from "@/server/loaders/dashboard-page-loader";

export const dynamic = "force-dynamic";

/**
 * Shows personalized action dashboard for latest completed assessment.
 */
export default async function DashboardPage() {
  const pageData = await loadDashboardPageData();

  if (pageData.kind === "missing-session") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">대시보드 데이터가 없습니다</h1>
          <p className="mt-2 text-sm text-slate-600">먼저 진단을 시작하면 결과와 액션플랜이 생성됩니다.</p>
          <Link href="/assessment" className="btn btn-primary mt-5">
            진단 시작
          </Link>
        </div>
      </main>
    );
  }

  if (pageData.kind === "missing-assessment") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">완료된 진단이 없습니다</h1>
          <p className="mt-2 text-sm text-slate-600">진단을 완료하면 액션플랜을 추적할 수 있습니다.</p>
          <Link href="/assessment" className="btn btn-primary mt-5">
            진단하러 가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-14">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">내 성장 대시보드</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{pageData.archetype}</h1>
        <p className="mt-2 text-sm text-slate-600">{pageData.summary}</p>
        <Link
          href={`/results/${pageData.assessmentId}`}
          className="mt-4 inline-flex text-sm font-semibold text-slate-700 underline underline-offset-4"
        >
          결과 상세 보기
        </Link>
      </section>

      <ActionPlanChecklist
        plans={pageData.plans}
      />

      <WeeklyCheckinForm assessmentId={pageData.assessmentId} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">최근 체크인 기록</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          {pageData.weeklyCheckins.length === 0 ? (
            <p>아직 체크인 기록이 없습니다.</p>
          ) : (
            pageData.weeklyCheckins.map((checkin) => (
              <div key={checkin.id} className="rounded-xl border border-slate-200 p-3">
                <p>
                  실행 {checkin.executionScore} / 집중 {checkin.focusScore} / 자신감 {checkin.confidenceScore}
                </p>
                {checkin.note ? <p className="mt-1 text-slate-600">{checkin.note}</p> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
