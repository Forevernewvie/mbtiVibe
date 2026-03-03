"use client";

import { useMemo, useState } from "react";

type Plan = {
  id: string;
  dayIndex: number;
  title: string;
  details: string;
  completed: boolean;
};

type Props = {
  plans: Plan[];
};

/**
 * Displays action-plan checklist and persists item completion toggles.
 */
export function ActionPlanChecklist({ plans }: Props) {
  const [items, setItems] = useState(plans);
  const [error, setError] = useState<string | null>(null);

  const completionRate = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.round((items.filter((item) => item.completed).length / items.length) * 100);
  }, [items]);

  /**
   * Optimistically toggles checklist item state and persists API update.
   */
  const toggle = async (planId: string, completed: boolean) => {
    setError(null);

    setItems((prev) => prev.map((item) => (item.id === planId ? { ...item, completed } : item)));

    const response = await fetch("/api/action-plan/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, completed }),
    });

    if (!response.ok) {
      setItems((prev) => prev.map((item) => (item.id === planId ? { ...item, completed: !completed } : item)));
      setError("체크리스트 저장에 실패했습니다.");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">7일 액션플랜</h2>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          완료율 {completionRate}%
        </span>
      </div>

      <div className="space-y-3">
        {items.map((plan) => (
          <label
            key={plan.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300"
          >
            <input
              type="checkbox"
              checked={plan.completed}
              onChange={(event) => toggle(plan.id, event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Day {plan.dayIndex}. {plan.title}
              </p>
              <p className="text-sm text-slate-600">{plan.details}</p>
            </div>
          </label>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </section>
  );
}
