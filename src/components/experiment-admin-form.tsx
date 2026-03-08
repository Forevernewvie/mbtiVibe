"use client";

import { FormEvent, useState } from "react";

type Props = {
  defaultToken?: string;
};

/**
 * Provides experiment create/update form for admin operations.
 */
export function ExperimentAdminForm({ defaultToken = "" }: Props) {
  const [token, setToken] = useState(defaultToken);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [variants, setVariants] = useState("A,B");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Validates and submits experiment payload with admin token.
   */
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          key,
          name,
          description,
          variants: variants
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          isActive,
        }),
      });

      const data = (await response.json()) as { error?: string; experiment?: { key: string } };

      if (!response.ok) {
        throw new Error(data.error ?? "실험 저장에 실패했습니다.");
      }

      setMessage(`실험이 저장되었습니다: ${data.experiment?.key ?? key}`);
      setKey("");
      setName("");
      setDescription("");
      setVariants("A,B");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">실험 생성/업데이트</h2>

      <input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Admin token"
        className="field-control"
      />

      <input
        type="text"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder="실험 키 (예: checkout_gate_position)"
        required
        className="field-control"
      />

      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="실험 이름"
        required
        className="field-control"
      />

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="설명"
        rows={3}
        className="field-control"
      />

      <input
        type="text"
        value={variants}
        onChange={(event) => setVariants(event.target.value)}
        placeholder="variant1,variant2,variant3"
        required
        className="field-control"
      />

      <label className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="h-4 w-4"
        />
        활성 상태
      </label>

      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary"
      >
        {loading ? "저장 중..." : "실험 저장"}
      </button>

      {message ? (
        <p className="text-sm text-emerald-700" aria-live="polite" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-rose-600" aria-live="assertive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
