import { toErrorResponse } from "@/lib/errors";
import { services } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Entry point for payment provider webhooks.
 */
export async function POST(request: Request) {
  try {
    const result = await services.webhook.handle(request);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, { route: "webhooks/payment" });
  }
}
