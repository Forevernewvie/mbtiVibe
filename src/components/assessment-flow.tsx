"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Choice = {
  id: string;
  label: string;
  value: number;
};

type Question = {
  id: string;
  order: number;
  prompt: string;
  axis: string;
  choices: Choice[];
};

type StartResponse = {
  assessmentId: string;
  sessionToken: string;
  currentQuestion: number;
  totalQuestions: number;
  questions: Question[];
};

/**
 * Orchestrates full client-side assessment questionnaire flow.
 */
export function AssessmentFlow() {
  const router = useRouter();

  const [assessmentId, setAssessmentId] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /**
     * Bootstraps assessment session and loads questionnaire.
     */
    const run = async () => {
      try {
        const sessionToken = window.localStorage.getItem("vibe_session") ?? undefined;

        const response = await fetch("/api/assessment/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionToken }),
        });

        const data = (await response.json()) as StartResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "진단 시작에 실패했습니다.");
        }

        window.localStorage.setItem("vibe_session", data.sessionToken);
        setAssessmentId(data.assessmentId);
        setQuestions(data.questions);
        setCurrentQuestion(data.currentQuestion);
      } catch (err) {
        setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const activeQuestion = useMemo(() => questions[currentQuestion], [questions, currentQuestion]);
  const progress = questions.length > 0 ? Math.round((currentQuestion / questions.length) * 100) : 0;

  /**
   * Persists selected answer and advances to next question or result page.
   */
  const onSelectChoice = async (questionId: string, choiceId: string) => {
    if (!assessmentId) return;

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/assessment/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assessmentId,
          questionId,
          choiceId,
        }),
      });

      const data = (await response.json()) as {
        currentQuestion?: number;
        totalQuestions?: number;
        isLast?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "응답 저장에 실패했습니다.");
      }

      if (data.isLast) {
        const completed = await fetch("/api/assessment/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ assessmentId }),
        });

        const completedData = (await completed.json()) as { error?: string };
        if (!completed.ok) {
          throw new Error(completedData.error ?? "진단 완료 처리에 실패했습니다.");
        }

        router.push(`/results/${assessmentId}`);
        return;
      }

      setCurrentQuestion((previous) => {
        const fallbackNext = Math.min(previous + 1, Math.max(questions.length - 1, 0));
        return data.currentQuestion ?? fallbackNext;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
        진단 데이터를 준비하고 있습니다...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!activeQuestion) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        응답이 모두 완료되었습니다. 결과 페이지로 이동합니다...
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>
            문항 {currentQuestion + 1} / {questions.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">{activeQuestion.axis}</p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{activeQuestion.prompt}</h2>
      </div>

      <div className="grid gap-3">
        {activeQuestion.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={submitting}
            onClick={() => onSelectChoice(activeQuestion.id, choice.id)}
            className="choice-button"
          >
            {choice.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
