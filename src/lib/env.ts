import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().url().default("http://localhost:3000"),
    PAYMENT_PROVIDER: z.enum(["manual", "stripe", "toss", "portone"]).default("manual"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    TOSS_SECRET_KEY: z.string().optional(),
    TOSS_TEST_CHECKOUT_URL: z.string().url().optional(),
    PORTONE_API_SECRET: z.string().optional(),
    PORTONE_TEST_CHECKOUT_URL: z.string().url().optional(),
    POSTHOG_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().url().optional(),
    ADMIN_API_TOKEN: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
  })
  .superRefine((input, ctx) => {
    /**
     * Ensures provider-specific runtime secrets are present before boot.
     */
    const requireField = (field: keyof typeof input, message: string) => {
      if (!input[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message,
        });
      }
    };

    if (input.PAYMENT_PROVIDER === "stripe") {
      requireField("STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY is required for stripe");
      requireField("STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET is required for stripe");
    }

    if (input.PAYMENT_PROVIDER === "toss") {
      requireField("TOSS_TEST_CHECKOUT_URL", "TOSS_TEST_CHECKOUT_URL is required for toss");
    }

    if (input.PAYMENT_PROVIDER === "portone") {
      requireField("PORTONE_TEST_CHECKOUT_URL", "PORTONE_TEST_CHECKOUT_URL is required for portone");
    }
  });

/**
 * Parses and validates server environment variables.
 */
function parseServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid server env: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }

  return parsed.data;
}

/**
 * Typed and validated environment variables.
 */
export const env = parseServerEnv();
