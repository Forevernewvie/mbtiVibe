import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ActionPlanService } from "@/server/services/action-plan-service";
import { AssessmentService } from "@/server/services/assessment-service";
import { CheckoutService } from "@/server/services/checkout-service";
import { eventTracker } from "@/server/services/event-tracker";
import { ExperimentService } from "@/server/services/experiment-service";
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
  }),
  checkout: new CheckoutService({
    prismaClient: prisma,
    tracker: eventTracker,
    logger,
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
  }),
};
