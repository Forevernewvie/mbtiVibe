import Link from "next/link";

import { APP_POLICY, formatKrw } from "@/config/app-policy";
import { KPI_TARGETS } from "@/lib/constants";

const features = [
  {
    title: "문제 해결형 진단",
    body: "성격 분류 대신 수익에 직접 연결되는 5축(실행/리스크/학습/협업/시장) 점수를 제공합니다.",
  },
  {
    title: "7일 액션플랜 자동 생성",
    body: "결과를 읽고 끝나는 진단이 아니라, 바로 실천 가능한 하루 단위 TODO를 제공합니다.",
  },
  {
    title: "유료 리포트 전환 구조",
    body: `무료 요약 → 유료 상세 PDF(${formatKrw(APP_POLICY.pricing.report.amount)}) → 월 구독으로 이어지는 결제 퍼널을 기본 탑재했습니다.`,
  },
];

/**
 * Marketing landing page for assessment funnel.
 */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-14 md:py-20">
      <section className="grid items-center gap-10 rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-sm md:grid-cols-[1.2fr_1fr] md:p-12">
        <div className="space-y-5">
          <p className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
            30일 내 첫 결제 10건 목표
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 md:text-5xl">
            돈이 되는 웹앱 실행력,
            <br />
            진단하고 바로 수익화하세요.
          </h1>
          <p className="max-w-xl text-base leading-7 text-slate-600 md:text-lg">
            VibeWeb Growth Lab은 재미형 테스트가 아니라, 실행과 수익화 지표에 맞춘 진단/리포트 SaaS 템플릿입니다.
            지금 시작하면 오늘 안에 MVP 랜딩과 결제 플로우를 운영할 수 있습니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/assessment" className="btn btn-primary">
              무료 진단 시작
            </Link>
            <Link href="/dashboard" className="btn btn-secondary">
              내 대시보드 보기
            </Link>
          </div>
        </div>

        <div className="stat-card grid gap-4 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-900">핵심 KPI 목표</h2>
          <ul className="space-y-3 text-sm text-slate-700">
            {KPI_TARGETS.map((item) => (
              <li key={item.step} className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span>{item.step}</span>
                <span className="font-semibold text-slate-900">{item.target}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-xl font-semibold text-slate-900">{feature.title}</h3>
            <p className="text-sm leading-6 text-slate-600">{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-14 grid gap-4 rounded-3xl border border-slate-200 bg-slate-900 p-8 text-slate-100 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-300">Free</p>
          <p className="mt-2 text-3xl font-semibold">₩0</p>
          <p className="mt-2 text-sm text-slate-300">요약 결과 + 이메일 리드 수집</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-300">One-Time</p>
          <p className="mt-2 text-3xl font-semibold">{formatKrw(APP_POLICY.pricing.report.amount)}</p>
          <p className="mt-2 text-sm text-slate-300">상세 PDF 리포트 + 7일 액션플랜</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-300">Subscription</p>
          <p className="mt-2 text-3xl font-semibold">
            {formatKrw(APP_POLICY.pricing.coachingMonthly.amount)}/mo
          </p>
          <p className="mt-2 text-sm text-slate-300">주간 체크인 + AI 코칭 대시보드</p>
        </div>
      </section>

      <section className="mt-14 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">빠른 시작</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>무료 진단을 완료하고 결과 요약을 확인하세요.</li>
          <li>상세 리포트 결제로 PDF를 다운로드하세요.</li>
          <li>대시보드에서 7일 액션플랜과 주간 체크인을 실행하세요.</li>
        </ol>
      </section>
    </main>
  );
}
