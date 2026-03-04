import type { Metadata } from "next";
import { Space_Grotesk, Spectral } from "next/font/google";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const FALLBACK_APP_URL = "https://mbti-vibe.vercel.app";

/**
 * Resolves metadata base URL from runtime env with safe fallback.
 */
function resolveMetadataBase(): URL {
  const appUrl = process.env.APP_URL?.trim();

  if (!appUrl) {
    return new URL(FALLBACK_APP_URL);
  }

  try {
    return new URL(appUrl);
  } catch {
    return new URL(FALLBACK_APP_URL);
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "VibeWeb Growth Lab | 수익형 웹앱 진단",
  description:
    "수익형 웹앱 빌더를 위한 AI 커리어/수입 성장 진단. 5축 점수, 7일 액션플랜, 유료 상세 리포트를 제공합니다.",
  openGraph: {
    title: "VibeWeb Growth Lab",
    description: "AI 커리어/수입 성장 진단 + 7일 액션플랜",
    type: "website",
    locale: "ko_KR",
  },
  alternates: {
    canonical: "/",
  },
};

/**
 * Wraps app with global styles, header, and footer navigation.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${spaceGrotesk.variable} ${spectral.variable} bg-cream text-slate-900 antialiased`}>
        <SiteHeader />
        {children}
        <footer className="border-t border-slate-200 bg-white/70">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-slate-600">
            <p>© {new Date().getFullYear()} VibeWeb Growth Lab</p>
            <div className="flex items-center gap-4">
              <Link href="/terms">이용약관</Link>
              <Link href="/privacy">개인정보처리방침</Link>
              <Link href="/refund">환불정책</Link>
              <Link href="/contact">문의</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
