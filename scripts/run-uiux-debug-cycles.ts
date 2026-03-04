import "dotenv/config";

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPORT_DIR = "reports";
const DEFAULT_CYCLE_COUNT = 10;
const DEFAULT_APP_URL = "https://mbti-vibe.vercel.app";
const OPERATIONAL_ROUTES = ["/", "/assessment", "/dashboard", "/contact", "/privacy", "/terms", "/refund"] as const;
const REQUIRED_CSS_SELECTORS = [
  ".btn",
  ".btn-primary",
  ".btn-secondary",
  ".btn-contrast",
  ".choice-button",
  ".field-control",
] as const;

type CommandSpec = {
  id: string;
  command: string;
  args: string[];
};

type CommandResult = {
  id: string;
  success: boolean;
  exitCode: number;
  output: string;
};

type RouteResult = {
  path: string;
  status: number;
  success: boolean;
};

type ValidationResult = {
  id: string;
  success: boolean;
  details: string;
};

type CycleReport = {
  cycleIndex: number;
  startedAt: string;
  finishedAt: string;
  prompt: string;
  commandResults: CommandResult[];
  routeResults: RouteResult[];
  validationResults: ValidationResult[];
  findings: string[];
  passed: boolean;
  nextPrompt: string;
};

const DEBUG_PROMPT = [
  "[R] Role: You are MBTIVibe QA + UI/UX debugger.",
  "[A] Aim: Detect and fix production-impacting bugs and UX regressions.",
  "[L] Limits: No hardcoded secrets, no duplicate logic, keep accessibility and mobile usability.",
  "[P] Procedure:",
  "1) Run tests/typecheck/lint/build.",
  "2) Verify core pages are reachable and key CTA UI markers exist.",
  "3) Verify CSS interaction states (hover/focus/disabled) and form control clarity.",
  "4) Record findings and fix before next cycle.",
  "[H] Handoff:",
  "- STATUS: PASS/FAIL",
  "- FINDINGS: concrete issues only",
  "- NEXT_PROMPT: follow-up for next cycle",
].join("\n");

const COMMANDS: CommandSpec[] = [
  { id: "test", command: "npm", args: ["test"] },
  { id: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { id: "lint", command: "npm", args: ["run", "lint"] },
  { id: "build", command: "npm", args: ["run", "build"] },
];

/**
 * Runs one shell command and captures success/failure details.
 */
async function runCommand(spec: CommandSpec): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(spec.command, spec.args, {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024 * 16,
    });

    return {
      id: spec.id,
      success: true,
      exitCode: 0,
      output: `${stdout}\n${stderr}`.trim(),
    };
  } catch (error) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      id: spec.id,
      success: false,
      exitCode: err.code ?? 1,
      output: `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`.trim(),
    };
  }
}

/**
 * Verifies HTTP reachability of operational pages on the target application URL.
 */
async function verifyRoutes(baseUrl: string): Promise<RouteResult[]> {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const results: RouteResult[] = [];

  for (const path of OPERATIONAL_ROUTES) {
    const response = await fetch(`${normalizedBase}${path}`, {
      method: "GET",
      redirect: "manual",
    });

    const success = response.status >= 200 && response.status < 400;
    results.push({
      path,
      status: response.status,
      success,
    });
  }

  return results;
}

/**
 * Validates key UI/UX invariants from source and rendered homepage output.
 */
async function verifyUiInvariants(baseUrl: string): Promise<ValidationResult[]> {
  const homepageResponse = await fetch(baseUrl, { method: "GET" });
  const homepageHtml = await homepageResponse.text();
  const cssContent = await readFile("src/app/globals.css", "utf8");
  const layoutContent = await readFile("src/app/layout.tsx", "utf8");
  const headerContent = await readFile("src/components/site-header.tsx", "utf8");

  const validations: ValidationResult[] = [];

  const ctaVisible =
    homepageHtml.includes("무료 진단 시작") &&
    homepageHtml.includes("btn btn-primary") &&
    homepageHtml.includes("btn btn-secondary");
  validations.push({
    id: "home_cta_presence",
    success: ctaVisible,
    details: "Homepage contains primary/secondary CTA markers.",
  });

  const selectorsFound = REQUIRED_CSS_SELECTORS.every((selector) => cssContent.includes(selector));
  validations.push({
    id: "css_selector_coverage",
    success: selectorsFound,
    details: "Global stylesheet contains shared button/input selector set.",
  });

  const focusStyleFound =
    cssContent.includes(".btn:focus-visible") &&
    cssContent.includes(".choice-button:focus-visible") &&
    cssContent.includes(".field-control:focus-visible");
  validations.push({
    id: "focus_visibility",
    success: focusStyleFound,
    details: "Focus-visible styles exist for keyboard accessibility.",
  });

  const metadataFallbackFound =
    layoutContent.includes("resolveMetadataBase") &&
    layoutContent.includes("FALLBACK_APP_URL") &&
    layoutContent.includes("metadataBase: resolveMetadataBase()");
  validations.push({
    id: "metadata_base_safety",
    success: metadataFallbackFound,
    details: "Metadata base URL uses runtime-safe fallback resolver.",
  });

  const responsiveHeaderFound =
    headerContent.includes("flex-col") &&
    headerContent.includes("sm:flex-row") &&
    headerContent.includes("focus-visible:outline");
  validations.push({
    id: "header_mobile_accessibility",
    success: responsiveHeaderFound,
    details: "Header navigation includes mobile layout and keyboard focus affordances.",
  });

  return validations;
}

