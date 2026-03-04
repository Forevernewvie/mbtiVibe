"use client";

import { useState } from "react";
import { APP_POLICY, formatKrw } from "@/config/app-policy";

type Props = {
  assessmentId: string;
  priceCode?: string;
};

/**
 * Renders checkout button for paid report purchase flow.
 */
export function PurchaseReportButton({
  assessmentId,
  priceCode = APP_POLICY.pricing.report.code,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Requests checkout session and redirects browser to payment URL.
   */
  const onClick = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, priceCode }),
      });

      const data = (await res.json()) as { checkoutUrl?: string; error?: string };

      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? "결제 세션 생성에 실패했습니다.");
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="btn btn-primary"
      >
        {loading ? "결제 연결 중..." : `상세 리포트 구매 (${formatKrw(APP_POLICY.pricing.report.amount)})`}
      </button>
      {error ? (
        <p className="text-sm text-rose-600" aria-live="assertive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
