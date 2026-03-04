import "dotenv/config";

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_CYCLES = 3;
const REPORT_DIR = "reports";

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

type CycleResult = {
  cycleIndex: number;
  passed: boolean;
  commandResults: CommandResult[];
  generatedAt: string;
};

const COMMANDS: CommandSpec[] = [
  { id: "tests", command: "npm", args: ["test"] },
  { id: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { id: "build", command: "npm", args: ["run", "build"] },
  { id: "vercel_access", command: "npm", args: ["run", "ops:verify:vercel-protection"] },
  { id: "security_rotation", command: "npm", args: ["run", "ops:verify:security-rotation"] },
];

/**
 * Runs a command and captures exit status and textual output for reporting.
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
 * Executes one full operational cycle of quality/security/access validations.
 */
async function runCycle(cycleIndex: number): Promise<CycleResult> {
  const commandResults: CommandResult[] = [];

  for (const spec of COMMANDS) {
    const result = await runCommand(spec);
    commandResults.push(result);
  }

  return {
    cycleIndex,
    passed: commandResults.every((result) => result.success),
    commandResults,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates next-cycle prompt text using failed checks as prioritized context.
 */
function buildNextPrompt(cycle: CycleResult): string {
  const failedIds = cycle.commandResults.filter((result) => !result.success).map((result) => result.id);
  const failedSummary = failedIds.length > 0 ? failedIds.join(", ") : "none";

  return [
    "너는 MBTIVibe의 CTO+PM 실행 에이전트다.",
    "아래 PREV_REPORT를 입력으로 다음 사이클을 즉시 수행하라.",
    "우선순위: (매출 영향도 > 리스크 감소 > 개발 비용)",
    "",
    "[고정 제약]",
    "- SOLID/OOP/테스트 가능 구조",
    "- 하드코딩/매직넘버/중복 금지",
    "- 환경변수 분리, 의존성 분리, 로깅 필수",
    "- 함수 목적 주석 필수",
    "- 에러/보안/성능 병목 사전 분석",
    "- 질문 없이 합리적 가정으로 실행",
    "",
    "[집중 실패 항목]",
    `- ${failedSummary}`,
    "",
    "[출력 형식]",
    "- STATUS",
    "- ASSUMPTIONS",
    "- TOP3_TASKS",
    "- IMPLEMENTATION_PLAN",
    "- TEST_PLAN",
    "- RISK_LOG",
    "- NEXT_PROMPT",
    "",
    "PREV_REPORT:",
    "{{이번 사이클 결과 전체}}",
  ].join("\n");
}

/**
 * Persists cycle report JSON and markdown summary for traceable recursive execution history.
 */
async function writeCycleReport(cycle: CycleResult): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });

  const jsonPath = join(REPORT_DIR, `cycle-${cycle.cycleIndex}.json`);
  const mdPath = join(REPORT_DIR, `cycle-${cycle.cycleIndex}.md`);
  const nextPrompt = buildNextPrompt(cycle);

  await writeFile(jsonPath, JSON.stringify({ ...cycle, nextPrompt }, null, 2), "utf8");

  const markdown = [
    `# Cycle ${cycle.cycleIndex}`,
    "",
    `- Passed: ${cycle.passed}`,
    `- GeneratedAt: ${cycle.generatedAt}`,
    "",
    "## Commands",
    ...cycle.commandResults.map(
      (result) =>
        `- ${result.id}: ${result.success ? "PASS" : "FAIL"} (exit=${result.exitCode})`,
    ),
    "",
    "## NEXT_PROMPT",
    "```text",
    nextPrompt,
    "```",
  ].join("\n");

  await writeFile(mdPath, markdown, "utf8");
}

/**
 * Runs recursive cycles until all checks pass or max cycle count is reached.
 */
async function main(): Promise<void> {
  const maxCycles = Number(process.env.RECURSIVE_MAX_CYCLES ?? String(DEFAULT_MAX_CYCLES));

  if (!Number.isInteger(maxCycles) || maxCycles <= 0) {
    throw new Error("RECURSIVE_MAX_CYCLES must be a positive integer.");
  }

  const cycles: CycleResult[] = [];

  for (let index = 1; index <= maxCycles; index += 1) {
    const cycle = await runCycle(index);
    cycles.push(cycle);
    await writeCycleReport(cycle);

    if (cycle.passed) {
      break;
    }
  }

  const latest = cycles[cycles.length - 1];

  console.log(
    JSON.stringify(
      {
        maxCycles,
        executedCycles: cycles.length,
        finalPassed: latest?.passed ?? false,
        latestCycle: latest,
        reportDirectory: REPORT_DIR,
      },
      null,
      2,
    ),
  );

  if (!latest?.passed) {
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
