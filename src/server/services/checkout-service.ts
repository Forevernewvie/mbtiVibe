import {
  BillingPeriod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";

import { APP_POLICY } from "@/config/app-policy";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import type {
  AppUrlResolver,
  EventTracker,
  PaymentCheckoutResult,
  PaymentGateway,
  PaymentPriceSnapshot,
} from "@/server/types/contracts";

type CheckoutPersistence = Pick<PrismaClient, "$transaction"> & {
  assessment: Pick<PrismaClient["assessment"], "findUnique">;
  price: Pick<PrismaClient["price"], "findUnique">;
};

type CheckoutServiceDependencies = {
  prismaClient: CheckoutPersistence;
  tracker: EventTracker;
  logger: Logger;
  paymentGateway: PaymentGateway;
  appUrlResolver: AppUrlResolver;
  now?: () => Date;
};

type UserDelegate = Pick<Prisma.TransactionClient["user"], "findUnique" | "create">;

export type CreateCheckoutInput = {
  assessmentId: string;
  priceCode: string;
  email?: string;
};

/**
 * Handles checkout session orchestration and payment persistence.
 */
export class CheckoutService {
  private readonly prismaClient: CheckoutPersistence;
  private readonly tracker: EventTracker;
  private readonly logger: Logger;
  private readonly paymentGateway: PaymentGateway;
  private readonly appUrlResolver: AppUrlResolver;
  private readonly now: () => Date;

  constructor(dependencies: CheckoutServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.tracker = dependencies.tracker;
    this.logger = dependencies.logger;
    this.paymentGateway = dependencies.paymentGateway;
    this.appUrlResolver = dependencies.appUrlResolver;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * Creates checkout session and stores pending/paid payment rows.
   */
  async createCheckout(input: CreateCheckoutInput) {
    const { assessment, price } = await this.loadCheckoutContext(input);
    const provider = this.paymentGateway.getProvider();
    const resultPage = this.buildResultPageUrl(input.assessmentId);
    const checkout = await this.paymentGateway.createCheckout({
      assessmentId: input.assessmentId,
      customerEmail: input.email,
      price,
      successUrl: resultPage,
      cancelUrl: resultPage,
    });

    const isManual = provider === PaymentProvider.MANUAL;
    const checkoutCreatedAt = this.now();

    await this.persistCheckout({
      input,
      assessment,
      price,
      checkout,
      provider,
      isManual,
      checkoutCreatedAt,
    });

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
   * Loads and validates assessment/price data required for checkout creation.
   */
  private async loadCheckoutContext(input: CreateCheckoutInput) {
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

    return {
      assessment,
      price: this.toPaymentPriceSnapshot(price),
    };
  }

  /**
   * Converts persistence-backed price records into immutable checkout price snapshots.
   */
  private toPaymentPriceSnapshot(price: {
    id: string;
    code: string;
    amount: number;
    currency: string;
    billingPeriod: BillingPeriod;
    externalId?: string | null;
  }): PaymentPriceSnapshot {
    return {
      id: price.id,
      code: price.code,
      amount: price.amount,
      currency: price.currency,
      billingPeriod: price.billingPeriod,
      externalId: price.externalId,
    };
  }

  /**
   * Builds result page URL used for checkout success and cancel redirects.
   */
  private buildResultPageUrl(assessmentId: string): string {
    return `${this.appUrlResolver.getAppUrl()}/results/${assessmentId}`;
  }

  /**
   * Persists payment state and optional subscription side effects atomically.
   */
  private async persistCheckout({
    input,
    assessment,
    price,
    checkout,
    provider,
    isManual,
    checkoutCreatedAt,
  }: {
    input: CreateCheckoutInput;
    assessment: {
      userId: string | null;
    };
    price: PaymentPriceSnapshot;
    checkout: PaymentCheckoutResult;
    provider: PaymentProvider;
    isManual: boolean;
    checkoutCreatedAt: Date;
  }) {
    await this.prismaClient.$transaction(async (tx) => {
      const payment = await tx.payment.create({
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

      if (isManual) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: checkoutCreatedAt,
          },
        });
      }

      if (isManual && price.billingPeriod !== BillingPeriod.ONE_TIME) {
        const demoUser = assessment.userId
          ? { id: assessment.userId }
          : await this.ensureDemoUser(tx.user, checkoutCreatedAt, input.email);

        await tx.subscription.create({
          data: {
            userId: demoUser.id,
            priceId: price.id,
            provider,
            status: SubscriptionStatus.ACTIVE,
            externalId: `${checkout.externalId}_sub`,
            currentPeriodEnd: new Date(
              checkoutCreatedAt.getTime() +
                APP_POLICY.checkout.demoSubscriptionDays * APP_POLICY.time.dayMs,
            ),
          },
        });
      }
    });
  }

  /**
   * Creates a deterministic demo user for manual checkout fallback.
   */
  private async ensureDemoUser(userDelegate: UserDelegate, now: Date, email?: string) {
    const fallbackEmail = email ?? `demo-${now.getTime()}@example.com`;

    const existing = await userDelegate.findUnique({
      where: { email: fallbackEmail },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    try {
      return await userDelegate.create({
        data: {
          email: fallbackEmail,
          name: APP_POLICY.checkout.demoUserName,
        },
        select: {
          id: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const conflicted = await userDelegate.findUnique({
          where: { email: fallbackEmail },
          select: { id: true },
        });

        if (conflicted) {
          return conflicted;
        }
      }

      throw error;
    }
  }
}
