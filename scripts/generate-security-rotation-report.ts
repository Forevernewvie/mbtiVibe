import "dotenv/config";

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPORT_DIRECTORY = "reports";
const REQUIRED_CHECK_IDS = ["security_rotation", "vercel_env_sync"] as const;

type CheckStatus = "passed" | "failed" | "skipped";
type CheckResult = {
  id: string;
  status: CheckStatus;
  output: string;
  payload: unknown | null;
};

type CheckSpec = {
  id: string;
  command: string;
  args: string[];
  shouldRun: () => boolean;
  skipReason: string;
};

/**
 * Executes one shell command and captures stdout/stderr with process status.
 */
async function runCommand(
  command: string,
  args: string[],
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024 * 16,
    });

    return {
      success: true,
      output: `${stdout}\n${stderr}`.trim(),
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };

    return {
      success: false,
      output: `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`.trim(),
    };
  }
}

/**
 * Extracts the first JSON object payload from mixed npm/command output.
 */
function extractJsonPayload(output: string): unknown | null {
  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = output.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Evaluates one check with prerequisite handling and normalized status mapping.
 */
async function runCheck(spec: CheckSpec): Promise<CheckResult> {
  if (!spec.shouldRun()) {
    return {
      id: spec.id,
      status: "skipped",
      output: spec.skipReason,
      payload: null,
    };
  }

  const commandResult = await runCommand(spec.command, spec.args);

  return {
    id: spec.id,
    status: commandResult.success ? "passed" : "failed",
    output: commandResult.output,
    payload: extractJsonPayload(commandResult.output),
  };
}

/**
 * Produces markdown report content for archival and CI artifact publishing.
 */
function buildReportMarkdown(results: CheckResult[]): string {
  const passed = results.filter((result) => result.status === "passed").map((result) => result.id);
  const failed = results.filter((result) => result.status === "failed").map((result) => result.id);
  const skipped = results.filter((result) => result.status === "skipped").map((result) => result.id);

  return [
    "# Security Rotation Report",
    "",
    `- GeneratedAt: ${new Date().toISOString()}`,
    `- Passed checks: ${passed.length > 0 ? passed.join(", ") : "none"}`,
    `- Failed checks: ${failed.length > 0 ? failed.join(", ") : "none"}`,
    `- Skipped checks: ${skipped.length > 0 ? skipped.join(", ") : "none"}`,
    "",
    "## Check Details",
    ...results.map((result) => `- ${result.id}: ${result.status.toUpperCase()}`),
    "",
    "## Raw Outputs",
    ...results.flatMap((result) => [
      `### ${result.id}`,
      "```text",
      result.output || "(no output)",
      "```",
      "",
    ]),
  ].join("\n");
}

/**
 * Writes the markdown report to reports directory and returns absolute report path.
 */
async function writeReport(markdown: string): Promise<string> {
  await mkdir(REPORT_DIRECTORY, { recursive: true });

  const fileTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(REPORT_DIRECTORY, `security-rotation-report-${fileTimestamp}.md`);

  await writeFile(filePath, markdown, "utf8");

  return filePath;
}

/**
 * Runs security rotation related checks and exports a consolidated markdown report.
 */
async function main(): Promise<void> {
  const checks: CheckSpec[] = [
    {
      id: "security_rotation",
      command: "npm",
      args: ["run", "ops:verify:security-rotation"],
      shouldRun: () =>
        Boolean(process.env.VERCEL_TOKEN && process.env.DATABASE_URL && process.env.ADMIN_API_TOKEN),
      skipReason: "Skipped: VERCEL_TOKEN, DATABASE_URL, and ADMIN_API_TOKEN are required.",
    },
    {
      id: "vercel_env_sync",
      command: "npm",
      args: ["run", "ops:verify:vercel-env-sync"],
      shouldRun: () => Boolean(process.env.VERCEL_TOKEN),
      skipReason: "Skipped: VERCEL_TOKEN is required.",
    },
    {
      id: "vercel_access",
      command: "npm",
      args: ["run", "ops:verify:vercel-protection"],
      shouldRun: () => Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_ALIAS_URL),
      skipReason: "Skipped: VERCEL_TOKEN and VERCEL_ALIAS_URL are required.",
    },
  ];

  const results = await Promise.all(checks.map((spec) => runCheck(spec)));
  const reportMarkdown = buildReportMarkdown(results);
  const reportPath = await writeReport(reportMarkdown);

  const failedRequired = results.some(
    (result) => REQUIRED_CHECK_IDS.includes(result.id as (typeof REQUIRED_CHECK_IDS)[number]) && result.status === "failed",
  );

  console.log(
    JSON.stringify(
      {
        passed: !failedRequired,
        requiredChecks: REQUIRED_CHECK_IDS,
        results: results.map((result) => ({ id: result.id, status: result.status })),
        reportPath,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  if (failedRequired) {
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
