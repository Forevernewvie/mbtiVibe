import Link from "next/link";

import { PRIVACY_POLICY_DOCUMENT } from "@/lib/legal/privacy-policy-content";

/**
 * Provides the app-hosted privacy policy view from the canonical legal content source.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14">
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            {PRIVACY_POLICY_DOCUMENT.subtitle}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">{PRIVACY_POLICY_DOCUMENT.title}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {PRIVACY_POLICY_DOCUMENT.introduction}
          </p>
          <p className="mt-2 text-xs text-slate-500">최종 업데이트: {PRIVACY_POLICY_DOCUMENT.updatedAt}</p>
        </div>

        <div className="mt-8 space-y-8">
          {PRIVACY_POLICY_DOCUMENT.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              <ul className="space-y-2 text-sm leading-7 text-slate-700">
                {section.items.map((item) => (
                  <li key={item} className="list-disc pl-2 marker:text-slate-400">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">10. 문의처</h2>
            <div className="space-y-2 text-sm leading-7 text-slate-700">
              <p>개인정보 관련 문의, 열람, 정정, 삭제 요청은 아래 경로로 접수할 수 있습니다.</p>
              <p>
                문의 페이지:{" "}
                <Link
                  href={PRIVACY_POLICY_DOCUMENT.contactRoute}
                  className="font-semibold text-slate-900 underline underline-offset-4"
                >
                  {PRIVACY_POLICY_DOCUMENT.contactRoute}
                </Link>
              </p>
              <p>운영 주체: {PRIVACY_POLICY_DOCUMENT.operatorName}</p>
              <p>본 방침은 서비스 운영 내용 변경 또는 법령 변경에 따라 업데이트될 수 있습니다.</p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}
