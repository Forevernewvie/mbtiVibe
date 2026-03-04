import { APP_POLICY } from "@/config/app-policy";
import { ExperimentAdminForm } from "@/components/experiment-admin-form";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { services } from "@/server/services/service-factory";
import type { FunnelMetricsOutput } from "@/server/services/metrics-service";

export const dynamic = "force-dynamic";

type ExperimentSummary = {
  id: string;
  key: string;
  name: string;
  variants: string[];
  isActive: boolean;
};

type FunnelDashboardState = {
  metrics: FunnelMetricsOutput | null;
  errorMessage: string | null;
};

/**
 * Loads funnel metrics snapshot while keeping admin page resilient on failures.
 */
async function loadFunnelDashboardState(): Promise<FunnelDashboardState> {
  if (!env.ADMIN_API_TOKEN) {
    return {
      metrics: null,
      errorMessage: "ADMIN_API_TOKEN 미설정으로 퍼널 지표를 불러올 수 없습니다.",
    };
  }

  try {
    const metrics = await services.metrics.getFunnelMetrics(
      APP_POLICY.analytics.funnelDefaultWindowDays,
      env.ADMIN_API_TOKEN,
    );

    return {
      metrics,
      errorMessage: null,
    };
  } catch {
    return {
      metrics: null,
      errorMessage: "퍼널 지표 조회 중 오류가 발생했습니다.",
    };
  }
}

/**
 * Formats conversion ratio values into percentage labels.
 */
function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Displays experiment management UI for administrators.
 */
export default async function ExperimentsAdminPage() {
  const experiments = await prisma.experiment.findMany({
    orderBy: {
      updatedAt: "desc",
    },
  });
  const funnelDashboard = await loadFunnelDashboardState();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-14">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">A/B 실험 관리자</h1>
        <p className="mt-2 text-sm text-slate-600">
          헤드라인, 가격, 게이팅 위치 실험을 여기서 등록하고 운영할 수 있습니다.
        </p>
      </section>

      <ExperimentAdminForm />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">운영 퍼널 대시보드</h2>
        <p className="mt-1 text-sm text-slate-600">
          최근 {APP_POLICY.analytics.funnelDefaultWindowDays}일 기준 전환 지표입니다.
        </p>

        {funnelDashboard.metrics ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-500">진단 시작</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {funnelDashboard.metrics.counts.startedAssessments}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-500">진단 완료</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {funnelDashboard.metrics.counts.completedAssessments}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                시작 대비 {formatPercent(funnelDashboard.metrics.rates.completionRateFromStart)}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-500">체크아웃 생성</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {funnelDashboard.metrics.counts.checkoutCreated}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                완료 대비 {formatPercent(funnelDashboard.metrics.rates.checkoutRateFromCompleted)}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-500">유료 결제</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {funnelDashboard.metrics.counts.paidPayments}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                시작 대비 {formatPercent(funnelDashboard.metrics.rates.paidRateFromStart)} · 체크아웃 대비{" "}
                {formatPercent(funnelDashboard.metrics.rates.paidRateFromCheckout)}
              </p>
            </article>
          </div>
        ) : (
          <p className="mt-4 text-sm text-amber-700">
            {funnelDashboard.errorMessage ?? "퍼널 지표를 표시할 수 없습니다."}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">현재 실험 목록</h2>
        <div className="mt-4 space-y-3 text-sm">
          {experiments.length === 0 ? (
            <p className="text-slate-600">등록된 실험이 없습니다.</p>
          ) : (
            experiments.map((experiment: ExperimentSummary) => (
              <article key={experiment.id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">
                  {experiment.key} · {experiment.name}
                </p>
                <p className="mt-1 text-slate-600">variants: {experiment.variants.join(", ")}</p>
                <p className="mt-1 text-xs text-slate-500">
                  상태: {experiment.isActive ? "활성" : "비활성"}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
