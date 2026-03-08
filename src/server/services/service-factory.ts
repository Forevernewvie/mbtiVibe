import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ActionPlanService } from "@/server/services/action-plan-service";
import { DefaultAssessmentScorer } from "@/server/services/assessment-scorer";
import { AssessmentService } from "@/server/services/assessment-service";
import { CheckoutService } from "@/server/services/checkout-service";
import { ExperimentService } from "@/server/services/experiment-service";
import { MetricsService } from "@/server/services/metrics-service";
import { PaymentWebhookService } from "@/server/services/payment-webhook-service";
import { PaymentWebhookTransitionService } from "@/server/services/payment-webhook-transition-service";
import { ReportService } from "@/server/services/report-service";
import {
  createServerServiceAdapters,
  type ServerServiceAdapters,
} from "@/server/services/service-runtime-adapters";
import { SupportService } from "@/server/services/support-service";
import type { EventTracker } from "@/server/types/contracts";

/**
 * Dependency bag for composing server-side application services.
 */
type ServerServiceDependencies = {
  prismaClient?: typeof prisma;
  tracker?: EventTracker;
  loggerInstance?: typeof logger;
  adapters?: ServerServiceAdapters;
};

/**
 * Composes application services from already-built infrastructure adapters and shared utilities.
 */
export function createServerServices(
  dependencies: ServerServiceDependencies = {},
) {
  const prismaClient = dependencies.prismaClient ?? prisma;
  const loggerInstance = dependencies.loggerInstance ?? logger;
  const adapters =
    dependencies.adapters ??
    createServerServiceAdapters({
      prismaClient,
      logger: loggerInstance,
    });
  const tracker = dependencies.tracker ?? adapters.eventTracker;
  const webhookTransitionApplier = new PaymentWebhookTransitionService({
    prismaClient,
    tracker,
    logger: loggerInstance,
  });

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
      paymentGateway: adapters.paymentGateway,
      appUrlResolver: adapters.appUrlResolver,
    }),
    report: new ReportService({
      prismaClient,
    }),
    experiment: new ExperimentService({
      prismaClient,
      adminAccessPolicy: adapters.adminAccessPolicy,
    }),
    metrics: new MetricsService({
      prismaClient,
      adminAccessPolicy: adapters.adminAccessPolicy,
    }),
    actionPlan: new ActionPlanService({
      prismaClient,
    }),
    support: new SupportService({
      prismaClient,
      logger: loggerInstance,
      emailSender: adapters.supportEmailSender,
    }),
    webhook: new PaymentWebhookService({
      logger: loggerInstance,
      webhookGateway: adapters.webhookGateway,
      transitionApplier: webhookTransitionApplier,
    }),
  };
}

export type ServerServices = ReturnType<typeof createServerServices>;
