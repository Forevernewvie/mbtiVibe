import { PaymentStatus, PrismaClient } from "@prisma/client";

import type { Logger } from "@/lib/logger";
import type {
  EventTracker,
  PaymentStatusUpdate,
  PaymentTransitionResult,
  PaymentWebhookTransitionApplier,
  SubscriptionStatusUpdate,
  SubscriptionTransitionResult,
} from "@/server/types/contracts";

type PaymentWebhookTransitionServiceDependencies = {
  prismaClient: Pick<PrismaClient, "$transaction" | "subscription">;
  tracker: EventTracker;
  logger: Logger;
  now?: () => Date;
};

/**
 * Applies normalized payment and subscription webhook transitions to persistence.
 */
export class PaymentWebhookTransitionService implements PaymentWebhookTransitionApplier {
  private readonly prismaClient: Pick<PrismaClient, "$transaction" | "subscription">;
  private readonly tracker: EventTracker;
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(dependencies: PaymentWebhookTransitionServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.tracker = dependencies.tracker;
    this.logger = dependencies.logger;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * Applies payment status transition with idempotent transaction semantics.
   */
  async applyPaymentStatus(input: PaymentStatusUpdate): Promise<PaymentTransitionResult> {
    const transitioned = await this.prismaClient.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { externalId: input.externalId },
        select: {
          id: true,
          status: true,
          provider: true,
          paidAt: true,
        },
      });

      if (!payment) {
        return {
          found: false,
          changed: false,
        } satisfies PaymentTransitionResult;
      }

      const nextPaidAt = this.resolveNextPaidAt(payment.paidAt, input.nextStatus);
      const hasStatusChanged = payment.status !== input.nextStatus;
      const hasPaidAtChanged =
        (payment.paidAt?.toISOString() ?? null) !== (nextPaidAt?.toISOString() ?? null);

      if (hasStatusChanged || hasPaidAtChanged) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: input.nextStatus,
            paidAt: nextPaidAt,
          },
        });
      }

      return {
        found: true,
        changed: hasStatusChanged || hasPaidAtChanged,
        paymentId: payment.id,
        provider: payment.provider,
        previousStatus: payment.status,
        currentStatus: input.nextStatus,
      } satisfies PaymentTransitionResult;
    });

    if (!transitioned.found) {
      this.logger.warn("Webhook payment not found", {
        source: input.source,
        sourceStatus: input.sourceStatus,
        externalId: input.externalId,
        eventId: input.eventId,
        eventType: input.eventType,
      });

      return transitioned;
    }

    await this.tracker.track({
      name: transitioned.changed ? "payment_webhook_updated" : "payment_webhook_ignored",
      properties: {
        paymentId: transitioned.paymentId,
        provider: transitioned.provider,
        previousStatus: transitioned.previousStatus,
        nextStatus: transitioned.currentStatus,
        source: input.source,
        sourceStatus: input.sourceStatus,
        eventId: input.eventId,
        eventType: input.eventType,
      },
    });

    return transitioned;
  }

  /**
   * Applies normalized subscription transitions and records analytics outcome.
   */
  async applySubscriptionStatus(
    input: SubscriptionStatusUpdate,
  ): Promise<SubscriptionTransitionResult> {
    const updateResult = await this.prismaClient.subscription.updateMany({
      where: {
        externalId: input.externalId,
      },
      data: {
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
      },
    });

    await this.tracker.track({
      name: "subscription_webhook_updated",
      properties: {
        provider: input.provider,
        externalId: input.externalId,
        eventId: input.eventId,
        eventType: input.eventType,
        updatedCount: updateResult.count,
        status: input.status,
        source: input.source,
        sourceStatus: input.sourceStatus,
      },
    });

    return {
      updatedCount: updateResult.count,
    };
  }

  /**
   * Resolves paidAt value for next status while preserving refund timestamps.
   */
  private resolveNextPaidAt(currentPaidAt: Date | null, nextStatus: PaymentStatus): Date | null {
    if (nextStatus === PaymentStatus.PAID) {
      return currentPaidAt ?? this.now();
    }

    if (nextStatus === PaymentStatus.REFUNDED) {
      return currentPaidAt;
    }

    return null;
  }
}
