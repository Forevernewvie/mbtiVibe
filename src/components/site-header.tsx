import Link from "next/link";

const links = [
  { href: "/assessment", label: "진단 시작" },
  { href: "/dashboard", label: "대시보드" },
  { href: "/admin/experiments", label: "실험 관리" },
  { href: "/contact", label: "문의" },
];

/**
 * Renders global navigation header for all pages.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[rgba(250,247,240,0.9)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
          VibeWeb Growth Lab
        </Link>
        <nav className="flex w-full flex-wrap items-center gap-2 text-sm font-medium text-slate-700 sm:w-auto sm:gap-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
