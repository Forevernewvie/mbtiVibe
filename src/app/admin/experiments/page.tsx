import { ExperimentAdminForm } from "@/components/experiment-admin-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ExperimentSummary = {
  id: string;
  key: string;
  name: string;
  variants: string[];
  isActive: boolean;
};

/**
 * Displays experiment management UI for administrators.
 */
export default async function ExperimentsAdminPage() {
  const experiments = await prisma.experiment.findMany({
    orderBy: {
      updatedAt: "desc",
    },
  });

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
