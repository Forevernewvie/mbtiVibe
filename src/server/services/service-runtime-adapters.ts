import { PaymentProvider } from "@prisma/client";
import { Resend } from "resend";

import { AnalyticsEventTracker, createPostHogCaptureClient } from "@/lib/analytics";
import type { Logger } from "@/lib/logger";
import {
  createPaymentGateway,
  resolvePaymentProvider,
} from "@/lib/payment/providers";
import { StaticAdminAccessPolicy } from "@/server/services/admin-access-policy";
import { StaticAppUrlResolver } from "@/server/services/app-url-resolver";
import {
  ManualPaymentWebhookGateway,
  PaymentWebhookGatewayRegistry,
  StripePaymentWebhookGateway,
} from "@/server/services/payment-webhook-gateway";
import { getServerRuntimeConfig } from "@/server/services/server-runtime-env";
import type { ServerRuntimeConfig } from "@/server/services/server-runtime-config";
import { StaticSupportAcknowledgementTemplateBuilder } from "@/server/services/support-email-template";
import { ResendSupportEmailSender } from "@/server/services/support-email-sender";
import type {
  AdminAccessPolicy,
  AppUrlResolver,
  EventTracker,
  PaymentGateway,
  PaymentWebhookGateway,
  SupportEmailSender,
} from "@/server/types/contracts";
import type { PrismaClient } from "@prisma/client";

export type ServerServiceAdapters = {
  adminAccessPolicy: AdminAccessPolicy;
  appUrlResolver: AppUrlResolver;
  eventTracker: EventTracker;
  paymentGateway: PaymentGateway;
  webhookGateway: PaymentWebhookGateway;
  supportEmailSender: SupportEmailSender | null;
  systemAdminToken?: string;
};

type RuntimeAdapterDependencies = {
  prismaClient: Pick<PrismaClient, "event">;
  logger: Logger;
  runtimeConfig?: ServerRuntimeConfig;
};

/**
 * Builds external infrastructure adapters from runtime config and concrete SDK clients.
 */
export function createServerServiceAdapters(
  dependencies: RuntimeAdapterDependencies,
): ServerServiceAdapters {
  const configuration = dependencies.runtimeConfig ?? getServerRuntimeConfig();
  const provider = resolvePaymentProvider(configuration.paymentProvider);

  return {
    adminAccessPolicy: new StaticAdminAccessPolicy(configuration.adminApiToken),
    appUrlResolver: new StaticAppUrlResolver(configuration.appUrl),
    eventTracker: createEventTracker(dependencies.prismaClient, dependencies.logger, configuration),
    paymentGateway: createPaymentGateway({
      provider,
      stripeSecretKey: configuration.stripeSecretKey,
      tossCheckoutUrl: configuration.tossCheckoutUrl,
      portoneCheckoutUrl: configuration.portoneCheckoutUrl,
    }),
    webhookGateway: createPaymentWebhookGateway(provider, configuration),
    supportEmailSender: createSupportEmailSender(configuration),
    systemAdminToken: configuration.adminApiToken,
  };
}

/**
 * Creates provider strategy registry for webhook request parsing.
 */
function createPaymentWebhookGateway(
  provider: PaymentProvider,
  configuration: ServerRuntimeConfig,
): PaymentWebhookGateway {
  const manualGateway = new ManualPaymentWebhookGateway();
  const effectiveProvider =
    provider === PaymentProvider.STRIPE ? PaymentProvider.STRIPE : PaymentProvider.MANUAL;

  return new PaymentWebhookGatewayRegistry(effectiveProvider, {
    [PaymentProvider.MANUAL]: manualGateway,
    [PaymentProvider.STRIPE]:
      provider === PaymentProvider.STRIPE
        ? new StripePaymentWebhookGateway(
            configuration.stripeSecretKey!,
            configuration.stripeWebhookSecret!,
          )
        : undefined,
  });
}

/**
 * Creates the default analytics tracker from persistence, logging, and runtime config.
 */
function createEventTracker(
  prismaClient: Pick<PrismaClient, "event">,
  logger: Logger,
  configuration: ServerRuntimeConfig,
): EventTracker {
  return new AnalyticsEventTracker({
    persistence: prismaClient,
    logger,
    captureClient: createPostHogCaptureClient(configuration.analytics),
  });
}

/**
 * Creates optional support email sender only when outbound mail runtime config is complete.
 */
function createSupportEmailSender(
  configuration: ServerRuntimeConfig,
): SupportEmailSender | null {
  if (!configuration.resendApiKey || !configuration.resendFromEmail) {
    return null;
  }

  return new ResendSupportEmailSender(
    new Resend(configuration.resendApiKey),
    configuration.resendFromEmail,
    new StaticSupportAcknowledgementTemplateBuilder(),
  );
}
