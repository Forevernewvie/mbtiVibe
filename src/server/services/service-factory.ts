import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { EnvPaymentGateway } from "@/lib/payment/providers";
import { ActionPlanService } from "@/server/services/action-plan-service";
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

/**
 * Creates lazily shared service instances for API routes.
 */
export const services = {
  assessment: new AssessmentService({
    prismaClient: prisma,
    tracker: eventTracker,
    logger,
    scorer: new DefaultAssessmentScorer(),
  }),
  checkout: new CheckoutService({
    prismaClient: prisma,
    tracker: eventTracker,
    logger,
    paymentGateway: new EnvPaymentGateway(),
    appUrlResolver: new EnvAppUrlResolver(),
  }),
  report: new ReportService({
    prismaClient: prisma,
  }),
  experiment: new ExperimentService({
    prismaClient: prisma,
  }),
  metrics: new MetricsService({
    prismaClient: prisma,
  }),
  actionPlan: new ActionPlanService({
    prismaClient: prisma,
  }),
  support: new SupportService({
    prismaClient: prisma,
  }),
  webhook: new PaymentWebhookService({
    prismaClient: prisma,
    tracker: eventTracker,
    logger,
    webhookGateway: new EnvPaymentWebhookGateway(),
  }),
};
