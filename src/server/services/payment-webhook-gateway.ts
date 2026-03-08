import Stripe from "stripe";
import {
  PaymentProvider,
  PaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";

import { BadRequestError } from "@/lib/errors";
import { env } from "@/lib/env";
import type {
  PaymentWebhookGateway,
  PaymentWebhookParseResult,
  PaymentWebhookSource,
} from "@/server/types/contracts";

type ManualWebhookPayload = {
  externalId?: string;
  status?: "PAID" | "FAILED" | "REFUNDED";
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
 * Parses the manual provider webhook payload into normalized update instructions.
 */
class ManualPaymentWebhookGateway implements PaymentWebhookGateway {
  /**
   * Validates JSON payload and maps it to a payment status transition.
   */
  async parse(request: Request): Promise<PaymentWebhookParseResult> {
    const body = await this.parsePayload(request);

    return {
      responseBody: { ok: true },
      paymentUpdates: [
        {
          externalId: body.externalId,
          nextStatus: MANUAL_STATUS_MAP[body.status],
          source: "manual_webhook",
          sourceStatus: body.status,
        },
      ],
      subscriptionUpdates: [],
      logContext: {
        provider: "manual",
        externalId: body.externalId,
        status: body.status,
      },
    };
  }

  /**
   * Parses manual webhook JSON and rejects invalid payloads early.
   */
  private async parsePayload(request: Request): Promise<{
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
}

/**
 * Parses Stripe webhook requests and converts them into normalized updates.
 */
class StripePaymentWebhookGateway implements PaymentWebhookGateway {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
    });
    this.webhookSecret = webhookSecret;
  }

  /**
   * Verifies Stripe signature and returns normalized payment/subscription updates.
   */
  async parse(request: Request): Promise<PaymentWebhookParseResult> {
    const event = await this.parseEvent(request);
    const paymentUpdates = this.buildPaymentUpdates(event);
    const subscriptionUpdates = this.buildSubscriptionUpdates(event);

    return {
      responseBody: { received: true },
      paymentUpdates,
      subscriptionUpdates,
      logContext: {
        provider: "stripe",
        eventId: event.id,
        eventType: event.type,
      },
    };
  }

  /**
   * Verifies request signature and deserializes the Stripe event payload.
   */
  private async parseEvent(request: Request): Promise<Stripe.Event> {
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      throw new BadRequestError("Missing stripe-signature header");
    }

    const payload = await request.text();

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      throw new BadRequestError("Invalid webhook signature", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  /**
   * Maps Stripe checkout events into normalized payment status transitions.
   */
  private buildPaymentUpdates(event: Stripe.Event) {
    const nextStatus = STRIPE_PAYMENT_EVENT_STATUS[event.type];

    if (!nextStatus) {
      return [];
    }

    const session = event.data.object as Stripe.Checkout.Session;

    return [
      {
        externalId: session.id,
        nextStatus,
        source: "stripe_webhook" as PaymentWebhookSource,
        sourceStatus: event.type,
        eventId: event.id,
        eventType: event.type,
      },
    ];
  }

  /**
   * Maps Stripe subscription lifecycle events into normalized subscription updates.
   */
  private buildSubscriptionUpdates(event: Stripe.Event) {
    if (event.type !== "customer.subscription.updated" && event.type !== "customer.subscription.deleted") {
      return [];
    }

    const subscription = event.data.object as Stripe.Subscription;
    const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

    return [
      {
        externalId: subscription.id,
        provider: PaymentProvider.STRIPE,
        status:
          event.type === "customer.subscription.deleted"
            ? SubscriptionStatus.CANCELED
            : this.mapStripeSubscriptionStatus(subscription.status),
        source: "stripe_webhook" as PaymentWebhookSource,
        sourceStatus: event.type,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        eventId: event.id,
        eventType: event.type,
      },
    ];
  }

  /**
   * Maps Stripe subscription state strings into internal status enums.
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

/**
 * Environment-backed webhook gateway that selects the active provider adapter.
 */
export class EnvPaymentWebhookGateway implements PaymentWebhookGateway {
  /**
   * Delegates parsing to the provider-specific webhook gateway.
   */
  async parse(request: Request): Promise<PaymentWebhookParseResult> {
    return this.resolveGateway().parse(request);
  }

  /**
   * Resolves provider-specific webhook gateway from validated environment config.
   */
  private resolveGateway(): PaymentWebhookGateway {
    if (env.PAYMENT_PROVIDER === "stripe") {
      return new StripePaymentWebhookGateway(
        env.STRIPE_SECRET_KEY!,
        env.STRIPE_WEBHOOK_SECRET!,
      );
    }

    return new ManualPaymentWebhookGateway();
  }
}
