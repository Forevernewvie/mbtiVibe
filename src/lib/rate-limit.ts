import { APP_POLICY } from "@/config/app-policy";

type Bucket = {
  count: number;
  resetAt: number;
};

const DEFAULT_RATE_LIMIT: { limit: number; windowMs: number } = {
  limit: 40,
  windowMs: Number(APP_POLICY.time.minuteMs),
};

/**
 * Rate-limit decision response model.
 */
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Abstract rate limiter contract for dependency inversion and testability.
 */
export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

/**
 * In-memory rate limiter suitable for single-instance deployments.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly bucketStore = new Map<string, Bucket>();

  /**
   * Returns allow/deny decision for provided key and quota window.
   */
  check(
    key: string,
    limit = DEFAULT_RATE_LIMIT.limit,
    windowMs = DEFAULT_RATE_LIMIT.windowMs,
  ): RateLimitResult {
    const now = Date.now();
    const bucket = this.bucketStore.get(key);

    if (!bucket || bucket.resetAt < now) {
      this.bucketStore.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
    }

    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }

    bucket.count += 1;
    this.bucketStore.set(key, bucket);

    return {
      allowed: true,
      remaining: limit - bucket.count,
      resetAt: bucket.resetAt,
    };
  }
}

const defaultRateLimiter = new InMemoryRateLimiter();

/**
 * Shared convenience function used by route handlers.
 */
export function checkRateLimit(
  key: string,
  limit = DEFAULT_RATE_LIMIT.limit,
  windowMs = DEFAULT_RATE_LIMIT.windowMs,
): RateLimitResult {
  return defaultRateLimiter.check(key, limit, windowMs);
}
