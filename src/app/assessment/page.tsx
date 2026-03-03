import { AssessmentFlow } from "@/components/assessment-flow";

/**
 * Shows assessment introduction and interactive question flow.
 */
export default function AssessmentPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
      <div className="mb-6 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">진단 테스트</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">AI 커리어/수익 성장 진단</h1>
        <p className="text-sm text-slate-600">
          12~18문항 내외의 실행 중심 진단입니다. 평균 3분 내 완료되며, 결과는 즉시 제공됩니다.
        </p>
      </div>

      <AssessmentFlow />
    </main>
  );
}
