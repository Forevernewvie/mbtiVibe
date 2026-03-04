/**
 * Provides user-facing refund policy document.
 */
export default function RefundPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14">
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">환불정책</h1>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
          <p>단건 리포트(디지털 상품)는 결제 후 미열람 상태에서만 환불 가능합니다.</p>
          <p>구독 상품은 결제일 기준 7일 이내, 사용량이 없는 경우 환불 요청이 가능합니다.</p>
          <p>결제 오류/중복 결제는 확인 후 전액 환불 처리합니다.</p>
        </div>
      </article>
    </main>
  );
}
