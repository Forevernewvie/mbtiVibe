import { PostHog } from "posthog-node";
import type { Prisma } from "@prisma/client";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const posthog = env.POSTHOG_KEY
  ? new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST ?? "https://app.posthog.com" })
  : null;

type EventInput = {
  name: string;
  sessionToken?: string;
  userId?: string;
  properties?: Record<string, unknown>;
};

/**
 * Persists analytics events and optionally mirrors them to PostHog.
 */
export async function trackEvent(input: EventInput) {
  await prisma.event.create({
    data: {
      name: input.name,
      sessionToken: input.sessionToken,
      userId: input.userId,
      properties: input.properties as Prisma.InputJsonValue | undefined,
    },
  });

  if (posthog) {
    await posthog.capture({
      distinctId: input.userId ?? input.sessionToken ?? "anonymous",
      event: input.name,
      properties: input.properties,
    });
  }

  logger.info("Event tracked", {
    eventName: input.name,
    userId: input.userId,
    sessionToken: input.sessionToken,
  });
}
