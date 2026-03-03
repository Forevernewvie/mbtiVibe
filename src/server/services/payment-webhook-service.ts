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

    const body = (await request.json()) as ManualWebhookPayload;

    if (!body.externalId || !body.status) {
      throw new BadRequestError("externalId/status가 필요합니다.");
    }

    const statusMap: Record<NonNullable<ManualWebhookPayload["status"]>, PaymentStatus> = {
      PAID: PaymentStatus.PAID,
      FAILED: PaymentStatus.FAILED,
      REFUNDED: PaymentStatus.REFUNDED,
    };

    const payment = await this.prismaClient.payment.update({
      where: { externalId: body.externalId },
      data: {
        status: statusMap[body.status],
        paidAt: body.status === "PAID" ? new Date() : null,
      },
    });

    await this.tracker.track({
      name: "payment_webhook_updated",
      properties: {
        paymentId: payment.id,
        status: payment.status,
        provider: payment.provider,
      },
    });

    this.logger.info("Manual webhook processed", {
      externalId: body.externalId,
      status: body.status,
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      await this.prismaClient.payment.updateMany({
        where: {
          externalId: session.id,
        },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const itemPeriodEnd = subscription.items.data[0]?.current_period_end;

      await this.prismaClient.subscription.updateMany({
        where: {
          externalId: subscription.id,
        },
        data: {
          status: this.mapStripeSubscriptionStatus(subscription.status),
          currentPeriodEnd: itemPeriodEnd ? new Date(itemPeriodEnd * 1000) : null,
        },
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      await this.prismaClient.subscription.updateMany({
        where: {
          externalId: subscription.id,
        },
        data: {
          status: SubscriptionStatus.CANCELED,
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
