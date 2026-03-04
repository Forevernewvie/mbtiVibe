import { APP_POLICY } from "@/config/app-policy";
import { enforceRateLimit, parseJsonBody, validateSchema } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { getRequestIp } from "@/lib/request";
import { assessmentAnswerSchema } from "@/lib/schemas";
import { services } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Saves one answer and returns updated assessment progress.
 */
export async function POST(request: Request) {
  try {
    const ip = await getRequestIp();

    enforceRateLimit(
      `assessment:answer:${ip}`,
      APP_POLICY.rateLimit.assessmentAnswer.limit,
      APP_POLICY.rateLimit.assessmentAnswer.windowMs,
    );

    const payload = await parseJsonBody(request, {});
    const input = validateSchema(assessmentAnswerSchema, payload);
    const result = await services.assessment.answerAssessment(input);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, { route: "assessment/answer" });
  }
}
