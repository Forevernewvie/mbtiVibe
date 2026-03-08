import { Buffer } from "node:buffer";

import { toErrorResponse } from "@/lib/errors";
import { createServerServices } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Returns paid PDF report as downloadable attachment.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const services = createServerServices();
    const { id } = await context.params;
    const url = new URL(request.url);
    const forceDemoPaid = url.searchParams.get("demoPaid") === "1";

    const result = await services.report.buildDownloadableReport(id, forceDemoPaid);

    return new NextResponse(Buffer.from(result.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error, { route: "report/[id]" });
  }
}
