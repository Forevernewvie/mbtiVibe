const DEFAULT_POSTHOG_HOST = "https://app.posthog.com";

export type RuntimeEnvironment = "development" | "test" | "production";
export type RuntimePaymentProvider = "manual" | "stripe" | "toss" | "portone";
export type PrismaLogLevel = "error" | "warn";

export type ServerRuntimeInput = {
  nodeEnv: RuntimeEnvironment;
  databaseUrl: string;
  appUrl: string;
  paymentProvider: RuntimePaymentProvider;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  tossCheckoutUrl?: string;
  portoneCheckoutUrl?: string;
  posthogKey?: string;
  posthogHost?: string;
  adminApiToken?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
};

export type DatabaseRuntimeConfig = {
  connectionString: string;
  logLevels: PrismaLogLevel[];
  reuseGlobalClient: boolean;
};

export type AnalyticsRuntimeConfig = {
  posthogKey?: string;
  posthogHost: string;
};

export type ServerRuntimeConfig = {
  appUrl: string;
  paymentProvider: RuntimePaymentProvider;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  tossCheckoutUrl?: string;
  portoneCheckoutUrl?: string;
  adminApiToken?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
  database: DatabaseRuntimeConfig;
  analytics: AnalyticsRuntimeConfig;
};

/**
 * Maps validated process input into an explicit runtime configuration object.
 */
export function mapServerRuntimeConfig(input: ServerRuntimeInput): ServerRuntimeConfig {
  return {
    appUrl: input.appUrl,
    paymentProvider: input.paymentProvider,
    stripeSecretKey: input.stripeSecretKey,
    stripeWebhookSecret: input.stripeWebhookSecret,
    tossCheckoutUrl: input.tossCheckoutUrl,
    portoneCheckoutUrl: input.portoneCheckoutUrl,
    adminApiToken: input.adminApiToken,
    resendApiKey: input.resendApiKey,
    resendFromEmail: input.resendFromEmail,
    database: createDatabaseRuntimeConfig(input),
    analytics: createAnalyticsRuntimeConfig(input),
  };
}

/**
 * Maps runtime database settings into a Prisma-friendly configuration object.
 */
export function createDatabaseRuntimeConfig(input: Pick<ServerRuntimeInput, "databaseUrl" | "nodeEnv">): DatabaseRuntimeConfig {
  return {
    connectionString: input.databaseUrl,
    logLevels: input.nodeEnv === "development" ? ["error", "warn"] : ["error"],
    reuseGlobalClient: input.nodeEnv !== "production",
  };
}

/**
 * Maps analytics-related runtime settings into a transport-friendly configuration object.
 */
export function createAnalyticsRuntimeConfig(
  input: Pick<ServerRuntimeInput, "posthogKey" | "posthogHost">,
): AnalyticsRuntimeConfig {
  return {
    posthogKey: input.posthogKey,
    posthogHost: input.posthogHost ?? DEFAULT_POSTHOG_HOST,
  };
}
