import { APP_POLICY } from "@/config/app-policy";
import type {
  SupportAcknowledgementMessage,
  SupportAcknowledgementTemplateBuilder,
  SupportTicketAcknowledgementInput,
} from "@/server/types/contracts";

/**
 * Builds static acknowledgement email content from centralized support policy.
 */
export class StaticSupportAcknowledgementTemplateBuilder
  implements SupportAcknowledgementTemplateBuilder
{
  /**
   * Returns subject and HTML body for a support ticket acknowledgement email.
   */
  build(input: SupportTicketAcknowledgementInput): SupportAcknowledgementMessage {
    return {
      subject: APP_POLICY.support.acknowledgementSubject,
      html: `<p>${APP_POLICY.support.acknowledgementMessage}: <strong>${input.ticketId}</strong></p>`,
    };
  }
}
