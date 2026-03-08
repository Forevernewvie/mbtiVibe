import { randomUUID } from "node:crypto";

import Stripe from "stripe";

import { BillingPeriod, PaymentProvider } from "@prisma/client";
import { env } from "@/lib/env";
import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentGateway,
} from "@/server/types/contracts";

const STRIPE_PRICE_PREFIX = "price_";

type PaymentClient = {
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
};

/**
 * Local/manual payment client used for development and test flows.
 */
class ManualPaymentClient {
  /**
   * Creates synthetic checkout URL and marks demo paid path.
   */
  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    return {
      externalId: `manual_${randomUUID()}`,
      checkoutUrl: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}demoPaid=1`,
    };
  }
}

/**
 * Stripe payment client implementation.
 */
class StripePaymentClient {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }

  /**
   * Creates Stripe checkout session for one-time or recurring billing.
   */
  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    const mode =
      input.price.billingPeriod === BillingPeriod.ONE_TIME ? "payment" : "subscription";

    const recurringInterval =
      input.price.billingPeriod === BillingPeriod.YEARLY ? "year" : "month";

    const externalPriceId =
      input.price.externalId && input.price.externalId.startsWith(STRIPE_PRICE_PREFIX)
        ? input.price.externalId
        : undefined;

    const session = await this.stripe.checkout.sessions.create({
      mode,
      line_items: [
        {
          quantity: 1,
          price: externalPriceId,
          price_data: externalPriceId
            ? undefined
            : {
                currency: input.price.currency.toLowerCase(),
                unit_amount: input.price.amount,
                product_data: {
                  name: `VibeWeb ${input.price.code}`,
                },
                recurring:
                  mode === "subscription"
                    ? {
                        interval: recurringInterval,
                      }
                    : undefined,
              },
        },
      ],
      customer_email: input.customerEmail,
      success_url: `${input.successUrl}?checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl,
      metadata: {
        assessmentId: input.assessmentId,
        priceCode: input.price.code,
      },
    });

    if (!session.url) {
      throw new Error("Stripe checkout URL is missing");
    }

    return {
      externalId: session.id,
      checkoutUrl: session.url,
    };
  }
}

/**
 * Redirect-style provider for gateways handled on third-party checkout pages.
 */
class RedirectGatewayClient {
  constructor(private readonly baseUrl: string, private readonly providerPrefix: string) {}

  /**
   * Builds redirect URL carrying transaction context in query parameters.
   */
  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    const externalId = `${this.providerPrefix}_${randomUUID()}`;
    const checkoutUrl = new URL(this.baseUrl);

    checkoutUrl.searchParams.set("externalId", externalId);
    checkoutUrl.searchParams.set("assessmentId", input.assessmentId);
    checkoutUrl.searchParams.set("amount", String(input.price.amount));
    checkoutUrl.searchParams.set("currency", input.price.currency);
    checkoutUrl.searchParams.set("successUrl", input.successUrl);
    checkoutUrl.searchParams.set("cancelUrl", input.cancelUrl);

    return {
      externalId,
      checkoutUrl: checkoutUrl.toString(),
    };
  }
}

/**
 * Resolves currently selected payment provider enum from environment.
 */
export function resolvePaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "stripe") return PaymentProvider.STRIPE;
  if (env.PAYMENT_PROVIDER === "toss") return PaymentProvider.TOSS;
  if (env.PAYMENT_PROVIDER === "portone") return PaymentProvider.PORTONE;

  return PaymentProvider.MANUAL;
}

/**
 * Returns provider client instance based on PAYMENT_PROVIDER env.
 */
export function getPaymentClient(): PaymentClient {
  if (env.PAYMENT_PROVIDER === "stripe") {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error("PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY");
    }

    return new StripePaymentClient(env.STRIPE_SECRET_KEY);
  }

  if (env.PAYMENT_PROVIDER === "toss") {
    if (!env.TOSS_TEST_CHECKOUT_URL) {
      throw new Error("PAYMENT_PROVIDER=toss requires TOSS_TEST_CHECKOUT_URL");
    }

    return new RedirectGatewayClient(env.TOSS_TEST_CHECKOUT_URL, "toss");
  }

  if (env.PAYMENT_PROVIDER === "portone") {
    if (!env.PORTONE_TEST_CHECKOUT_URL) {
      throw new Error("PAYMENT_PROVIDER=portone requires PORTONE_TEST_CHECKOUT_URL");
    }

    return new RedirectGatewayClient(env.PORTONE_TEST_CHECKOUT_URL, "portone");
  }

  return new ManualPaymentClient();
}

/**
 * Environment-backed payment gateway used by production checkout service wiring.
 */
export class EnvPaymentGateway implements PaymentGateway {
  /**
   * Returns active provider selected by environment variables.
   */
  getProvider(): PaymentProvider {
    return resolvePaymentProvider();
  }

  /**
   * Delegates checkout creation to the currently configured provider client.
   */
  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    const paymentClient = getPaymentClient();
    return paymentClient.createCheckout(input);
  }
}
