import Link from "next/link";
import { cookies } from "next/headers";

import { ActionPlanChecklist } from "@/components/action-plan-checklist";
import { WeeklyCheckinForm } from "@/components/weekly-checkin-form";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DashboardPlan = {
  id: string;
  dayIndex: number;
  title: string;
  details: string;
  completed: boolean;
};

type DashboardCheckin = {
  id: string;
  executionScore: number;
  focusScore: number;
  confidenceScore: number;
  note: string | null;
};

/**
 * Shows personalized action dashboard for latest completed assessment.
 */
export default async function DashboardPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!token) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">대시보드 데이터가 없습니다</h1>
          <p className="mt-2 text-sm text-slate-600">먼저 진단을 시작하면 결과와 액션플랜이 생성됩니다.</p>
          <Link
            href="/assessment"
            className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
          >
            진단 시작
          </Link>
        </div>
      </main>
    );
  }

  const latestAssessment = await prisma.assessment.findFirst({
    where: {
      sessionToken: token,
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
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">완료된 진단이 없습니다</h1>
          <p className="mt-2 text-sm text-slate-600">진단을 완료하면 액션플랜을 추적할 수 있습니다.</p>
          <Link
            href="/assessment"
            className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
          >
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
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{latestAssessment.resultSnapshot.archetype}</h1>
        <p className="mt-2 text-sm text-slate-600">{latestAssessment.resultSnapshot.summary}</p>
        <Link
          href={`/results/${latestAssessment.id}`}
          className="mt-4 inline-flex text-sm font-semibold text-slate-700 underline underline-offset-4"
        >
          결과 상세 보기
        </Link>
      </section>

      <ActionPlanChecklist
        plans={latestAssessment.actionPlans.map((plan: DashboardPlan) => ({
          id: plan.id,
          dayIndex: plan.dayIndex,
          title: plan.title,
          details: plan.details,
          completed: plan.completed,
        }))}
      />

      <WeeklyCheckinForm assessmentId={latestAssessment.id} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">최근 체크인 기록</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          {latestAssessment.weeklyCheckins.length === 0 ? (
            <p>아직 체크인 기록이 없습니다.</p>
          ) : (
            latestAssessment.weeklyCheckins.map((checkin: DashboardCheckin) => (
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
