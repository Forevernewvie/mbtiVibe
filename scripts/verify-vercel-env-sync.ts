import "dotenv/config";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RUNTIME_ENVIRONMENTS = ["production", "development", "preview"] as const;
const REQUIRED_KEYS = [
  "DATABASE_URL",
  "ADMIN_API_TOKEN",
  "VERCEL_TOKEN_ROTATED",
  "DB_PASSWORD_ROTATED",
  "SECURITY_ROTATION_COMPLETED_AT",
] as const;
const CONSISTENT_KEYS = [
  "DATABASE_URL",
  "ADMIN_API_TOKEN",
  "VERCEL_TOKEN_ROTATED",
  "DB_PASSWORD_ROTATED",
] as const;
const ROTATION_MAX_AGE_DAYS = 30;

type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];
type EnvMap = Record<string, string>;
type CheckItem = {
  id: string;
  passed: boolean;
  detail: string;
};

/**
 * Parses a dotenv-compatible file into key-value pairs.
 */
function parseEnvFile(content: string): EnvMap {
  const map: EnvMap = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    map[key] = value;
  }

  return map;
}

/**
 * Pulls one Vercel environment file and returns parsed variables.
 */
async function pullVercelEnvironment(
  token: string,
  environment: RuntimeEnvironment,
  tempDirectory: string,
): Promise<EnvMap> {
  const outputPath = join(tempDirectory, `.env.${environment}`);

  await execFileAsync(
    "npx",
    [
      "vercel",
      "env",
      "pull",
      outputPath,
      "--environment",
      environment,
      "--yes",
      "--token",
      token,
    ],
    {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024 * 8,
    },
  );

  const content = await readFile(outputPath, "utf8");

  return parseEnvFile(content);
}

/**
 * Evaluates key existence for each required environment variable.
 */
function evaluateRequiredKeys(allEnvs: Record<RuntimeEnvironment, EnvMap>): CheckItem[] {
  const items: CheckItem[] = [];

  for (const environment of RUNTIME_ENVIRONMENTS) {
    const envMap = allEnvs[environment];

    for (const key of REQUIRED_KEYS) {
      const present = Boolean(envMap[key]);

      items.push({
        id: `required_${environment}_${key.toLowerCase()}`,
        passed: present,
        detail: present ? `${environment}: ${key} is set` : `${environment}: ${key} is missing`,
      });
    }
  }

  return items;
}

/**
 * Validates cross-environment consistency for critical keys.
 */
function evaluateConsistency(allEnvs: Record<RuntimeEnvironment, EnvMap>): CheckItem[] {
  const items: CheckItem[] = [];

  for (const key of CONSISTENT_KEYS) {
    const values = RUNTIME_ENVIRONMENTS.map((environment) => allEnvs[environment][key] ?? "");
    const baseValue = values[0];
    const consistent = values.every((value) => value === baseValue);

    items.push({
      id: `consistent_${key.toLowerCase()}`,
      passed: consistent,
      detail: consistent
        ? `${key} is consistent across production/development/preview`
        : `${key} is not consistent across production/development/preview`,
    });
  }

  return items;
}

/**
 * Verifies that all rotation timestamps are valid and recent.
 */
function evaluateRotationTimestamps(allEnvs: Record<RuntimeEnvironment, EnvMap>): CheckItem[] {
  const items: CheckItem[] = [];
  const maxAgeMilliseconds = ROTATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  for (const environment of RUNTIME_ENVIRONMENTS) {
    const rawTimestamp = allEnvs[environment].SECURITY_ROTATION_COMPLETED_AT;

    if (!rawTimestamp) {
      items.push({
        id: `rotation_timestamp_${environment}_missing`,
        passed: false,
        detail: `${environment}: SECURITY_ROTATION_COMPLETED_AT is missing`,
      });
      continue;
    }

    const parsed = new Date(rawTimestamp);

    if (Number.isNaN(parsed.getTime())) {
      items.push({
        id: `rotation_timestamp_${environment}_invalid`,
        passed: false,
        detail: `${environment}: SECURITY_ROTATION_COMPLETED_AT is invalid`,
      });
      continue;
    }

    const ageMilliseconds = Date.now() - parsed.getTime();
    const freshEnough = ageMilliseconds <= maxAgeMilliseconds;

    items.push({
      id: `rotation_timestamp_${environment}_fresh`,
      passed: freshEnough,
      detail: freshEnough
        ? `${environment}: SECURITY_ROTATION_COMPLETED_AT is within ${ROTATION_MAX_AGE_DAYS} days`
        : `${environment}: SECURITY_ROTATION_COMPLETED_AT is older than ${ROTATION_MAX_AGE_DAYS} days`,
    });
  }

  return items;
}

/**
 * Ensures managed Postgres security options are preserved for every environment.
 */
function evaluateDatabaseSecurity(allEnvs: Record<RuntimeEnvironment, EnvMap>): CheckItem[] {
  return RUNTIME_ENVIRONMENTS.map((environment) => {
    const dbUrl = allEnvs[environment].DATABASE_URL ?? "";
    const hasSslMode = dbUrl.includes("sslmode=require");
    const hasChannelBinding = dbUrl.includes("channel_binding=require");
    const passed = hasSslMode && hasChannelBinding;

    return {
      id: `database_security_${environment}`,
      passed,
      detail: passed
        ? `${environment}: DATABASE_URL contains sslmode=require and channel_binding=require`
        : `${environment}: DATABASE_URL must include sslmode=require and channel_binding=require`,
    };
  });
}

/**
 * Runs full Vercel environment consistency checks and exits non-zero on failure.
 */
async function main(): Promise<void> {
  const token = process.env.VERCEL_TOKEN;

  if (!token) {
    throw new Error("VERCEL_TOKEN is required.");
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "mbti-vercel-env-sync-"));

  try {
    const pulledEntries = await Promise.all(
      RUNTIME_ENVIRONMENTS.map(async (environment) => [
        environment,
        await pullVercelEnvironment(token, environment, tempDirectory),
      ]),
    );

    const allEnvs = Object.fromEntries(pulledEntries) as Record<RuntimeEnvironment, EnvMap>;

    const items: CheckItem[] = [
      ...evaluateRequiredKeys(allEnvs),
      ...evaluateConsistency(allEnvs),
      ...evaluateRotationTimestamps(allEnvs),
      ...evaluateDatabaseSecurity(allEnvs),
    ];

    const passed = items.every((item) => item.passed);
    const failedItems = items.filter((item) => !item.passed);

    console.log(
      JSON.stringify(
        {
          passed,
          environments: RUNTIME_ENVIRONMENTS,
          requiredKeys: REQUIRED_KEYS,
          consistentKeys: CONSISTENT_KEYS,
          maxRotationAgeDays: ROTATION_MAX_AGE_DAYS,
          items,
          failedItems,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    if (!passed) {
      process.exit(1);
    }
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
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
