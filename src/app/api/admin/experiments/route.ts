import { parseJsonBody, validateSchema } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { experimentSchema } from "@/lib/schemas";
import { createServerServices } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Lists configured experiments.
 */
export async function GET() {
  try {
    const services = createServerServices();
    const experiments = await services.experiment.list();
    return NextResponse.json({ experiments });
  } catch (error) {
    return toErrorResponse(error, { route: "admin/experiments#get" });
  }
}

/**
 * Creates or updates experiment configuration.
 */
export async function POST(request: Request) {
  try {
    const jsonBody = await parseJsonBody(request, {});
    const payload = validateSchema(experimentSchema, jsonBody);
    const services = createServerServices();

    const experiment = await services.experiment.upsert({
      ...payload,
      adminToken: request.headers.get("x-admin-token"),
    });

    return NextResponse.json({ experiment });
  } catch (error) {
    return toErrorResponse(error, { route: "admin/experiments#post" });
  }
}
