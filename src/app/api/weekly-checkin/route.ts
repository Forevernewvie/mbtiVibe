import { APP_POLICY } from "@/config/app-policy";
import { enforceRateLimit, parseJsonBody, validateSchema } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { getRequestIp } from "@/lib/request";
import { weeklyCheckinSchema } from "@/lib/schemas";
import { services } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Records weekly check-in and returns action-plan completion rate.
 */
export async function POST(request: Request) {
  try {
    const ip = await getRequestIp();

    enforceRateLimit(
      `weekly-checkin:${ip}`,
      APP_POLICY.rateLimit.weeklyCheckin.limit,
      APP_POLICY.rateLimit.weeklyCheckin.windowMs,
    );

    const payload = await parseJsonBody(request, {});
    const input = validateSchema(weeklyCheckinSchema, payload);
    const result = await services.assessment.submitWeeklyCheckin(input);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, { route: "weekly-checkin" });
  }
}
