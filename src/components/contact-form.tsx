"use client";

import { FormEvent, useState } from "react";

/**
 * Renders support ticket form and submits payload to support API.
 */
export function ContactForm() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submits support form to backend and renders ticket result state.
   */
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject, message }),
      });

      const data = (await response.json()) as { ticketId?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "문의 등록에 실패했습니다.");
      }

      setResult(`문의가 접수되었습니다. 티켓 ID: ${data.ticketId}`);
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">이메일</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">제목</span>
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">내용</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          required
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {loading ? "전송 중..." : "문의 보내기"}
      </button>

      {result ? <p className="text-sm text-emerald-700">{result}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </form>
  );
}
