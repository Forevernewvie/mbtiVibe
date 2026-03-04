import "dotenv/config";

const ROTATION_MAX_AGE_DAYS = 30;
const REQUIRED_ROTATION_FLAGS = ["VERCEL_TOKEN_ROTATED", "DB_PASSWORD_ROTATED"] as const;

type ChecklistItem = {
  id: string;
  passed: boolean;
  detail: string;
};

/**
 * Returns true when environment flag is explicitly set to "true".
 */
function isTrueFlag(value: string | undefined): boolean {
  return (value ?? "").toLowerCase() === "true";
}

/**
 * Validates ISO-8601 timestamp and checks freshness against policy window.
 */
function validateRotationTimestamp(value: string | undefined): ChecklistItem {
  if (!value) {
    return {
      id: "rotation_timestamp_present",
      passed: false,
      detail: "SECURITY_ROTATION_COMPLETED_AT is missing",
    };
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return {
      id: "rotation_timestamp_valid",
      passed: false,
      detail: "SECURITY_ROTATION_COMPLETED_AT is not a valid ISO timestamp",
    };
  }

  const ageMs = Date.now() - parsed.getTime();
  const maxAgeMs = ROTATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  if (ageMs > maxAgeMs) {
    return {
      id: "rotation_timestamp_fresh",
      passed: false,
      detail: `Rotation timestamp is older than ${ROTATION_MAX_AGE_DAYS} days`,
    };
  }

  return {
    id: "rotation_timestamp_fresh",
    passed: true,
    detail: "Rotation timestamp is valid and recent",
  };
}

/**
 * Ensures required secret material exists for runtime and post-rotation validation.
 */
function validateCriticalSecrets(): ChecklistItem[] {
  const checks: ChecklistItem[] = [];

  checks.push({
    id: "database_url_present",
    passed: Boolean(process.env.DATABASE_URL),
    detail: process.env.DATABASE_URL ? "DATABASE_URL is set" : "DATABASE_URL is missing",
  });

  checks.push({
    id: "admin_api_token_present",
    passed: Boolean(process.env.ADMIN_API_TOKEN),
    detail: process.env.ADMIN_API_TOKEN
      ? "ADMIN_API_TOKEN is set"
      : "ADMIN_API_TOKEN is missing",
  });

  checks.push({
    id: "vercel_token_present",
    passed: Boolean(process.env.VERCEL_TOKEN),
    detail: process.env.VERCEL_TOKEN ? "VERCEL_TOKEN is set" : "VERCEL_TOKEN is missing",
  });

  return checks;
}

/**
 * Validates URL security options for managed PostgreSQL connection strings.
 */
function validateDatabaseUrlSecurity(): ChecklistItem {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const hasSslMode = dbUrl.includes("sslmode=require");

  return {
    id: "database_url_sslmode",
    passed: hasSslMode,
    detail: hasSslMode
      ? "DATABASE_URL contains sslmode=require"
      : "DATABASE_URL must include sslmode=require",
  };
}

/**
 * Evaluates explicit rotation flags required by the security runbook.
 */
function validateRotationFlags(): ChecklistItem[] {
  return REQUIRED_ROTATION_FLAGS.map((flag) => ({
    id: flag.toLowerCase(),
    passed: isTrueFlag(process.env[flag]),
    detail: isTrueFlag(process.env[flag]) ? `${flag}=true` : `${flag} must be true`,
  }));
}

/**
 * Executes security-rotation checklist and exits non-zero when any requirement fails.
 */
function main(): void {
  const items: ChecklistItem[] = [
    ...validateCriticalSecrets(),
    ...validateRotationFlags(),
    validateRotationTimestamp(process.env.SECURITY_ROTATION_COMPLETED_AT),
    validateDatabaseUrlSecurity(),
  ];

  const passed = items.every((item) => item.passed);
  const failedItems = items.filter((item) => !item.passed);

  console.log(
    JSON.stringify(
      {
        passed,
        requiredFlags: REQUIRED_ROTATION_FLAGS,
        maxAgeDays: ROTATION_MAX_AGE_DAYS,
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
}

main();
