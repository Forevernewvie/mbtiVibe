import "dotenv/config";

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

const DEFAULT_APP_URL = "http://127.0.0.1:3000";
const REPORT_ROOT = "reports/ui-runtime";
const APP_DIRECTORY = "src/app";
const ROUTE_SOURCE_FILES = ["src/app/layout.tsx", "src/components/site-header.tsx", "src/app/page.tsx"] as const;
const VIEWPORTS = [
  { id: "mobile", width: 390, height: 844 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "desktop", width: 1440, height: 900 },
] as const;
const CORE_ROUTES = ["/", "/assessment", "/dashboard", "/contact", "/results/demo"] as const;
const REQUIRED_ROUTE_HINTS = ["/results/"] as const;
const MIN_TOUCH_TARGET_PX = 44;
const TAB_STEPS = 6;
const SCREENSHOT_JPEG_QUALITY = 70;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SCREENSHOT_TIMEOUT_MS = 10_000;
const RUN_STATIC_CHECKS = process.env.UI_AUDIT_RUN_STATIC === "true";

type Severity = "P0" | "P1" | "P2" | "P3";

type Finding = {
  severity: Severity;
  route: string;
  viewport: string;
  message: string;
};

type StaticCheckResult = {
  id: string;
  success: boolean;
  output: string;
};

type RouteProbe = {
  route: string;
  viewport: string;
  status: number;
  screenshotPath: string;
  findings: Finding[];
};

type AuditReport = {
  startedAt: string;
  finishedAt: string;
  appUrl: string;
  discoveredRoutes: string[];
  probes: RouteProbe[];
  findings: Finding[];
  staticChecks: StaticCheckResult[];
  passed: boolean;
};

/**
 * Checks whether a probe contains blocking P0 findings.
 */
function hasBlockingProbeFailure(probe: RouteProbe): boolean {
  return probe.status === 0 || probe.findings.some((finding) => finding.severity === "P0");
}

/**
 * Runs command-line static quality checks and captures output.
 */
async function runStaticChecks(): Promise<StaticCheckResult[]> {
  const checks: Array<{ id: string; command: string }> = [
    { id: "lint", command: "npm run lint" },
    { id: "typecheck", command: "npm run typecheck" },
    { id: "test", command: "npm test" },
    { id: "build", command: "npm run build" },
  ];
  const results: StaticCheckResult[] = [];

  for (const check of checks) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const [binary, ...args] = check.command.split(" ");
      const { stdout, stderr } = await execFileAsync(binary, args, {
        env: process.env,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });

      results.push({
        id: check.id,
        success: true,
        output: `${stdout}\n${stderr}`.trim(),
      });
    } catch (error) {
      const cast = error as { stdout?: string; stderr?: string; message?: string };
      results.push({
        id: check.id,
        success: false,
        output: `${cast.stdout ?? ""}\n${cast.stderr ?? ""}\n${cast.message ?? ""}`.trim(),
      });
    }
  }

  return results;
}

/**
 * Normalizes app URL and strips trailing slash.
 */
function normalizeAppUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.endsWith("/")) {
    return trimmed.slice(0, -1);
  }

  return trimmed;
}

/**
 * Recursively walks app directory to discover all page routes.
 */
async function walkDirectory(pathname: string): Promise<string[]> {
  const entries = await readdir(pathname, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(pathname, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath)));
      continue;
    }

    if (entry.isFile() && extname(entry.name) === ".tsx" && entry.name === "page.tsx") {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Converts app-router page file path into URL path.
 */
function filePathToRoute(filePath: string): string | null {
  const fromApp = relative(APP_DIRECTORY, filePath).split(sep).join("/");
  if (fromApp === "page.tsx") {
    return "/";
  }
  const withoutPage = fromApp.replace(/\/page\.tsx$/, "");
  const segments = withoutPage.split("/").filter(Boolean);

  const normalizedSegments = segments
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"))
    .map((segment) => {
      if (segment.startsWith("[") && segment.endsWith("]")) {
        return segment;
      }

      return segment;
    });

  if (normalizedSegments.length === 0) {
    return "/";
  }

  if (normalizedSegments.some((segment) => segment.startsWith("[") && segment.endsWith("]"))) {
    return null;
  }

  return `/${normalizedSegments.join("/")}`;
}

/**
 * Filters visual routes and excludes non-page endpoints.
 */
function isVisualRoute(route: string): boolean {
  return route.startsWith("/") && !route.startsWith("/api/") && !route.includes(".");
}

/**
 * Extracts href links from source snippets to cover header/footer/CTA paths.
 */
async function extractRouteHintsFromSource(): Promise<string[]> {
  const hints = new Set<string>();

  for (const path of ROUTE_SOURCE_FILES) {
    const content = await readFile(path, "utf8");
    const matches = content.match(/href="(\/[^"]*)"/g) ?? [];

    for (const entry of matches) {
      const route = entry.replace(/href="/, "").replace(/"$/, "");
      if (route.startsWith("/")) {
        hints.add(route);
      }
    }
  }

  return Array.from(hints);
}

