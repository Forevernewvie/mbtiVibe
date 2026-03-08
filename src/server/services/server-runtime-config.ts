import { env } from "@/lib/env";

export type ServerRuntimeConfig = {
  appUrl: string;
  paymentProvider: "manual" | "stripe" | "toss" | "portone";
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  tossCheckoutUrl?: string;
  portoneCheckoutUrl?: string;
  adminApiToken?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
};

/**
 * Reads validated environment values into an explicit runtime config object.
 */
export function getServerRuntimeConfig(): ServerRuntimeConfig {
  return {
    appUrl: env.APP_URL,
    paymentProvider: env.PAYMENT_PROVIDER,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    tossCheckoutUrl: env.TOSS_TEST_CHECKOUT_URL,
    portoneCheckoutUrl: env.PORTONE_TEST_CHECKOUT_URL,
    adminApiToken: env.ADMIN_API_TOKEN,
    resendApiKey: env.RESEND_API_KEY,
    resendFromEmail: env.RESEND_FROM_EMAIL,
  };
}
