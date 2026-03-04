import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Axis, BillingPeriod, PaymentProvider, PrismaClient } from "@prisma/client";
import { APP_POLICY } from "../src/config/app-policy";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const LIKERT_SCALE = [
  APP_POLICY.scoring.minLikertValue,
  APP_POLICY.scoring.minLikertValue + 1,
  APP_POLICY.scoring.minLikertValue + 2,
  APP_POLICY.scoring.minLikertValue + 3,
  APP_POLICY.scoring.maxLikertValue,
] as const;

const choiceTemplate = [
  { label: "전혀 그렇지 않다", value: LIKERT_SCALE[0] },
  { label: "그렇지 않다", value: LIKERT_SCALE[1] },
  { label: "보통이다", value: LIKERT_SCALE[2] },
  { label: "그렇다", value: LIKERT_SCALE[3] },
  { label: "매우 그렇다", value: LIKERT_SCALE[4] },
];

const questions: { order: number; prompt: string; axis: Axis }[] = [
  { order: 1, prompt: "아이디어가 생기면 48시간 안에 작은 실험부터 시작한다.", axis: Axis.ACTION },
  { order: 2, prompt: "완벽한 계획보다 빠른 출시를 우선한다.", axis: Axis.ACTION },
  { order: 3, prompt: "해야 할 일을 일정으로 쪼개 실행하는 편이다.", axis: Axis.ACTION },
  { order: 4, prompt: "불확실해도 작은 비용이면 먼저 시도한다.", axis: Axis.RISK },
  { order: 5, prompt: "실패 가능성을 감수하고 새로운 채널을 테스트한다.", axis: Axis.RISK },
  { order: 6, prompt: "결정을 늦추기보다 테스트를 통해 판단한다.", axis: Axis.RISK },
  { order: 7, prompt: "새로운 툴이나 개념을 빠르게 익히는 편이다.", axis: Axis.LEARNING },
  { order: 8, prompt: "문제가 생기면 자료를 찾아 바로 해결한다.", axis: Axis.LEARNING },
  { order: 9, prompt: "피드백을 받으면 다음 버전에 즉시 반영한다.", axis: Axis.LEARNING },
  { order: 10, prompt: "협업할 때 역할/기대치를 명확히 맞춘다.", axis: Axis.COLLABORATION },
  { order: 11, prompt: "필요한 도움을 요청하거나 연결을 잘 만든다.", axis: Axis.COLLABORATION },
  { order: 12, prompt: "비동기 소통(문서/메시지)으로 일을 효율적으로 진행한다.", axis: Axis.COLLABORATION },
  { order: 13, prompt: "사용자 문제를 인터뷰/리서치로 검증한다.", axis: Axis.MARKET },
  { order: 14, prompt: "가격/오퍼를 실제 고객 반응으로 판단한다.", axis: Axis.MARKET },
  { order: 15, prompt: "지표(전환율, 잔존율) 기반으로 우선순위를 조정한다.", axis: Axis.MARKET },
];

const LEGACY_PRICE_CODES = ["REPORT_SINGLE_9900", "COACH_MONTHLY_19900"] as const;

/**
 * Seeds assessment questions and answer choices.
 */
async function seedQuestions() {
  for (const item of questions) {
    const question = await prisma.question.upsert({
      where: { order: item.order },
      update: {
        prompt: item.prompt,
        axis: item.axis,
        isActive: true,
      },
      create: {
        order: item.order,
        prompt: item.prompt,
        axis: item.axis,
      },
    });

    await prisma.choice.deleteMany({ where: { questionId: question.id } });
    await prisma.choice.createMany({
      data: choiceTemplate.map((choice) => ({
        questionId: question.id,
        label: choice.label,
        value: choice.value,
      })),
    });
  }
}

/**
 * Seeds product and price catalog rows.
 */
async function seedProducts() {
  const reportProduct = await prisma.product.upsert({
    where: { code: "career_report" },
    update: {
      name: "커리어 성장 상세 리포트",
      description: "개인 점수 분석 + 맞춤형 7일 실행 플랜 PDF",
      isActive: true,
    },
    create: {
      code: "career_report",
      name: "커리어 성장 상세 리포트",
      description: "개인 점수 분석 + 맞춤형 7일 실행 플랜 PDF",
    },
  });

  const coachingProduct = await prisma.product.upsert({
    where: { code: "weekly_coaching" },
    update: {
      name: "주간 AI 코칭 구독",
      description: "주간 체크인 + 목표 기반 AI 코칭",
      isActive: true,
    },
    create: {
      code: "weekly_coaching",
      name: "주간 AI 코칭 구독",
      description: "주간 체크인 + 목표 기반 AI 코칭",
    },
  });

  await prisma.price.upsert({
    where: { code: APP_POLICY.pricing.report.code },
    update: {
      amount: APP_POLICY.pricing.report.amount,
      currency: APP_POLICY.pricing.report.currency,
      provider: PaymentProvider.MANUAL,
      billingPeriod: BillingPeriod.ONE_TIME,
      productId: reportProduct.id,
      isActive: true,
    },
    create: {
      code: APP_POLICY.pricing.report.code,
      productId: reportProduct.id,
      provider: PaymentProvider.MANUAL,
      amount: APP_POLICY.pricing.report.amount,
      currency: APP_POLICY.pricing.report.currency,
      billingPeriod: BillingPeriod.ONE_TIME,
      isActive: true,
    },
  });

  await prisma.price.upsert({
    where: { code: APP_POLICY.pricing.coachingMonthly.code },
    update: {
      amount: APP_POLICY.pricing.coachingMonthly.amount,
      currency: APP_POLICY.pricing.coachingMonthly.currency,
      provider: PaymentProvider.MANUAL,
      billingPeriod: BillingPeriod.MONTHLY,
      productId: coachingProduct.id,
      isActive: true,
    },
    create: {
      code: APP_POLICY.pricing.coachingMonthly.code,
      productId: coachingProduct.id,
      provider: PaymentProvider.MANUAL,
      amount: APP_POLICY.pricing.coachingMonthly.amount,
      currency: APP_POLICY.pricing.coachingMonthly.currency,
      billingPeriod: BillingPeriod.MONTHLY,
      isActive: true,
    },
  });

  await prisma.price.updateMany({
    where: {
      code: {
        in: [...LEGACY_PRICE_CODES],
      },
    },
    data: {
      isActive: false,
    },
  });
}

/**
 * Seeds baseline experiment metadata.
 */
async function seedExperiments() {
  await prisma.experiment.upsert({
    where: { key: "landing_headline" },
    update: {
      name: "랜딩 헤드라인 실험",
      variants: ["problem", "aspiration", "proof"],
      isActive: true,
    },
    create: {
      key: "landing_headline",
      name: "랜딩 헤드라인 실험",
      variants: ["problem", "aspiration", "proof"],
      isActive: true,
    },
  });
}

/**
 * Executes all seed tasks in deterministic order.
 */
async function main() {
  await seedQuestions();
  await seedProducts();
  await seedExperiments();
  console.log("Seed completed: questions, products/prices, experiments");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
