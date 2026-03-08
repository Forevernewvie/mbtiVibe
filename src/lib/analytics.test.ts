import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsEventTracker } from "@/lib/analytics";

/**
 * Builds analytics tracker with fully isolated persistence, transport, and logger doubles.
 */
function buildTrackerContext() {
  const persistence = {
    event: {
      create: vi.fn(async () => undefined),
    },
  };

  const captureClient = {
    capture: vi.fn(async () => undefined),
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const tracker = new AnalyticsEventTracker({
    persistence,
    captureClient,
    logger,
  });

  return {
    tracker,
    persistence,
    captureClient,
    logger,
  };
}

describe("AnalyticsEventTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Persists analytics events and mirrors them to the configured capture client.
   */
  it("stores events and captures them with a stable distinct id", async () => {
    const { tracker, persistence, captureClient, logger } = buildTrackerContext();

    await tracker.track({
      name: "checkout_created",
      sessionToken: "session-1",
      properties: {
        priceCode: "REPORT_SINGLE_990",
      },
    });

    expect(persistence.event.create).toHaveBeenCalledWith({
      data: {
        name: "checkout_created",
        sessionToken: "session-1",
        userId: undefined,
        properties: {
          priceCode: "REPORT_SINGLE_990",
        },
      },
    });
    expect(captureClient.capture).toHaveBeenCalledWith({
      distinctId: "session-1",
      event: "checkout_created",
      properties: {
        priceCode: "REPORT_SINGLE_990",
      },
    });
    expect(logger.info).toHaveBeenCalledWith(
      "Event tracked",
      expect.objectContaining({
        eventName: "checkout_created",
      }),
    );
  });

  /**
   * Logs failures instead of surfacing analytics transport errors to application callers.
   */
  it("swallows persistence failures and emits structured error logs", async () => {
    const { tracker, persistence, logger, captureClient } = buildTrackerContext();

    persistence.event.create.mockRejectedValue(new Error("db unavailable"));

    await tracker.track({
      name: "assessment_completed",
      userId: "user-1",
    });

    expect(captureClient.capture).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Event tracking failed",
      expect.objectContaining({
        eventName: "assessment_completed",
        message: "db unavailable",
      }),
    );
  });
});
