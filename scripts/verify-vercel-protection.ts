import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const OPERATIONAL_ROUTES = ["/", "/assessment", "/terms", "/privacy", "/robots.txt"] as const;
const SUCCESS_HTTP_STATUSES = [200, 301, 302, 307, 308] as const;

type RouteProbeResult = {
  path: string;
  statusCode: number;
  headers: Record<string, string>;
};

type BypassProbeResult = {
  path: string;
  statusCode: number;
};

/**
 * Executes command and returns combined stdout/stderr payload for parsing.
 */
async function runCommand(file: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1024 * 1024 * 8,
  });

  return `${stdout}\n${stderr}`.trim();
}

/**
 * Parses `STATUS:<httpCode>` marker emitted by curl write-out.
 */
function parseStatusMarker(output: string): number {
  const matched = output.match(/STATUS:(\d{3})/);

  if (!matched) {
    throw new Error(`STATUS marker not found in output: ${output}`);
  }

  return Number(matched[1]);
}

/**
 * Normalizes response headers into lower-case string map.
 */
function toHeaderMap(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of headers.entries()) {
    result[key.toLowerCase()] = value;
  }

  return result;
}

/**
 * Returns true when route status is considered publicly reachable.
 */
function isPublicSuccessStatus(statusCode: number): boolean {
  return SUCCESS_HTTP_STATUSES.includes(statusCode as (typeof SUCCESS_HTTP_STATUSES)[number]);
}

/**
 * Probes direct route access without bypass token.
 */
async function probeDirectAccess(baseUrl: string, path: string): Promise<RouteProbeResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "manual",
  });

  return {
    path,
    statusCode: response.status,
    headers: toHeaderMap(response.headers),
  };
}

/**
 * Probes route using `vercel curl` bypass flow for protected deployments.
 */
async function probeBypassAccess(
  deploymentUrl: string,
  path: string,
  token: string,
): Promise<BypassProbeResult> {
  const output = await runCommand("npx", [
    "vercel",
    "curl",
    path,
    "--deployment",
    deploymentUrl,
    "--token",
    token,
    "--",
    "--silent",
    "--show-error",
    "--output",
    "/dev/null",
    "--write-out",
    "STATUS:%{http_code}",
  ]);

  return {
    path,
    statusCode: parseStatusMarker(output),
  };
}

/**
 * Detects if Vercel deployment protection is enabled from direct probe results.
 */
function inferProtectionEnabled(results: RouteProbeResult[]): boolean {
  return results.some((result) => {
    const vercelError = result.headers["x-vercel-error"];

    return (
      result.statusCode === 401 ||
      result.statusCode === 403 ||
      vercelError === "NOT_FOUND" ||
      vercelError === "DEPLOYMENT_NOT_FOUND"
    );
  });
}

/**
 * Validates optional policy expectation from environment flag.
 */
function validateProtectionExpectation(protectionEnabled: boolean): void {
  const expectedProtected = process.env.VERCEL_EXPECT_PROTECTED;

  if (expectedProtected === undefined) {
    return;
  }

  const normalized = expectedProtected.toLowerCase();

  if (normalized !== "true" && normalized !== "false") {
    throw new Error("VERCEL_EXPECT_PROTECTED must be true or false when provided.");
  }

  if (protectionEnabled !== (normalized === "true")) {
    throw new Error(
      `Deployment protection mismatch. expected=${normalized}, actual=${String(protectionEnabled)}`,
    );
  }
}

/**
 * Prints consolidated route probe report for CI logs and manual operations.
 */
function printReport(
  deploymentUrl: string,
  directResults: RouteProbeResult[],
  bypassResults: BypassProbeResult[],
  protectionEnabled: boolean,
): void {
  const payload = {
    deploymentUrl,
    protectionEnabled,
    directResults,
    bypassResults,
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(payload, null, 2));
}

/**
 * Executes protection checks and exits non-zero on operational access failures.
 */
async function main(): Promise<void> {
  const token = process.env.VERCEL_TOKEN;
  const deploymentUrl = process.env.VERCEL_DEPLOYMENT_URL ?? process.env.APP_URL;

  if (!token) {
    throw new Error("VERCEL_TOKEN is required.");
  }

  if (!deploymentUrl) {
    throw new Error("VERCEL_DEPLOYMENT_URL or APP_URL is required.");
  }

  const directResults = await Promise.all(
    OPERATIONAL_ROUTES.map((path) => probeDirectAccess(deploymentUrl, path)),
  );
  const protectionEnabled = inferProtectionEnabled(directResults);
  validateProtectionExpectation(protectionEnabled);

  const bypassResults = await Promise.all(
    OPERATIONAL_ROUTES.map((path) => probeBypassAccess(deploymentUrl, path, token)),
  );

  printReport(deploymentUrl, directResults, bypassResults, protectionEnabled);

  const directReachable = directResults.every((result) => isPublicSuccessStatus(result.statusCode));
  const bypassReachable = bypassResults.every((result) => isPublicSuccessStatus(result.statusCode));

  if (!(directReachable || (protectionEnabled && bypassReachable))) {
    throw new Error(
      "Operational access verification failed: neither direct nor protected-bypass route checks passed.",
    );
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
