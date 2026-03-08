import { env } from "@/lib/env";
import {
  mapServerRuntimeConfig,
  type ServerRuntimeConfig,
  type ServerRuntimeInput,
} from "@/server/services/server-runtime-config";

/**
 * Reads validated process env once and maps it into the server runtime config shape.
 */
export function getServerRuntimeConfig(): ServerRuntimeConfig {
  return mapServerRuntimeConfig(readRuntimeInputFromEnv());
}

/**
 * Converts validated env values into the raw runtime-input structure used by config mappers.
 */
function readRuntimeInputFromEnv(): ServerRuntimeInput {
  return {
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    appUrl: env.APP_URL,
    paymentProvider: env.PAYMENT_PROVIDER,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    tossCheckoutUrl: env.TOSS_TEST_CHECKOUT_URL,
    portoneCheckoutUrl: env.PORTONE_TEST_CHECKOUT_URL,
    posthogKey: env.POSTHOG_KEY,
    posthogHost: env.POSTHOG_HOST,
    adminApiToken: env.ADMIN_API_TOKEN,
    resendApiKey: env.RESEND_API_KEY,
    resendFromEmail: env.RESEND_FROM_EMAIL,
  };
}
