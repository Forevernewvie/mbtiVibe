import type Stripe from "stripe";
import { PaymentProvider, PaymentStatus, SubscriptionStatus, type Price } from "@prisma/client";
import type { ScoringInput, ScoringOutput } from "@/lib/scoring";

/**
 * Normalized tracking payload contract.
 */
export type TrackEventInput = {
  name: string;
  sessionToken?: string;
  userId?: string;
  properties?: Record<string, unknown>;
};

/**
 * Analytics dependency contract.
 */
export interface EventTracker {
  track(input: TrackEventInput): Promise<void>;
}

export type PaymentCheckoutInput = {
  assessmentId: string;
  customerEmail?: string;
  price: Price;
  successUrl: string;
  cancelUrl: string;
};

export type PaymentCheckoutResult = {
  externalId: string;
  checkoutUrl: string;
};

/**
 * Payment gateway abstraction consumed by checkout orchestration.
 */
export interface PaymentGateway {
  getProvider(): PaymentProvider;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
}

/**
 * Application URL resolver abstraction used for redirect construction.
 */
export interface AppUrlResolver {
  getAppUrl(): string;
}

/**
 * Assessment scoring abstraction used to decouple domain scoring logic from service orchestration.
 */
export interface AssessmentScorer {
  calculate(responses: ScoringInput[]): ScoringOutput;
}

export type PaymentWebhookSource = "manual_webhook" | "stripe_webhook";

export type PaymentStatusUpdate = {
  externalId: string;
  nextStatus: PaymentStatus;
  source: PaymentWebhookSource;
  sourceStatus: string;
  eventId?: string;
  eventType?: string;
};

export type SubscriptionStatusUpdate = {
  externalId: string;
  provider: PaymentProvider;
  status: SubscriptionStatus;
  source: PaymentWebhookSource;
  sourceStatus: string;
  currentPeriodEnd?: Date | null;
  eventId?: string;
  eventType?: string;
};

export type PaymentWebhookParseResult = {
  responseBody: Record<string, unknown>;
  paymentUpdates: PaymentStatusUpdate[];
  subscriptionUpdates: SubscriptionStatusUpdate[];
  logContext: Record<string, unknown>;
};

/**
 * Payment webhook gateway abstraction that normalizes provider-specific requests.
 */
export interface PaymentWebhookGateway {
  parse(request: Request): Promise<PaymentWebhookParseResult>;
}

/**
 * Stripe webhook signature verification and event parsing abstraction.
 */
export interface StripeWebhookParser {
  parse(request: Request): Promise<Stripe.Event>;
}
