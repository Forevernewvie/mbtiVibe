import { APP_POLICY } from "@/config/app-policy";
import { enforceRateLimit, parseJsonBody, validateSchema } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { getRequestIp } from "@/lib/request";
import { assessmentCompleteSchema } from "@/lib/schemas";
import { services } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Finalizes assessment and materializes snapshot/action-plan outputs.
 */
export async function POST(request: Request) {
  try {
    const ip = await getRequestIp();

    enforceRateLimit(
      `assessment:complete:${ip}`,
      APP_POLICY.rateLimit.assessmentComplete.limit,
      APP_POLICY.rateLimit.assessmentComplete.windowMs,
    );

    const payload = await parseJsonBody(request, {});
    const input = validateSchema(assessmentCompleteSchema, payload);
    const result = await services.assessment.completeAssessment(input);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, { route: "assessment/complete" });
  }
}
