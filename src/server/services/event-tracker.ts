import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import type { EventTracker, TrackEventInput } from "@/server/types/contracts";

/**
 * Default analytics adapter using application event persistence + PostHog.
 */
class AnalyticsEventTracker implements EventTracker {
  /**
   * Forwards tracking payload to the analytics pipeline.
   */
  async track(input: TrackEventInput): Promise<void> {
    try {
      await trackEvent(input);
    } catch (error) {
      logger.error("Event tracking failed", {
        eventName: input.name,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}

/**
 * Shared event tracker instance.
 */
export const eventTracker: EventTracker = new AnalyticsEventTracker();