/**
 * Builds the next-cycle prompt text based on failed checkpoints.
 */
function buildNextPrompt(report: CycleReport): string {
  const failedCommands = report.commandResults.filter((item) => !item.success).map((item) => item.id);
  const failedRoutes = report.routeResults.filter((item) => !item.success).map((item) => item.path);
  const failedValidations = report.validationResults
    .filter((item) => !item.success)
    .map((item) => item.id);

  return [
    DEBUG_PROMPT,
    "",
    "[NEXT_CYCLE_INPUT]",
    `- failed_commands: ${failedCommands.length > 0 ? failedCommands.join(", ") : "none"}`,
    `- failed_routes: ${failedRoutes.length > 0 ? failedRoutes.join(", ") : "none"}`,
    `- failed_ui_checks: ${failedValidations.length > 0 ? failedValidations.join(", ") : "none"}`,
    "",
    "Fix failures first, then re-run full cycle.",
  ].join("\n");
}

/**
 * Writes cycle artifacts in JSON and markdown formats.
 */
async function writeCycleArtifacts(report: CycleReport): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });

  const jsonPath = join(REPORT_DIR, `uiux-debug-cycle-${report.cycleIndex}.json`);
  const mdPath = join(REPORT_DIR, `uiux-debug-cycle-${report.cycleIndex}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const commandLines = report.commandResults.map(
    (item) => `- ${item.id}: ${item.success ? "PASS" : `FAIL (exit=${item.exitCode})`}`,
  );
  const routeLines = report.routeResults.map(
    (item) => `- ${item.path}: ${item.success ? "PASS" : `FAIL (status=${item.status})`}`,
  );
  const validationLines = report.validationResults.map(
    (item) => `- ${item.id}: ${item.success ? "PASS" : "FAIL"} (${item.details})`,
  );
  const findingLines = report.findings.length > 0 ? report.findings.map((item) => `- ${item}`) : ["- none"];

  const markdown = [
    `# UIUX Debug Cycle ${report.cycleIndex}`,
    "",
    `- StartedAt: ${report.startedAt}`,
    `- FinishedAt: ${report.finishedAt}`,
    `- Passed: ${report.passed}`,
    "",
    "## Prompt",
    "```text",
    report.prompt,
    "```",
    "",
    "## Commands",
    ...commandLines,
    "",
    "## Route Checks",
    ...routeLines,
    "",
    "## UI/UX Validations",
    ...validationLines,
    "",
    "## Findings",
    ...findingLines,
    "",
    "## NEXT_PROMPT",
    "```text",
    report.nextPrompt,
    "```",
  ].join("\n");

  await writeFile(mdPath, markdown, "utf8");
}

/**
 * Runs one complete debug cycle and returns structured results.
 */
async function runCycle(cycleIndex: number, appUrl: string): Promise<CycleReport> {
  const startedAt = new Date().toISOString();
  const commandResults: CommandResult[] = [];

  for (const command of COMMANDS) {
    const result = await runCommand(command);
    commandResults.push(result);
  }

  const routeResults = await verifyRoutes(appUrl);
  const validationResults = await verifyUiInvariants(appUrl);

  const findings: string[] = [];
  commandResults
    .filter((item) => !item.success)
    .forEach((item) => findings.push(`command_failed:${item.id}`));
  routeResults
    .filter((item) => !item.success)
    .forEach((item) => findings.push(`route_failed:${item.path}:${item.status}`));
  validationResults
    .filter((item) => !item.success)
    .forEach((item) => findings.push(`ui_validation_failed:${item.id}`));

  const finishedAt = new Date().toISOString();
  const passed = findings.length === 0;

  const baseReport: CycleReport = {
    cycleIndex,
    startedAt,
    finishedAt,
    prompt: DEBUG_PROMPT,
    commandResults,
    routeResults,
    validationResults,
    findings,
    passed,
    nextPrompt: "",
  };

  return {
    ...baseReport,
    nextPrompt: buildNextPrompt(baseReport),
  };
}

/**
 * Executes requested number of debug cycles and prints aggregate summary.
 */
async function main(): Promise<void> {
  const totalCycles = Number(process.env.DEBUG_CYCLE_COUNT ?? String(DEFAULT_CYCLE_COUNT));
  const appUrl = (process.env.APP_URL ?? DEFAULT_APP_URL).trim();

  if (!Number.isInteger(totalCycles) || totalCycles <= 0) {
    throw new Error("DEBUG_CYCLE_COUNT must be a positive integer.");
  }

  const cycleReports: CycleReport[] = [];

  for (let cycleIndex = 1; cycleIndex <= totalCycles; cycleIndex += 1) {
    const cycleReport = await runCycle(cycleIndex, appUrl);
    cycleReports.push(cycleReport);
    await writeCycleArtifacts(cycleReport);
  }

  const passedCount = cycleReports.filter((item) => item.passed).length;
  const failedCount = cycleReports.length - passedCount;

  console.log(
    JSON.stringify(
      {
        totalCycles,
        passedCount,
        failedCount,
        appUrl,
        reports: cycleReports.map((item) => ({
          cycleIndex: item.cycleIndex,
          passed: item.passed,
          findings: item.findings,
        })),
        reportDirectory: REPORT_DIR,
      },
      null,
      2,
    ),
  );

  if (failedCount > 0) {
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
