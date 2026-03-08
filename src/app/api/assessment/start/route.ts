import { APP_POLICY } from "@/config/app-policy";
import { parseJsonBody, validateSchema, enforceRateLimit } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { getRequestIp } from "@/lib/request";
import { assessmentStartSchema } from "@/lib/schemas";
import { createServerServices } from "@/server/services/service-factory";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Starts or resumes assessment session and returns question set.
 */
export async function POST(request: Request) {
  try {
    const services = createServerServices();
    const ip = await getRequestIp();

    enforceRateLimit(
      `assessment:start:${ip}`,
      APP_POLICY.rateLimit.assessmentStart.limit,
      APP_POLICY.rateLimit.assessmentStart.windowMs,
    );

    const payload = await parseJsonBody(request, {});
    const input = validateSchema(assessmentStartSchema, payload);

    const cookieStore = await cookies();
    const sessionToken = input.sessionToken ?? cookieStore.get(APP_POLICY.session.cookieName)?.value;
    const locale = (await headers()).get("accept-language")?.split(",")?.[0] ?? APP_POLICY.locale.fallback;

    const result = await services.assessment.startAssessment({
      sessionToken,
      locale,
    });

    const response = NextResponse.json(result);

    response.cookies.set(APP_POLICY.session.cookieName, result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: APP_POLICY.session.cookieMaxAgeSeconds,
    });

    return response;
  } catch (error) {
    return toErrorResponse(error, { route: "assessment/start" });
  }
}
