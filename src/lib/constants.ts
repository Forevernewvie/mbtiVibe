import { Axis } from "@prisma/client";
import { APP_POLICY } from "@/config/app-policy";

export const SESSION_COOKIE = APP_POLICY.session.cookieName;

export const AXIS_META: Record<
  Axis,
  {
    label: string;
    description: string;
    actionHint: string;
  }
> = {
  ACTION: {
    label: "실행력",
    description: "아이디어를 실제 행동으로 옮기는 속도",
    actionHint: "완벽보다 출시를 우선해 작은 실험을 반복하세요.",
  },
  RISK: {
    label: "리스크 감수",
    description: "불확실한 선택을 관리 가능한 범위에서 시도하는 태도",
    actionHint: "작은 금액과 짧은 기간으로 리스크를 쪼개 테스트하세요.",
  },
  LEARNING: {
    label: "학습 민첩성",
    description: "새 도구와 지식을 빠르게 흡수하는 능력",
    actionHint: "문제를 만났을 때 검색-실험-회고 루프를 고정하세요.",
  },
  COLLABORATION: {
    label: "협업력",
    description: "타인과 역할/기대치를 맞추고 결과를 만드는 능력",
    actionHint: "문서 중심의 비동기 커뮤니케이션 템플릿을 만드세요.",
  },
  MARKET: {
    label: "시장 감각",
    description: "고객 문제/가격/전환 데이터를 바탕으로 판단하는 능력",
    actionHint: "감이 아니라 인터뷰와 전환 지표로 우선순위를 정하세요.",
  },
};

export const KPI_TARGETS = [
  { step: "방문 → 테스트 시작", target: "25%+" },
  { step: "시작 → 완료", target: "60%+" },
  { step: "완료 → 리드", target: "35%+" },
  { step: "리드 → 결제", target: "3%+" },
] as const;
