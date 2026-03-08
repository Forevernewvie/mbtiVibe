import type { Logger } from "@/lib/logger";
import type {
  PaymentWebhookGateway,
  PaymentWebhookTransitionApplier,
} from "@/server/types/contracts";

type PaymentWebhookServiceDependencies = {
  webhookGateway: PaymentWebhookGateway;
  transitionApplier: PaymentWebhookTransitionApplier;
  logger: Pick<Logger, "info">;
};

/**
 * Handles payment provider webhook normalization and persistence.
 */
export class PaymentWebhookService {
  private readonly webhookGateway: PaymentWebhookGateway;
  private readonly transitionApplier: PaymentWebhookTransitionApplier;
  private readonly logger: Pick<Logger, "info">;

  constructor(dependencies: PaymentWebhookServiceDependencies) {
    this.webhookGateway = dependencies.webhookGateway;
    this.transitionApplier = dependencies.transitionApplier;
    this.logger = dependencies.logger;
  }

  /**
   * Processes webhook request for configured payment provider.
   */
  async handle(request: Request) {
    const parsed = await this.webhookGateway.parse(request);

    for (const paymentUpdate of parsed.paymentUpdates) {
      await this.transitionApplier.applyPaymentStatus(paymentUpdate);
    }

    for (const subscriptionUpdate of parsed.subscriptionUpdates) {
      await this.transitionApplier.applySubscriptionStatus(subscriptionUpdate);
    }

    this.logger.info("Payment webhook processed", {
      ...parsed.logContext,
      paymentUpdateCount: parsed.paymentUpdates.length,
      subscriptionUpdateCount: parsed.subscriptionUpdates.length,
    });

    return parsed.responseBody;
  }
}