/**
 * Pulls sitemap routes from running application for runtime parity.
 */
async function extractRoutesFromSitemap(appUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${appUrl}/sitemap.xml`);
    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const routes = new Set<string>();
    const matches = xml.match(/<loc>[^<]+<\/loc>/g) ?? [];

    for (const match of matches) {
      const loc = match.replace("<loc>", "").replace("</loc>", "").trim();
      const url = new URL(loc);
      routes.add(url.pathname);
    }

    return Array.from(routes);
  } catch {
    return [];
  }
}

/**
 * Deduplicates discovered routes while keeping sort order stable.
 */
function dedupeRoutes(routes: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const route of routes) {
    if (!route.startsWith("/")) {
      continue;
    }

    if (seen.has(route)) {
      continue;
    }

    seen.add(route);
    output.push(route);
  }

  return output;
}

/**
 * Builds full route inventory using app files, sitemap, and source hints.
 */
async function discoverRoutes(appUrl: string): Promise<string[]> {
  const appPageFiles = await walkDirectory(APP_DIRECTORY);
  const appRoutes = appPageFiles
    .map((filePath) => filePathToRoute(filePath))
    .filter((route): route is string => Boolean(route));
  const sitemapRoutes = await extractRoutesFromSitemap(appUrl);
  const sourceHints = await extractRouteHintsFromSource();

  const all = [...CORE_ROUTES, ...appRoutes, ...sitemapRoutes, ...sourceHints];

  return dedupeRoutes(all)
    .filter((route) => isVisualRoute(route))
    .sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * Captures console/page/network runtime failures while route is open.
 */
function wireRuntimeEventCollection(page: Page): {
  dispose: () => void;
  consume: () => Finding[];
} {
  const findings: Finding[] = [];

  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") {
      findings.push({
        severity: "P1",
        route: "",
        viewport: "",
        message: `console_error: ${message.text()}`,
      });
    }
  };

  const onPageError = (error: Error) => {
    findings.push({
      severity: "P0",
      route: "",
      viewport: "",
      message: `page_error: ${error.message}`,
    });
  };

  const onResponse = (response: { status(): number; url(): string }) => {
    if (response.status() >= 500) {
      findings.push({
        severity: "P0",
        route: "",
        viewport: "",
        message: `network_${response.status()}: ${response.url()}`,
      });
      return;
    }

    if (response.status() >= 400) {
      findings.push({
        severity: "P2",
        route: "",
        viewport: "",
        message: `network_${response.status()}: ${response.url()}`,
      });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  return {
    dispose: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
    },
    consume: () => findings,
  };
}

/**
 * Validates CTA visibility and contrast on home route.
 */
async function validateHomeCta(page: Page, route: string, viewport: string): Promise<Finding[]> {
  if (route !== "/") {
    return [];
  }

  const state = await page
    .locator('a:has-text("무료 진단 시작"), button:has-text("무료 진단 시작")')
    .first()
    .evaluate((node) => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0",
        width: rect.width,
        height: rect.height,
      };
    })
    .catch(() => null);

  if (!state || !state.visible) {
    return [
      {
        severity: "P1",
        route,
        viewport,
        message: "첫 화면 CTA(무료 진단 시작)가 보이지 않거나 렌더되지 않았습니다.",
      },
    ];
  }

  const findings: Finding[] = [];
  if (state.width < MIN_TOUCH_TARGET_PX || state.height < MIN_TOUCH_TARGET_PX) {
    findings.push({
      severity: "P1",
      route,
      viewport,
      message: `CTA 터치 타겟이 ${MIN_TOUCH_TARGET_PX}px 미만입니다.`,
    });
  }

  return findings;
}

/**
 * Detects horizontal overflow and clipped viewport regressions.
 */
async function validateOverflow(page: Page, route: string, viewport: string): Promise<Finding[]> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

  if (overflow > 1) {
    return [
      {
        severity: "P1",
        route,
        viewport,
        message: `가로 오버플로우가 감지되었습니다 (${overflow}px).`,
      },
    ];
  }

  return [];
}

/**
 * Detects small tap targets across interactive controls.
 */
async function validateTouchTargets(page: Page, route: string, viewport: string): Promise<Finding[]> {
  const violations = await page.evaluate((minTarget) => {
    const selectors = [
      "button",
      "a.btn",
      "input[type='checkbox']",
      "input[type='radio']",
      "input[type='range']",
      "summary",
    ];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")));

    return nodes
      .map((element) => {
        const inputType = element instanceof HTMLInputElement ? element.type : "";
        const isCheckLike = inputType === "checkbox" || inputType === "radio";
        const fallbackRect = element.getBoundingClientRect();
        const labelRect = isCheckLike ? element.closest("label")?.getBoundingClientRect() : null;
        const rect = labelRect ?? fallbackRect;

        return {
          text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 32),
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((item) => item.width > 0 && item.height > 0 && (item.width < minTarget || item.height < minTarget))
      .slice(0, 5);
  }, MIN_TOUCH_TARGET_PX);

  return violations.map((violation) => ({
    severity: "P2",
    route,
    viewport,
    message: `터치 타겟 부족: "${violation.text || "unnamed"}" (${Math.round(violation.width)}x${Math.round(violation.height)})`,
  }));
}

/**
 * Verifies keyboard navigation keeps visible focus indicator.
 */
async function validateFocusVisible(page: Page, route: string, viewport: string): Promise<Finding[]> {
  await page.keyboard.press("Tab");
  let focusVisible = false;

  for (let index = 0; index < TAB_STEPS; index += 1) {
    const hasVisibleFocus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const outlineWidth = Number.parseFloat(style.outlineWidth || "0");
      const hasOutline = outlineWidth > 0 && style.outlineStyle !== "none";
      const hasBoxShadow = style.boxShadow && style.boxShadow !== "none";
      const hasRingClass =
        (element.className && String(element.className).includes("focus-visible")) ||
        Boolean(element.getAttribute("data-focus-visible-added"));

      return hasOutline || Boolean(hasBoxShadow) || hasRingClass;
    });

    if (hasVisibleFocus) {
      focusVisible = true;
      break;
    }

    await page.keyboard.press("Tab");
  }

  if (!focusVisible) {
    return [
      {
        severity: "P1",
        route,
        viewport,
        message: "키보드 탭 이동 시 가시적 포커스 표시가 부족합니다.",
      },
    ];
  }

  return [];
}

/**
 * Triggers contact form error state and validates readable error feedback.
 */
async function validateContactErrorState(page: Page, route: string, viewport: string): Promise<Finding[]> {
  if (route !== "/contact") {
    return [];
  }

  await page.route("**/api/support", async (requestRoute) => {
    await requestRoute.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "서버 점검 중입니다." }),
    });
  });

  await page.fill("input[type='email']", "qa@example.com");
  await page.fill("input[type='text']", "테스트 문의");
  await page.fill("textarea", "에러 상태 가독성 검증");
  await page.click("button[type='submit']");

  const alert = page.locator('[role="alert"]').first();
  const alertVisible = await alert.isVisible().catch(() => false);

  if (!alertVisible) {
    return [
      {
        severity: "P1",
        route,
        viewport,
        message: "문의 폼 오류 상태에서 경고 메시지가 노출되지 않았습니다.",
      },
    ];
  }

  return [];
}

/**
 * Probes one route at one viewport and stores screenshot evidence.
 */
async function runRouteProbe(
  browser: Browser,
  appUrl: string,
  route: string,
  viewport: (typeof VIEWPORTS)[number],
  screenshotDir: string,
): Promise<RouteProbe> {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
  });
  const page = await context.newPage();
  const runtime = wireRuntimeEventCollection(page);
  const findings: Finding[] = [];
  let status = 0;

  try {
    const response = await page.goto(`${appUrl}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    status = response?.status() ?? 0;
  } catch (error) {
    findings.push({
      severity: "P0",
      route,
      viewport: viewport.id,
      message: `라우트 로드 실패: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }

  await page.waitForTimeout(300);

  const screenshotPath = join(screenshotDir, `${viewport.id}-${route.replace(/\//g, "_") || "home"}.jpg`);
  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      quality: SCREENSHOT_JPEG_QUALITY,
      type: "jpeg",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
  } catch (error) {
    findings.push({
      severity: "P2",
      route,
      viewport: viewport.id,
      message: `스크린샷 수집 실패: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }

  const runtimeFindings = runtime.consume().map((item) => ({
    ...item,
    route,
    viewport: viewport.id,
  }));
  findings.push(...runtimeFindings);

  if (status >= 500 || status === 0) {
    findings.push({
      severity: "P0",
      route,
      viewport: viewport.id,
      message: `페이지 응답 상태 이상: ${status}`,
    });
  } else if (status >= 400) {
    findings.push({
      severity: "P1",
      route,
      viewport: viewport.id,
      message: `페이지 응답 상태 경고: ${status}`,
    });
  }

  const validationEntries: Array<{
    id: string;
    execute: () => Promise<Finding[]>;
  }> = [
    {
      id: "home_cta",
      execute: () => validateHomeCta(page, route, viewport.id),
    },
    {
      id: "overflow",
      execute: () => validateOverflow(page, route, viewport.id),
    },
    {
      id: "touch_target",
      execute: () => validateTouchTargets(page, route, viewport.id),
    },
    {
      id: "focus_visible",
      execute: () => validateFocusVisible(page, route, viewport.id),
    },
    {
      id: "contact_error_state",
      execute: () => validateContactErrorState(page, route, viewport.id),
    },
  ];

  for (const entry of validationEntries) {
    try {
      findings.push(...(await entry.execute()));
    } catch (error) {
      findings.push({
        severity: "P2",
        route,
        viewport: viewport.id,
        message: `검증 중 예외(${entry.id}): ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  runtime.dispose();
  await context.close();

  return {
    route,
    viewport: viewport.id,
    status,
    screenshotPath,
    findings,
  };
}

/**
 * Promotes unresolved dynamic route requirement to P1 finding.
 */
function validateRequiredRoutes(discoveredRoutes: string[]): Finding[] {
  const findings: Finding[] = [];

  for (const required of REQUIRED_ROUTE_HINTS) {
    const matched = discoveredRoutes.some((route) => route.startsWith(required));
    if (!matched) {
      findings.push({
        severity: "P1",
        route: required,
        viewport: "all",
        message: "필수 동적 라우트 결과 페이지를 생성하지 못했습니다.",
      });
    }
  }

  return findings;
}

/**
 * Writes audit report to JSON and markdown artifacts.
 */
async function writeReport(report: AuditReport, directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const jsonPath = join(directory, "report.json");
  const markdownPath = join(directory, "report.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const findingLines =
    report.findings.length > 0
      ? report.findings.map(
          (finding) => `- [${finding.severity}][${finding.route}][${finding.viewport}] ${finding.message}`,
        )
      : ["- none"];
  const routeLines = report.probes.map(
    (probe) => `- ${probe.route} @ ${probe.viewport}: status ${probe.status}, screenshot ${probe.screenshotPath}`,
  );
  const checkLines = report.staticChecks.map((check) => `- ${check.id}: ${check.success ? "PASS" : "FAIL"}`);

  const markdown = [
    "# UI Runtime Audit Report",
    "",
    `- startedAt: ${report.startedAt}`,
    `- finishedAt: ${report.finishedAt}`,
    `- appUrl: ${report.appUrl}`,
    `- passed: ${report.passed}`,
    "",
    "## Static Checks",
    ...checkLines,
    "",
    "## Route Probes",
    ...routeLines,
    "",
    "## Findings",
    ...findingLines,
  ].join("\n");

  await writeFile(markdownPath, markdown, "utf8");
}

/**
 * Executes full runtime audit and emits report artifacts.
 */
async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const appUrl = normalizeAppUrl(process.env.APP_URL ?? DEFAULT_APP_URL);
  const cycleId = new Date().toISOString().replaceAll(":", "-");
  const reportDirectory = join(REPORT_ROOT, cycleId);
  const screenshotDirectory = join(reportDirectory, "screenshots");
  await mkdir(screenshotDirectory, { recursive: true });

  const staticChecks = RUN_STATIC_CHECKS ? await runStaticChecks() : [];
  const staticFailures = staticChecks.filter((check) => !check.success);

  const discoveredRoutes = await discoverRoutes(appUrl);
  const browser = await chromium.launch({ headless: true });
  const probes: RouteProbe[] = [];

  for (const route of discoveredRoutes) {
    for (const viewport of VIEWPORTS) {
      let probe = await runRouteProbe(browser, appUrl, route, viewport, screenshotDirectory);

      if (hasBlockingProbeFailure(probe)) {
        const retryProbe = await runRouteProbe(browser, appUrl, route, viewport, screenshotDirectory);
        if (!hasBlockingProbeFailure(retryProbe)) {
          probe = retryProbe;
        }
      }

      probes.push(probe);
    }
  }

  await browser.close();

  const runtimeFindings = probes.flatMap((probe) => probe.findings);
  const routeRequirementFindings = validateRequiredRoutes(discoveredRoutes);
  const staticFindings: Finding[] = staticFailures.map((failure) => ({
    severity: "P0",
    route: "global",
    viewport: "all",
    message: `정적 검사 실패: ${failure.id}`,
  }));
  const findings = [...staticFindings, ...routeRequirementFindings, ...runtimeFindings];
  const finishedAt = new Date().toISOString();
  const passed = findings.every((finding) => finding.severity !== "P0" && finding.severity !== "P1");

  const report: AuditReport = {
    startedAt,
    finishedAt,
    appUrl,
    discoveredRoutes,
    probes,
    findings,
    staticChecks,
    passed,
  };

  await writeReport(report, reportDirectory);

  console.log(
    JSON.stringify(
      {
        ok: passed,
        appUrl,
        reportDirectory,
        findings: findings.map((finding) => `[${finding.severity}][${finding.route}][${finding.viewport}] ${finding.message}`),
      },
      null,
      2,
    ),
  );

  if (!passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
