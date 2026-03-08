import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PRIVACY_POLICY_DOCUMENT } from "../src/lib/legal/privacy-policy-content";

const DOCUMENT_OUTPUT_DIRECTORY = path.join(process.cwd(), "docs", "privacy");
const DOCUMENT_OUTPUT_PATH = path.join(DOCUMENT_OUTPUT_DIRECTORY, "index.html");
const ROOT_INDEX_OUTPUT_PATH = path.join(process.cwd(), "docs", "index.html");
const GITHUB_PAGES_BASE_PATH = "/mbtiVibe";

/**
 * Escapes HTML special characters to keep generated legal text safe in static output.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Returns the GitHub Pages privacy URL for the repository.
 */
function resolveGithubPagesPrivacyUrl(): string {
  return `https://forevernewvie.github.io${GITHUB_PAGES_BASE_PATH}/privacy/`;
}

/**
 * Builds the root GitHub Pages redirect so the site entry route lands on the policy page.
 */
function renderRootRedirectHtml(): string {
  const targetUrl = `${GITHUB_PAGES_BASE_PATH}/privacy/`;

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${targetUrl}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting to privacy policy</title>
    <link rel="canonical" href="${targetUrl}" />
  </head>
  <body>
    <p>Redirecting to <a href="${targetUrl}">${targetUrl}</a></p>
  </body>
</html>
`;
}

/**
 * Builds GitHub Pages-friendly HTML from the canonical privacy policy document.
 */
function renderPrivacyPolicyHtml(): string {
  const sectionsMarkup = PRIVACY_POLICY_DOCUMENT.sections
    .map((section) => {
      const items = section.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");

      return `
        <section class="policy-section">
          <h2>${escapeHtml(section.title)}</h2>
          <ul>${items}</ul>
        </section>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(PRIVACY_POLICY_DOCUMENT.title)} | ${escapeHtml(PRIVACY_POLICY_DOCUMENT.operatorName)}</title>
    <meta
      name="description"
      content="${escapeHtml(PRIVACY_POLICY_DOCUMENT.introduction)}"
    />
    <style>
      :root {
        color-scheme: light;
        --page-bg: #f6f8fa;
        --card-bg: #ffffff;
        --text-main: #1f2328;
        --text-muted: #59636e;
        --line: #d0d7de;
        --accent: #0969da;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--page-bg);
        color: var(--text-main);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        line-height: 1.7;
      }

      .page {
        width: min(100%, 960px);
        margin: 0 auto;
        padding: 48px 20px 80px;
      }

      .policy-card {
        background: var(--card-bg);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 32px;
        box-shadow: 0 1px 2px rgba(31, 35, 40, 0.06);
      }

      .eyebrow {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 8px 0 0;
        font-size: 32px;
        line-height: 1.25;
      }

      .meta,
      .lead,
      .contact-copy,
      .footer-note {
        color: var(--text-muted);
      }

      .meta {
        margin-top: 8px;
        font-size: 14px;
      }

      .lead {
        margin-top: 16px;
        font-size: 16px;
      }

      .policy-section,
      .contact-section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--line);
      }

      h2 {
        margin: 0 0 12px;
        font-size: 22px;
      }

      ul {
        margin: 0;
        padding-left: 20px;
      }

      li + li {
        margin-top: 8px;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      .footer-note {
        margin-top: 32px;
        font-size: 14px;
      }

      @media (max-width: 640px) {
        .page {
          padding: 24px 12px 56px;
        }

        .policy-card {
          padding: 24px 18px;
          border-radius: 10px;
        }

        h1 {
          font-size: 28px;
        }

        h2 {
          font-size: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <article class="policy-card">
        <p class="eyebrow">${escapeHtml(PRIVACY_POLICY_DOCUMENT.subtitle)}</p>
        <h1>${escapeHtml(PRIVACY_POLICY_DOCUMENT.title)}</h1>
        <p class="meta">운영 주체: ${escapeHtml(PRIVACY_POLICY_DOCUMENT.operatorName)} | 최종 업데이트: ${escapeHtml(
          PRIVACY_POLICY_DOCUMENT.updatedAt,
        )}</p>
        <p class="lead">${escapeHtml(PRIVACY_POLICY_DOCUMENT.introduction)}</p>
        ${sectionsMarkup}
        <section class="contact-section">
          <h2>10. 문의처</h2>
          <p class="contact-copy">개인정보 관련 문의, 열람, 정정, 삭제 요청은 아래 경로로 접수할 수 있습니다.</p>
          <p><a href="${escapeHtml(PRIVACY_POLICY_DOCUMENT.contactAbsoluteUrl)}">${escapeHtml(
            PRIVACY_POLICY_DOCUMENT.contactAbsoluteUrl,
          )}</a></p>
          <p class="footer-note">
            GitHub Pages 공개 주소:
            <a href="${escapeHtml(resolveGithubPagesPrivacyUrl())}">${escapeHtml(resolveGithubPagesPrivacyUrl())}</a>
          </p>
        </section>
      </article>
    </main>
  </body>
</html>
`;
}

/**
 * Writes the static privacy policy page into the docs directory used by GitHub Pages.
 */
async function main(): Promise<void> {
  await mkdir(DOCUMENT_OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(DOCUMENT_OUTPUT_PATH, renderPrivacyPolicyHtml(), "utf8");
  await writeFile(ROOT_INDEX_OUTPUT_PATH, renderRootRedirectHtml(), "utf8");
  process.stdout.write(`Generated ${DOCUMENT_OUTPUT_PATH}\n`);
  process.stdout.write(`Generated ${ROOT_INDEX_OUTPUT_PATH}\n`);
}

void main();
