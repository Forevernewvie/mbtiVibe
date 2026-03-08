import { toErrorResponse } from "@/lib/errors";
import { createServerServices } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Returns rolling conversion-funnel metrics for admin users.
 */
export async function GET(request: Request) {
  try {
    const services = createServerServices();
    const url = new URL(request.url);
    const daysParam = url.searchParams.get("days");
    const parsedDays = daysParam === null ? undefined : Number(daysParam);
    const result = await services.metrics.getFunnelMetrics(
      parsedDays,
      request.headers.get("x-admin-token"),
    );

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, { route: "admin/metrics/funnel#get" });
  }
}
