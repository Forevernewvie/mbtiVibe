import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter } from "@/lib/rate-limit";

/**
 * Validates in-memory rate limiter window and quota behavior.
 */
describe("InMemoryRateLimiter", () => {
  /**
   * Ensures limiter blocks requests after configured quota.
   */
  it("blocks after limit is reached", () => {
    const limiter = new InMemoryRateLimiter();

    const first = limiter.check("scope-key", 2, 60_000);
    const second = limiter.check("scope-key", 2, 60_000);
    const third = limiter.check("scope-key", 2, 60_000);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  /**
   * Ensures limiter resets after window expiration.
   */
  it("resets after window timeout", async () => {
    const limiter = new InMemoryRateLimiter();
    const windowMs = 10;

    limiter.check("scope-key", 1, windowMs);
    const blocked = limiter.check("scope-key", 1, windowMs);
    await new Promise((resolve) => setTimeout(resolve, windowMs + 5));
    const allowedAgain = limiter.check("scope-key", 1, windowMs);

    expect(blocked.allowed).toBe(false);
    expect(allowedAgain.allowed).toBe(true);
  });
});
