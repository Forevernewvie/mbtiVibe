import "dotenv/config";

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const OPERATIONAL_ROUTES = ["/", "/assessment", "/terms", "/privacy", "/robots.txt"] as const;
const SUCCESS_HTTP_STATUSES = [200, 301, 302, 307, 308] as const;
const BLOCKED_HTTP_STATUSES = [401, 403, 404] as const;

type AccessPolicyMode = "public" | "protected";
type ProbeMethod = "direct" | "vercel_curl" | "vercel_curl_scope";
type ProbeTarget = "alias" | "deployment";

type ProbeResult = {
  target: ProbeTarget;
  method: ProbeMethod;
  path: string;
  statusCode: number;
  url: string;
  headers?: Record<string, string>;
};

type ProjectReference = {
  projectId: string;
  orgId: string;
  projectName: string;
};

type ProjectDiagnostics = {
  latestDeploymentUrl: string;
  latestDeploymentId: string;
  ownerSlug: string | null;
  readyState: string | null;
  ssoDeploymentType: string | null;
};

/**
 * Executes a shell command and returns combined stdout/stderr payload.
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
 * Parses `STATUS:<httpCode>` marker emitted by curl `--write-out`.
 */
function parseStatusMarker(output: string): number {
  const matched = output.match(/STATUS:(\d{3})/);

  if (!matched) {
    throw new Error(`STATUS marker not found in output: ${output}`);
  }

  return Number(matched[1]);
}

/**
 * Normalizes response headers into lower-case key/value map.
 */
function toHeaderMap(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of headers.entries()) {
    result[key.toLowerCase()] = value;
  }

  return result;
}

/**
 * Returns whether status code is considered a successful public response.
 */
function isSuccessStatus(statusCode: number): boolean {
  return SUCCESS_HTTP_STATUSES.includes(statusCode as (typeof SUCCESS_HTTP_STATUSES)[number]);
}

/**
 * Returns whether status code is considered blocked by protection policy.
 */
function isBlockedStatus(statusCode: number): boolean {
  return BLOCKED_HTTP_STATUSES.includes(statusCode as (typeof BLOCKED_HTTP_STATUSES)[number]);
}

/**
 * Reads local Vercel project linkage metadata from `.vercel/project.json`.
 */
async function readProjectReference(): Promise<ProjectReference> {
  const content = await readFile(".vercel/project.json", "utf8");
  const parsed = JSON.parse(content) as ProjectReference;

  if (!parsed.projectId || !parsed.orgId) {
    throw new Error("Invalid .vercel/project.json content.");
  }

  return parsed;
}

/**
 * Fetches project metadata from Vercel REST API for diagnostics and routing context.
 */
async function fetchProjectDiagnostics(
  token: string,
  projectId: string,
): Promise<ProjectDiagnostics> {
  const response = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Vercel project diagnostics: ${response.status}`);
  }

  const payload = (await response.json()) as {
    ssoProtection?: { deploymentType?: string };
    latestDeployments?: Array<{
      id?: string;
      url?: string;
      readyState?: string;
      oidcTokenClaims?: { owner?: string };
    }>;
  };

  const latest = payload.latestDeployments?.[0];

  if (!latest?.id || !latest.url) {
    throw new Error("Latest deployment is missing in Vercel project metadata.");
  }

  return {
    latestDeploymentUrl: `https://${latest.url}`,
    latestDeploymentId: latest.id,
    ownerSlug: latest.oidcTokenClaims?.owner ?? null,
    readyState: latest.readyState ?? null,
    ssoDeploymentType: payload.ssoProtection?.deploymentType ?? null,
  };
}

/**
 * Probes direct HTTP access for a route and records status/header metadata.
 */
async function probeDirectAccess(baseUrl: string, path: string, target: ProbeTarget): Promise<ProbeResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "manual",
  });

  return {
    target,
    method: "direct",
    path,
    url: baseUrl,
    statusCode: response.status,
    headers: toHeaderMap(response.headers),
  };
}

/**
 * Probes protected deployment routes via `vercel curl` bypass mechanism.
 */
async function probeVercelCurlAccess(
  path: string,
  deploymentSelector: string,
  token: string,
  target: ProbeTarget,
  scope?: string,
): Promise<ProbeResult> {
  const args = ["vercel", "curl", path, "--deployment", deploymentSelector, "--token", token];

  if (scope) {
    args.push("--scope", scope);
  }

  args.push(
    "--",
    "--silent",
    "--show-error",
    "--output",
    "/dev/null",
    "--write-out",
    "STATUS:%{http_code}",
  );

  const output = await runCommand("npx", args);

  return {
    target,
    method: scope ? "vercel_curl_scope" : "vercel_curl",
    path,
    url: deploymentSelector,
    statusCode: parseStatusMarker(output),
  };
}

/**
 * Evaluates route probes against selected access policy and returns pass/fail.
 */
