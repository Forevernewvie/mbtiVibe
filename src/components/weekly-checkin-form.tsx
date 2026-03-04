"use client";

import { FormEvent, useState } from "react";

type Props = {
  assessmentId: string;
};

/**
 * Captures weekly execution/focus/confidence feedback from users.
 */
export function WeeklyCheckinForm({ assessmentId }: Props) {
  const [executionScore, setExecutionScore] = useState(3);
  const [focusScore, setFocusScore] = useState(3);
  const [confidenceScore, setConfidenceScore] = useState(3);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Submits weekly check-in payload and updates completion status hint.
   */
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/weekly-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          executionScore,
          focusScore,
          confidenceScore,
          note,
        }),
      });

      const data = (await response.json()) as { completionRate?: number; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "체크인 저장에 실패했습니다.");
      }

      setMessage(`체크인 완료. 현재 액션플랜 완료율 ${data.completionRate ?? 0}%`);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">주간 체크인 (3문항)</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <SliderInput label="이번 주 실행 만족도" value={executionScore} setValue={setExecutionScore} />
        <SliderInput label="핵심 목표 집중도" value={focusScore} setValue={setFocusScore} />
        <SliderInput label="다음 주 자신감" value={confidenceScore} setValue={setConfidenceScore} />

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">메모 (선택)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="field-control"
            placeholder="막힌 지점, 다음 주 실험 아이디어를 기록하세요."
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? "저장 중..." : "체크인 저장"}
        </button>

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </form>
    </section>
  );
}

/**
 * Renders bounded numeric slider input with score badge.
 */
function SliderInput({
  label,
  value,
  setValue,
}: {
  label: string;
  value: number;
  setValue: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={5}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          className="w-full"
        />
        <span className="w-8 text-sm font-semibold text-slate-800">{value}</span>
      </div>
    </label>
  );
}
