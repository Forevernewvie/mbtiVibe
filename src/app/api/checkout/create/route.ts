import { APP_POLICY } from "@/config/app-policy";
import { enforceRateLimit, parseJsonBody, validateSchema } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { getRequestIp } from "@/lib/request";
import { checkoutSchema } from "@/lib/schemas";
import { createServerServices } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Creates payment checkout session for selected price code.
 */
export async function POST(request: Request) {
  try {
    const services = createServerServices();
    const ip = await getRequestIp();

    enforceRateLimit(
      `checkout:create:${ip}`,
      APP_POLICY.rateLimit.checkoutCreate.limit,
      APP_POLICY.rateLimit.checkoutCreate.windowMs,
    );

    const payload = await parseJsonBody(request, {});
    const input = validateSchema(checkoutSchema, payload);
    const result = await services.checkout.createCheckout(input);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, { route: "checkout/create" });
  }
}