function evaluatePolicy(
  policy: AccessPolicyMode,
  aliasDirect: ProbeResult[],
  deploymentDirect: ProbeResult[],
  diagnostics: ProjectDiagnostics,
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const aliasDirectSuccess = aliasDirect.every((result) => isSuccessStatus(result.statusCode));
  const aliasDirectBlocked = aliasDirect.every((result) => isBlockedStatus(result.statusCode));
  const deploymentDirectBlocked = deploymentDirect.every((result) =>
    isBlockedStatus(result.statusCode),
  );

  if (policy === "public") {
    if (!aliasDirectSuccess) {
      reasons.push("alias direct routes are not publicly reachable");
    }

    if (diagnostics.readyState !== "READY") {
      reasons.push(`latest deployment readyState is ${diagnostics.readyState ?? "unknown"}`);
    }

    return {
      pass: reasons.length === 0,
      reasons,
    };
  }

  if (!aliasDirectBlocked) {
    reasons.push("alias direct routes are not blocked under protected policy");
  }

  if (!deploymentDirectBlocked) {
    reasons.push("deployment direct routes are not blocked under protected policy");
  }

  if (!diagnostics.ssoDeploymentType) {
    reasons.push("ssoProtection.deploymentType is missing for protected policy");
  }

  if (diagnostics.readyState !== "READY") {
    reasons.push(`latest deployment readyState is ${diagnostics.readyState ?? "unknown"}`);
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

/**
 * Builds failure-point labels to explain which probe segment is failing.
 */
function buildFailurePoints(
  aliasDirect: ProbeResult[],
  deploymentDirect: ProbeResult[],
  deploymentBypass: ProbeResult[],
  deploymentBypassWithScope: ProbeResult[],
): string[] {
  const points: string[] = [];
  const aliasDirectAllSuccess = aliasDirect.every((result) => isSuccessStatus(result.statusCode));
  const aliasDirectAllBlocked = aliasDirect.every((result) => isBlockedStatus(result.statusCode));
  const deploymentDirectAllBlocked = deploymentDirect.every((result) =>
    isBlockedStatus(result.statusCode),
  );
  const bypassAnySuccess = deploymentBypass.some((result) => isSuccessStatus(result.statusCode));
  const bypassScopeAnySuccess = deploymentBypassWithScope.some((result) =>
    isSuccessStatus(result.statusCode),
  );

  if (aliasDirectAllBlocked) {
    points.push("alias_direct_blocked");
  } else if (!aliasDirectAllSuccess) {
    points.push("alias_direct_inconsistent");
  }

  if (deploymentDirectAllBlocked) {
    points.push("deployment_direct_blocked");
  }

  if (!bypassAnySuccess) {
    points.push("deployment_bypass_not_effective");
  }

  if (!bypassScopeAnySuccess) {
    points.push("deployment_bypass_with_scope_not_effective");
  }

  if (bypassAnySuccess || bypassScopeAnySuccess) {
    points.push("bypass_path_available");
  }

  return points;
}

/**
 * Resolves user-selected access policy mode from environment variable.
 */
function resolvePolicyMode(): AccessPolicyMode {
  const raw = process.env.VERCEL_ACCESS_POLICY?.toLowerCase() ?? "protected";

  if (raw !== "public" && raw !== "protected") {
    throw new Error("VERCEL_ACCESS_POLICY must be either 'public' or 'protected'.");
  }

  return raw;
}

/**
 * Runs policy verification and prints structured diagnostics report.
 */
async function main(): Promise<void> {
  const token = process.env.VERCEL_TOKEN;
  const aliasUrl = process.env.VERCEL_ALIAS_URL ?? process.env.APP_URL;

  if (!token) {
    throw new Error("VERCEL_TOKEN is required.");
  }

  if (!aliasUrl) {
    throw new Error("VERCEL_ALIAS_URL or APP_URL is required.");
  }

  const projectRef = await readProjectReference();
  const diagnostics = await fetchProjectDiagnostics(token, projectRef.projectId);
  const policyMode = resolvePolicyMode();

  const aliasDirect = await Promise.all(
    OPERATIONAL_ROUTES.map((path) => probeDirectAccess(aliasUrl, path, "alias")),
  );
  const deploymentDirect = await Promise.all(
    OPERATIONAL_ROUTES.map((path) =>
      probeDirectAccess(diagnostics.latestDeploymentUrl, path, "deployment"),
    ),
  );

  const deploymentBypass = await Promise.all(
    OPERATIONAL_ROUTES.map((path) =>
      probeVercelCurlAccess(path, diagnostics.latestDeploymentId, token, "deployment"),
    ),
  );
  const deploymentBypassWithScope = await Promise.all(
    OPERATIONAL_ROUTES.map((path) =>
      probeVercelCurlAccess(
        path,
        diagnostics.latestDeploymentId,
        token,
        "deployment",
        diagnostics.ownerSlug ?? undefined,
      ),
    ),
  );

  const evaluation = evaluatePolicy(policyMode, aliasDirect, deploymentDirect, diagnostics);
  const failurePoints = buildFailurePoints(
    aliasDirect,
    deploymentDirect,
    deploymentBypass,
    deploymentBypassWithScope,
  );

  const report = {
    policyMode,
    pass: evaluation.pass,
    reasons: evaluation.reasons,
    failurePoints,
    project: {
      projectId: projectRef.projectId,
      orgId: projectRef.orgId,
      projectName: projectRef.projectName,
      ownerSlug: diagnostics.ownerSlug,
      latestDeploymentId: diagnostics.latestDeploymentId,
      latestDeploymentUrl: diagnostics.latestDeploymentUrl,
      readyState: diagnostics.readyState,
      ssoDeploymentType: diagnostics.ssoDeploymentType,
      aliasUrl,
    },
    probes: {
      aliasDirect,
      deploymentDirect,
      deploymentBypass,
      deploymentBypassWithScope,
    },
    recommendations: [
      policyMode === "public"
        ? "If direct alias routes are blocked, disable protection or expose a custom production domain."
        : "Protected mode expects blocked direct routes. Use custom domain when switching to public policy.",
      "If bypass probes stay 404, verify SSO protection mode and whether bypass is allowed for your team plan.",
    ],
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!evaluation.pass) {
    throw new Error("Vercel access policy verification failed.");
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
