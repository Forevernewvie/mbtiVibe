import { parseJsonBody, validateSchema } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { actionPlanToggleSchema } from "@/lib/schemas";
import { services } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Toggles action-plan completion state.
 */
export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, {});
    const input = validateSchema(actionPlanToggleSchema, payload);
    const plan = await services.actionPlan.toggle(input.planId, input.completed);

    return NextResponse.json({ plan });
  } catch (error) {
    return toErrorResponse(error, { route: "action-plan/toggle" });
  }
}
