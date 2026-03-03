import { BillingPeriod, PaymentProvider, PaymentStatus, PrismaClient, SubscriptionStatus } from "@prisma/client";

import { APP_POLICY } from "@/config/app-policy";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { env } from "@/lib/env";
import type { Logger } from "@/lib/logger";
import { getPaymentClient, resolvePaymentProvider } from "@/lib/payment/providers";
import type { EventTracker } from "@/server/types/contracts";

type CheckoutServiceDependencies = {
  prismaClient: PrismaClient;
  tracker: EventTracker;
  logger: Logger;
  now?: () => Date;
};

export type CreateCheckoutInput = {
  assessmentId: string;
  priceCode: string;
  email?: string;
};

/**
 * Handles checkout session orchestration and payment persistence.
 */
export class CheckoutService {
  private readonly prismaClient: PrismaClient;
  private readonly tracker: EventTracker;
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(dependencies: CheckoutServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.tracker = dependencies.tracker;
    this.logger = dependencies.logger;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * Creates checkout session and stores pending/paid payment rows.
   */
  async createCheckout(input: CreateCheckoutInput) {
    const [assessment, price] = await Promise.all([
      this.prismaClient.assessment.findUnique({ where: { id: input.assessmentId } }),
      this.prismaClient.price.findUnique({
        where: { code: input.priceCode },
        include: { product: true },
      }),
    ]);

    if (!assessment || !assessment.completedAt) {
      throw new BadRequestError("완료된 진단이 필요합니다.", {
        assessmentId: input.assessmentId,
      });
    }

    if (!price || !price.isActive || !price.product.isActive) {
      throw new NotFoundError("유효하지 않은 가격 코드입니다.", {
        priceCode: input.priceCode,
      });
    }

    const provider = resolvePaymentProvider();
    const paymentClient = getPaymentClient();

    const resultPage = `${env.APP_URL}/results/${input.assessmentId}`;

    const checkout = await paymentClient.createCheckout({
      assessmentId: input.assessmentId,
      customerEmail: input.email,
      price,
      successUrl: resultPage,
      cancelUrl: resultPage,
    });

    const payment = await this.prismaClient.payment.create({
      data: {
        assessmentId: input.assessmentId,
        priceId: price.id,
        provider,
        status: PaymentStatus.PENDING,
        amount: price.amount,
        currency: price.currency,
        externalId: checkout.externalId,
        metadata: {
          assessmentId: input.assessmentId,
          priceCode: input.priceCode,
        },
      },
    });

    const isManual = provider === PaymentProvider.MANUAL;

    if (isManual) {
      await this.prismaClient.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: this.now(),
        },
      });
    }

    if (isManual && price.billingPeriod !== BillingPeriod.ONE_TIME) {
      const demoUser = assessment.userId
        ? { id: assessment.userId }
        : await this.ensureDemoUser(input.email);

      await this.prismaClient.subscription.create({
        data: {
          userId: demoUser.id,
          priceId: price.id,
          provider,
          status: SubscriptionStatus.ACTIVE,
          externalId: `${checkout.externalId}_sub`,
          currentPeriodEnd: new Date(
            this.now().getTime() + APP_POLICY.checkout.demoSubscriptionDays * APP_POLICY.time.dayMs,
          ),
        },
      });
    }

    await this.tracker.track({
      name: "checkout_created",
      sessionToken: assessment.sessionToken,
      userId: assessment.userId ?? undefined,
      properties: {
        assessmentId: input.assessmentId,
        priceCode: input.priceCode,
        provider,
        amount: price.amount,
        billingPeriod: price.billingPeriod,
      },
    });

    this.logger.info("Checkout created", {
      assessmentId: input.assessmentId,
      externalId: checkout.externalId,
      provider,
      isManual,
    });

    return {
      checkoutUrl: checkout.checkoutUrl,
      externalId: checkout.externalId,
      provider,
      demoPaid: isManual,
    };
  }

  /**
   * Creates a deterministic demo user for manual checkout fallback.
   */
  private async ensureDemoUser(email?: string) {
    const fallbackEmail = email ?? `demo-${this.now().getTime()}@example.com`;

    const existing = await this.prismaClient.user.findUnique({
      where: { email: fallbackEmail },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return this.prismaClient.user.create({
      data: {
        email: fallbackEmail,
        name: APP_POLICY.checkout.demoUserName,
      },
      select: {
        id: true,
      },
    });
  }
}
