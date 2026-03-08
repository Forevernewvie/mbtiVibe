import { Resend } from "resend";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EnvPaymentGateway } from "@/lib/payment/providers";
import { prisma } from "@/lib/prisma";
import { ActionPlanService } from "@/server/services/action-plan-service";
import { StaticAdminAccessPolicy } from "@/server/services/admin-access-policy";
import { DefaultAssessmentScorer } from "@/server/services/assessment-scorer";
import { AssessmentService } from "@/server/services/assessment-service";
import { EnvAppUrlResolver } from "@/server/services/app-url-resolver";
import { CheckoutService } from "@/server/services/checkout-service";
import { eventTracker } from "@/server/services/event-tracker";
import { ExperimentService } from "@/server/services/experiment-service";
import { EnvPaymentWebhookGateway } from "@/server/services/payment-webhook-gateway";
import { MetricsService } from "@/server/services/metrics-service";
import { PaymentWebhookService } from "@/server/services/payment-webhook-service";
import { ReportService } from "@/server/services/report-service";
import { SupportService } from "@/server/services/support-service";
import { ResendSupportEmailSender } from "@/server/services/support-email-sender";

/**
 * Dependency bag for composing server-side application services.
 */
type ServerServiceDependencies = {
  prismaClient?: typeof prisma;
  tracker?: typeof eventTracker;
  loggerInstance?: typeof logger;
};

/**
 * Builds a fresh set of server services from explicit infrastructure dependencies.
 */
export function createServerServices(
  dependencies: ServerServiceDependencies = {},
) {
  const prismaClient = dependencies.prismaClient ?? prisma;
  const tracker = dependencies.tracker ?? eventTracker;
  const loggerInstance = dependencies.loggerInstance ?? logger;
  const adminAccessPolicy = new StaticAdminAccessPolicy(env.ADMIN_API_TOKEN);
  const supportEmailSender =
    env.RESEND_API_KEY && env.RESEND_FROM_EMAIL
      ? new ResendSupportEmailSender(new Resend(env.RESEND_API_KEY), env.RESEND_FROM_EMAIL)
      : null;

  return {
    assessment: new AssessmentService({
      prismaClient,
      tracker,
      logger: loggerInstance,
      scorer: new DefaultAssessmentScorer(),
    }),
    checkout: new CheckoutService({
      prismaClient,
      tracker,
      logger: loggerInstance,
      paymentGateway: new EnvPaymentGateway(),
      appUrlResolver: new EnvAppUrlResolver(),
    }),
    report: new ReportService({
      prismaClient,
    }),
    experiment: new ExperimentService({
      prismaClient,
      adminAccessPolicy,
    }),
    metrics: new MetricsService({
      prismaClient,
      adminAccessPolicy,
    }),
    actionPlan: new ActionPlanService({
      prismaClient,
    }),
    support: new SupportService({
      prismaClient,
      logger: loggerInstance,
      emailSender: supportEmailSender,
    }),
    webhook: new PaymentWebhookService({
      prismaClient,
      tracker,
      logger: loggerInstance,
      webhookGateway: new EnvPaymentWebhookGateway(),
    }),
  };
}

export type ServerServices = ReturnType<typeof createServerServices>;
