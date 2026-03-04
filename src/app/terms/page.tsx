/**
 * Provides user-facing terms of service document.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14">
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">이용약관</h1>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
          <p>본 서비스는 자기이해와 실행 계획 수립을 위한 도구이며, 의료/심리 치료 목적의 진단을 제공하지 않습니다.</p>
          <p>결제된 디지털 리포트는 다운로드 후 환불 제한이 있을 수 있으며, 상세 기준은 환불정책 페이지를 따릅니다.</p>
          <p>서비스 장애, 유지보수, 법적 요구사항에 따라 일부 기능은 사전 공지 후 변경될 수 있습니다.</p>
        </div>
      </article>
    </main>
  );
}
