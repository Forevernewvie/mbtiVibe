import Link from "next/link";

/**
 * Displays fallback page for unresolved routes.
 */
export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-semibold text-slate-900">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-sm text-slate-600">요청하신 결과가 없거나 삭제되었습니다.</p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
      >
        홈으로 이동
      </Link>
    </main>
  );
}
