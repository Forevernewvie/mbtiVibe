import Stripe from "stripe";

import { PaymentStatus, PrismaClient, SubscriptionStatus } from "@prisma/client";

import { BadRequestError } from "@/lib/errors";
import { env } from "@/lib/env";
import type { Logger } from "@/lib/logger";
import type { EventTracker } from "@/server/types/contracts";

type PaymentWebhookServiceDependencies = {
  prismaClient: PrismaClient;
  tracker: EventTracker;
  logger: Logger;
};

type ManualWebhookPayload = {
  externalId?: string;
  status?: "PAID" | "FAILED" | "REFUNDED";
};

type ApplyPaymentStatusInput = {
  externalId: string;
  nextStatus: PaymentStatus;
  source: "manual_webhook" | "stripe_webhook";
  sourceStatus: string;
  eventId?: string;
  eventType?: string;
};

type PaymentTransitionResult = {
  found: boolean;
  changed: boolean;
  paymentId?: string;
  provider?: string;
  previousStatus?: PaymentStatus;
  currentStatus?: PaymentStatus;
};

const MANUAL_STATUS_MAP: Record<NonNullable<ManualWebhookPayload["status"]>, PaymentStatus> = {
  PAID: PaymentStatus.PAID,
  FAILED: PaymentStatus.FAILED,
  REFUNDED: PaymentStatus.REFUNDED,
};

const STRIPE_PAYMENT_EVENT_STATUS: Partial<Record<Stripe.Event.Type, PaymentStatus>> = {
  "checkout.session.completed": PaymentStatus.PAID,
  "checkout.session.async_payment_failed": PaymentStatus.FAILED,
  "checkout.session.expired": PaymentStatus.FAILED,
};

/**
 * Handles payment provider webhook normalization and persistence.
 */
export class PaymentWebhookService {
  private readonly prismaClient: PrismaClient;
  private readonly tracker: EventTracker;
  private readonly logger: Logger;

  constructor(dependencies: PaymentWebhookServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.tracker = dependencies.tracker;
    this.logger = dependencies.logger;
  }

  /**
   * Processes webhook request for configured payment provider.
   */
  async handle(request: Request) {
    if (env.PAYMENT_PROVIDER === "stripe" && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
      return this.handleStripeWebhook(request);
    }

    const body = await this.parseManualWebhookPayload(request);
    const result = await this.applyPaymentStatus({
      externalId: body.externalId,
      nextStatus: MANUAL_STATUS_MAP[body.status],
      source: "manual_webhook",
      sourceStatus: body.status,
    });

    this.logger.info("Manual webhook processed", {
      externalId: body.externalId,
      status: body.status,
      changed: result.changed,
      found: result.found,
      paymentId: result.paymentId,
    });

    return { ok: true };
  }

  /**
   * Validates Stripe signature and applies billing status updates.
   */
  private async handleStripeWebhook(request: Request) {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });

    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      throw new BadRequestError("Missing stripe-signature header");
    }

    const payload = await request.text();

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET!);
    } catch (error) {
      throw new BadRequestError("Invalid webhook signature", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    const stripePaymentStatus = STRIPE_PAYMENT_EVENT_STATUS[event.type];

    if (stripePaymentStatus) {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await this.applyPaymentStatus({
        externalId: session.id,
        nextStatus: stripePaymentStatus,
        source: "stripe_webhook",
        sourceStatus: event.type,
        eventId: event.id,
        eventType: event.type,
      });

      this.logger.info("Stripe payment event processed", {
        eventId: event.id,
        eventType: event.type,
        externalId: session.id,
        found: result.found,
        changed: result.changed,
      });
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const itemPeriodEnd = subscription.items.data[0]?.current_period_end;

      const updateResult = await this.prismaClient.subscription.updateMany({
        where: {
          externalId: subscription.id,
        },
        data: {
          status: this.mapStripeSubscriptionStatus(subscription.status),
          currentPeriodEnd: itemPeriodEnd ? new Date(itemPeriodEnd * 1000) : null,
        },
      });

      await this.tracker.track({
        name: "subscription_webhook_updated",
        properties: {
          provider: "stripe",
          externalId: subscription.id,
          eventId: event.id,
          eventType: event.type,
          updatedCount: updateResult.count,
          status: subscription.status,
        },
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      const updateResult = await this.prismaClient.subscription.updateMany({
        where: {
          externalId: subscription.id,
        },
        data: {
          status: SubscriptionStatus.CANCELED,
        },
      });

      await this.tracker.track({
        name: "subscription_webhook_updated",
        properties: {
          provider: "stripe",
          externalId: subscription.id,
          eventId: event.id,
          eventType: event.type,
          updatedCount: updateResult.count,
          status: "canceled",
        },
      });
    }

    this.logger.info("Stripe webhook processed", {
      eventType: event.type,
      eventId: event.id,
    });

    return { received: true };
  }

  /**
   * Parses manual webhook payload and validates required fields.
   */
  private async parseManualWebhookPayload(request: Request): Promise<{
    externalId: string;
    status: NonNullable<ManualWebhookPayload["status"]>;
  }> {
    let body: ManualWebhookPayload;

    try {
      body = (await request.json()) as ManualWebhookPayload;
    } catch {
      throw new BadRequestError("유효한 JSON 본문이 필요합니다.");
    }

    if (!body.externalId || !body.status) {
      throw new BadRequestError("externalId/status가 필요합니다.");
    }

    return {
      externalId: body.externalId,
      status: body.status,
    };
  }

  /**
   * Applies payment status transition with idempotent transaction semantics.
   */
  private async applyPaymentStatus(input: ApplyPaymentStatusInput): Promise<PaymentTransitionResult> {
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

  /**
   * Maps Stripe subscription status values into internal enum.
   */
  private mapStripeSubscriptionStatus(status: Stripe.Subscription.Status) {
    if (status === "active") return SubscriptionStatus.ACTIVE;
    if (status === "trialing") return SubscriptionStatus.TRIALING;
    if (status === "past_due") return SubscriptionStatus.PAST_DUE;
    if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
      return SubscriptionStatus.CANCELED;
    }

    return SubscriptionStatus.EXPIRED;
  }
}
