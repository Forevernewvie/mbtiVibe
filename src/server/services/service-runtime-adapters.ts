import { PaymentProvider } from "@prisma/client";
import { Resend } from "resend";

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
import { getServerRuntimeConfig, type ServerRuntimeConfig } from "@/server/services/server-runtime-config";
import { StaticSupportAcknowledgementTemplateBuilder } from "@/server/services/support-email-template";
import { ResendSupportEmailSender } from "@/server/services/support-email-sender";
import type {
  AdminAccessPolicy,
  AppUrlResolver,
  PaymentGateway,
  PaymentWebhookGateway,
  SupportEmailSender,
} from "@/server/types/contracts";

export type ServerServiceAdapters = {
  adminAccessPolicy: AdminAccessPolicy;
  appUrlResolver: AppUrlResolver;
  paymentGateway: PaymentGateway;
  webhookGateway: PaymentWebhookGateway;
  supportEmailSender: SupportEmailSender | null;
  systemAdminToken?: string;
};

/**
 * Builds runtime service adapters from explicit configuration.
 */
export function createServerServiceAdapters(
  configuration: ServerRuntimeConfig = getServerRuntimeConfig(),
): ServerServiceAdapters {
  const provider = resolvePaymentProvider(configuration.paymentProvider);

  return {
    adminAccessPolicy: new StaticAdminAccessPolicy(configuration.adminApiToken),
    appUrlResolver: new StaticAppUrlResolver(configuration.appUrl),
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
