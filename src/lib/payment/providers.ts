import { randomUUID } from "node:crypto";

import Stripe from "stripe";

import { BillingPeriod, PaymentProvider } from "@prisma/client";
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
 * Runtime payment gateway configuration assembled by the composition root.
 */
export type PaymentGatewayConfiguration = {
  provider: PaymentProvider;
  stripeSecretKey?: string;
  tossCheckoutUrl?: string;
  portoneCheckoutUrl?: string;
};

/**
 * Resolves runtime payment provider enum from application config string.
 */
export function resolvePaymentProvider(
  provider: "manual" | "stripe" | "toss" | "portone",
): PaymentProvider {
  if (provider === "stripe") return PaymentProvider.STRIPE;
  if (provider === "toss") return PaymentProvider.TOSS;
  if (provider === "portone") return PaymentProvider.PORTONE;

  return PaymentProvider.MANUAL;
}

/**
 * Builds provider-specific checkout client from explicit runtime configuration.
 */
function createPaymentClient(configuration: PaymentGatewayConfiguration): PaymentClient {
  if (configuration.provider === PaymentProvider.STRIPE) {
    if (!configuration.stripeSecretKey) {
      throw new Error("PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY");
    }

    return new StripePaymentClient(configuration.stripeSecretKey);
  }

  if (configuration.provider === PaymentProvider.TOSS) {
    if (!configuration.tossCheckoutUrl) {
      throw new Error("PAYMENT_PROVIDER=toss requires TOSS_TEST_CHECKOUT_URL");
    }

    return new RedirectGatewayClient(configuration.tossCheckoutUrl, "toss");
  }

  if (configuration.provider === PaymentProvider.PORTONE) {
    if (!configuration.portoneCheckoutUrl) {
      throw new Error("PAYMENT_PROVIDER=portone requires PORTONE_TEST_CHECKOUT_URL");
    }

    return new RedirectGatewayClient(configuration.portoneCheckoutUrl, "portone");
  }

  return new ManualPaymentClient();
}

/**
 * Configured payment gateway used by composition-root service wiring.
 */
export class ConfiguredPaymentGateway implements PaymentGateway {
  private readonly provider: PaymentProvider;
  private readonly paymentClient: PaymentClient;

  constructor(
    provider: PaymentProvider,
    paymentClient: PaymentClient,
  ) {
    this.provider = provider;
    this.paymentClient = paymentClient;
  }

  /**
   * Returns active provider selected by environment variables.
   */
  getProvider(): PaymentProvider {
    return this.provider;
  }

  /**
   * Delegates checkout creation to the currently configured provider client.
   */
  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    return this.paymentClient.createCheckout(input);
  }
}

/**
 * Creates configured payment gateway from explicit runtime configuration.
 */
export function createPaymentGateway(configuration: PaymentGatewayConfiguration): PaymentGateway {
  return new ConfiguredPaymentGateway(
    configuration.provider,
    createPaymentClient(configuration),
  );
}
