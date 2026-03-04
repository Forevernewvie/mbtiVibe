/**
 * Provides user-facing privacy policy document.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14">
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">개인정보처리방침</h1>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
          <p>수집 항목: 이메일(선택), 진단 응답, 결제 이벤트, 서비스 이용 로그.</p>
          <p>수집 목적: 결과 제공, 결제 처리, 고객 문의 대응, 제품 개선 실험 분석.</p>
          <p>보관 기간: 법령 또는 계약상 의무기간 종료 시 지체 없이 파기합니다.</p>
          <p>삭제 요청: 문의 페이지를 통해 계정/데이터 삭제를 요청할 수 있습니다.</p>
        </div>
      </article>
    </main>
  );
}
