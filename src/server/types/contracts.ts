import type Stripe from "stripe";
import { BillingPeriod, PaymentProvider, PaymentStatus, SubscriptionStatus } from "@prisma/client";
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

/**
 * Immutable pricing snapshot passed into checkout providers without leaking ORM entities.
 */
export type PaymentPriceSnapshot = {
  id: string;
  code: string;
  amount: number;
  currency: string;
  billingPeriod: BillingPeriod;
  externalId?: string | null;
};

export type PaymentCheckoutInput = {
  assessmentId: string;
  customerEmail?: string;
  price: PaymentPriceSnapshot;
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

/**
 * Admin authorization policy used by privileged services.
 */
export interface AdminAccessPolicy {
  assertAuthorized(adminToken?: string | null): void;
}

export type SupportTicketAcknowledgementInput = {
  recipientEmail: string;
  ticketId: string;
};

/**
 * Support acknowledgement sender abstraction used by ticket workflows.
 */
export interface SupportEmailSender {
  sendAcknowledgement(input: SupportTicketAcknowledgementInput): Promise<void>;
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
