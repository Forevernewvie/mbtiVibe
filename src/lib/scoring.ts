import { Axis } from "@prisma/client";

import { APP_POLICY } from "@/config/app-policy";
import { AXIS_META } from "@/lib/constants";

export type ScoringInput = {
  question: { axis: Axis };
  choice: { value: number };
};

export type AxisScore = {
  axis: Axis;
  score: number;
  label: string;
  description: string;
};

export type ScoringOutput = {
  archetype: string;
  summary: string;
  strengths: string[];
  blindSpots: string[];
  axisScores: AxisScore[];
  recommendedNext: Array<{ day: number; title: string; details: string }>;
};

/**
 * Converts axis answer values into normalized percent score.
 */
function toPercent(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const averageValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  const normalized =
    (averageValue - APP_POLICY.scoring.minLikertValue) /
    (APP_POLICY.scoring.maxLikertValue - APP_POLICY.scoring.minLikertValue);

  return Math.round(normalized * 100);
}

/**
 * Selects archetype label from highest two axis rankings.
 */
function createArchetype(scores: AxisScore[]) {
  const topAxis = scores[0]?.axis;
  const secondAxis = scores[1]?.axis;

  if (topAxis === Axis.ACTION && secondAxis === Axis.MARKET) return "런치 드리븐 빌더";
  if (topAxis === Axis.ACTION && secondAxis === Axis.LEARNING) return "실험형 프로덕트 메이커";
  if (topAxis === Axis.MARKET && secondAxis === Axis.COLLABORATION) return "고객 집착형 오퍼레이터";
  if (topAxis === Axis.LEARNING && secondAxis === Axis.ACTION) return "학습 가속형 실행가";
  if (topAxis === Axis.COLLABORATION && secondAxis === Axis.MARKET) return "팀 확장형 성장가";
  if (topAxis === Axis.RISK && secondAxis === Axis.ACTION) return "리스크 리딩 도전자";

  return "밸런스형 성장가";
}

/**
 * Builds concise summary text from top strengths and weakest axis.
 */
function createSummary(scores: AxisScore[]) {
  const topTwo = scores.slice(0, 2);
  const weakest = scores[scores.length - 1];

  return `${topTwo
    .map((item) => AXIS_META[item.axis].label)
    .join("·")} 축이 강점입니다. 현재 가장 개선 우선순위는 ${AXIS_META[weakest.axis].label}입니다.`;
}

/**
 * Extracts strengths above configured threshold.
 */
function createStrengths(scores: AxisScore[]) {
  const strong = scores.filter((item) => item.score >= APP_POLICY.scoring.strongThreshold);

  if (strong.length === 0) {
    return ["기본 역량이 고르게 분포되어 있어 실행 시스템 구축에 유리합니다."];
  }

  return strong.map((item) => `${item.label}: ${item.description}`);
}

/**
 * Extracts low-score improvement opportunities.
 */
function createBlindSpots(scores: AxisScore[]) {
  const weak = scores.filter((item) => item.score <= APP_POLICY.scoring.weakThreshold);

  if (weak.length === 0) {
    return ["치명적 약점은 없지만, 주간 회고를 통해 약해지는 축을 조기 감지하세요."];
  }

  return weak.map((item) => `${item.label}: ${AXIS_META[item.axis].actionHint}`);
}

/**
 * Returns axis-specific action card templates.
 */
function createActionBank(axis: Axis) {
  const label = AXIS_META[axis].label;

  return [
    {
      title: `${label} 진단 로그 작성`,
      details: `지난 2주 작업을 돌아보고 ${label}이 낮아진 원인을 3가지 기록하세요.`,
    },
    {
      title: `${label} 실험 1개 실행`,
      details: `${label}을 끌어올리는 가장 작은 실험을 오늘 30분 내 시작하세요.`,
    },
    {
      title: `${label} 체크리스트 고정`,
      details: `반복 가능한 체크리스트를 만들어 다음 작업부터 바로 적용하세요.`,
    },
  ];
}

/**
 * Generates capped 7-day action plan from weakest axes and top strength.
 */
function createRecommendedNext(scores: AxisScore[]) {
  const weakestAxes = scores.slice(-2).map((item) => item.axis);
  const strongestAxis = scores[0]?.axis;

  const weakestActions = weakestAxes.flatMap((axis) => createActionBank(axis));
  const topAction = strongestAxis
    ? [
        {
          title: `${AXIS_META[strongestAxis].label} 강점 레버리지`,
          details: `가장 높은 강점을 활용해 이번 주 핵심 목표 1개를 마무리하세요.`,
        },
      ]
    : [];

  const mergedPlan = [...weakestActions, ...topAction].slice(0, APP_POLICY.scoring.maxActionPlanLength);

  return mergedPlan.map((item, index) => ({
    day: index + 1,
    title: item.title,
    details: item.details,
  }));
}

/**
 * Calculates assessment scorecard and recommendation payload.
 */
export function calculateScores(responses: ScoringInput[]): ScoringOutput {
  const grouped = new Map<Axis, number[]>();

  for (const response of responses) {
    const values = grouped.get(response.question.axis) ?? [];
    values.push(response.choice.value);
    grouped.set(response.question.axis, values);
  }

  const axisScores: AxisScore[] = (Object.keys(AXIS_META) as Axis[])
    .map((axis) => ({
      axis,
      score: toPercent(grouped.get(axis) ?? []),
      label: AXIS_META[axis].label,
      description: AXIS_META[axis].description,
    }))
    .sort((a, b) => b.score - a.score);

  return {
    archetype: createArchetype(axisScores),
    summary: createSummary(axisScores),
    strengths: createStrengths(axisScores),
    blindSpots: createBlindSpots(axisScores),
    axisScores,
    recommendedNext: createRecommendedNext(axisScores),
  };
}
