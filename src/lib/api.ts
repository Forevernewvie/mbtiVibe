import { ZodType } from "zod";

import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Safely parses a JSON request body and returns fallback payload on parse errors.
 */
export async function parseJsonBody(
  request: Request,
  fallbackPayload: unknown = {},
): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return fallbackPayload;
  }
}

/**
 * Validates unknown payload by Zod schema and raises ValidationError on failure.
 */
export function validateSchema<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new ValidationError("잘못된 요청 형식입니다.", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  return parsed.data;
}

/**
 * Enforces in-memory rate-limiting for request scopes.
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const result = checkRateLimit(key, limit, windowMs);

  if (!result.allowed) {
    throw new RateLimitError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", {
      key,
      resetAt: result.resetAt,
    });
  }

  return result;
}
