import { PostHog } from "posthog-node";
import type { Prisma } from "@prisma/client";

import type { Logger } from "@/lib/logger";
import type { AnalyticsRuntimeConfig } from "@/server/services/server-runtime-config";
import type { EventTracker, TrackEventInput } from "@/server/types/contracts";

type AnalyticsPersistence = {
  event: {
    create(args: {
      data: {
        name: string;
        sessionToken?: string;
        userId?: string;
        properties?: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
};

type AnalyticsCaptureInput = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
};

type AnalyticsCaptureClient = {
  capture(input: AnalyticsCaptureInput): Promise<void>;
};

type AnalyticsEventTrackerDependencies = {
  persistence: AnalyticsPersistence;
  logger: Logger;
  captureClient?: AnalyticsCaptureClient | null;
};

/**
 * Persists events to the database and mirrors them to optional analytics transports.
 */
export class AnalyticsEventTracker implements EventTracker {
  private readonly persistence: AnalyticsPersistence;
  private readonly logger: Logger;
  private readonly captureClient: AnalyticsCaptureClient | null;

  constructor(dependencies: AnalyticsEventTrackerDependencies) {
    this.persistence = dependencies.persistence;
    this.logger = dependencies.logger;
    this.captureClient = dependencies.captureClient ?? null;
  }

  /**
   * Stores the event and forwards it to the optional analytics transport without breaking callers.
   */
  async track(input: TrackEventInput): Promise<void> {
    try {
      await this.persistEvent(input);
      await this.captureEvent(input);
      this.logTrackedEvent(input);
    } catch (error) {
      this.logger.error("Event tracking failed", {
        eventName: input.name,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  /**
   * Persists the analytics event in the application database.
   */
  private async persistEvent(input: TrackEventInput): Promise<void> {
    await this.persistence.event.create({
      data: {
        name: input.name,
        sessionToken: input.sessionToken,
        userId: input.userId,
        properties: input.properties as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Mirrors the event to the configured analytics transport when enabled.
   */
  private async captureEvent(input: TrackEventInput): Promise<void> {
    if (!this.captureClient) {
      return;
    }

    await this.captureClient.capture({
      distinctId: input.userId ?? input.sessionToken ?? "anonymous",
      event: input.name,
      properties: input.properties,
    });
  }

  /**
   * Writes a structured success log for the recorded analytics event.
   */
  private logTrackedEvent(input: TrackEventInput): void {
    this.logger.info("Event tracked", {
      eventName: input.name,
      userId: input.userId,
      sessionToken: input.sessionToken,
    });
  }
}

/**
 * Creates optional PostHog capture client from explicit runtime configuration.
 */
export function createPostHogCaptureClient(
  configuration: AnalyticsRuntimeConfig,
): AnalyticsCaptureClient | null {
  if (!configuration.posthogKey) {
    return null;
  }

  return new PostHogCaptureClient(
    new PostHog(configuration.posthogKey, {
      host: configuration.posthogHost,
    }),
  );
}

/**
 * Adapts the PostHog SDK to the minimal analytics capture interface.
 */
class PostHogCaptureClient implements AnalyticsCaptureClient {
  constructor(private readonly client: Pick<PostHog, "capture">) {}

  /**
   * Forwards a normalized analytics capture payload to PostHog.
   */
  async capture(input: AnalyticsCaptureInput): Promise<void> {
    await this.client.capture(input);
  }
}
