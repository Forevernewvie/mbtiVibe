import { ContactForm } from "@/components/contact-form";

/**
 * Renders support contact page and ticket submission form.
 */
export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-6 py-14">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">문의하기</h1>
        <p className="mt-2 text-sm text-slate-600">제품 기능, 결제, 환불, 데이터 삭제 요청을 접수할 수 있습니다.</p>
      </section>

      <ContactForm />
    </main>
  );
}
