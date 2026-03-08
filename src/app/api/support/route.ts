import { parseJsonBody, validateSchema } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { supportTicketSchema } from "@/lib/schemas";
import { createServerServices } from "@/server/services/service-factory";
import { NextResponse } from "next/server";

/**
 * Creates customer support ticket and sends optional confirmation email.
 */
export async function POST(request: Request) {
  try {
    const services = createServerServices();
    const payload = await parseJsonBody(request, {});
    const input = validateSchema(supportTicketSchema, payload);
    const result = await services.support.createTicket(input);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, { route: "support" });
  }
}
