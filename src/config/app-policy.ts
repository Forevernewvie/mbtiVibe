/**
 * Centralized application-wide constants to avoid magic numbers and duplicated literals.
 */
export const APP_POLICY = {
  time: {
    secondMs: 1_000,
    minuteMs: 60_000,
    hourMs: 3_600_000,
    dayMs: 86_400_000,
  },
  locale: {
    fallback: "ko-KR",
  },
  session: {
    cookieName: "vibe_session",
    cookieMaxAgeSeconds: 30 * 24 * 60 * 60,
  },
  rateLimit: {
    assessmentStart: { limit: 20, windowMs: 60_000 },
    assessmentAnswer: { limit: 120, windowMs: 60_000 },
    assessmentComplete: { limit: 30, windowMs: 60_000 },
    checkoutCreate: { limit: 30, windowMs: 60_000 },
    weeklyCheckin: { limit: 20, windowMs: 60_000 },
  },
  pricing: {
    report: {
      code: "REPORT_SINGLE_990",
      amount: 990,
      currency: "KRW",
    },
    coachingMonthly: {
      code: "COACH_MONTHLY_2990",
      amount: 2_990,
      currency: "KRW",
    },
    reportCheckoutHintCode: "REPORT_SINGLE_990",
  },
  checkout: {
    demoSubscriptionDays: 30,
    demoUserName: "Demo User",
  },
  scoring: {
    strongThreshold: 70,
    weakThreshold: 45,
    maxActionPlanLength: 7,
    minLikertValue: 1,
    maxLikertValue: 5,
  },
  weeklyCheckin: {
    minScore: 1,
    maxScore: 5,
    maxNoteLength: 1_000,
  },
  support: {
    maxSubjectLength: 120,
    maxMessageLength: 3_000,
  },
} as const;

/**
 * Formats KRW amounts with thousands separators for UI rendering.
 */
export function formatKrw(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}
