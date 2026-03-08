import { PaymentStatus, PrismaClient } from "@prisma/client";
import type { Logger } from "@/lib/logger";
import type {
  EventTracker,
  PaymentStatusUpdate,
  PaymentWebhookGateway,
  SubscriptionStatusUpdate,
} from "@/server/types/contracts";

type PaymentWebhookServiceDependencies = {
  prismaClient: Pick<PrismaClient, "$transaction" | "subscription">;
  tracker: EventTracker;
  logger: Logger;
  webhookGateway: PaymentWebhookGateway;
};

type PaymentTransitionResult = {
  found: boolean;
  changed: boolean;
  paymentId?: string;
  provider?: string;
  previousStatus?: PaymentStatus;
  currentStatus?: PaymentStatus;
};

/**
 * Handles payment provider webhook normalization and persistence.
 */
export class PaymentWebhookService {
  private readonly prismaClient: Pick<PrismaClient, "$transaction" | "subscription">;
  private readonly tracker: EventTracker;
  private readonly logger: Logger;
  private readonly webhookGateway: PaymentWebhookGateway;

  constructor(dependencies: PaymentWebhookServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.tracker = dependencies.tracker;
    this.logger = dependencies.logger;
    this.webhookGateway = dependencies.webhookGateway;
  }

  /**
   * Processes webhook request for configured payment provider.
   */
  async handle(request: Request) {
    const parsed = await this.webhookGateway.parse(request);

    for (const paymentUpdate of parsed.paymentUpdates) {
      await this.applyPaymentStatus(paymentUpdate);
    }

    for (const subscriptionUpdate of parsed.subscriptionUpdates) {
      await this.applySubscriptionStatus(subscriptionUpdate);
    }

    this.logger.info("Payment webhook processed", {
      ...parsed.logContext,
      paymentUpdateCount: parsed.paymentUpdates.length,
      subscriptionUpdateCount: parsed.subscriptionUpdates.length,
    });

    return parsed.responseBody;
  }

  /**
   * Applies payment status transition with idempotent transaction semantics.
   */
  private async applyPaymentStatus(input: PaymentStatusUpdate): Promise<PaymentTransitionResult> {
    const transitioned = await this.prismaClient.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { externalId: input.externalId },
        select: {
          id: true,
          status: true,
          provider: true,
          paidAt: true,
          assessmentId: true,
          userId: true,
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
   * Applies subscription status updates emitted by provider-specific webhook gateways.
   */
  private async applySubscriptionStatus(input: SubscriptionStatusUpdate) {
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
  }

  /**
   * Resolves paidAt value for next status while preserving refund timestamps.
   */
  private resolveNextPaidAt(currentPaidAt: Date | null, nextStatus: PaymentStatus): Date | null {
    if (nextStatus === PaymentStatus.PAID) {
      return currentPaidAt ?? new Date();
    }

    if (nextStatus === PaymentStatus.REFUNDED) {
      return currentPaidAt;
    }

    return null;
  }
}
