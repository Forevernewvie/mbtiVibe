import type { Resend } from "resend";

import type {
  SupportEmailSender,
  SupportTicketAcknowledgementInput,
} from "@/server/types/contracts";

type ResendEmailClient = Pick<Resend, "emails">;

/**
 * Resend-backed acknowledgement sender for support ticket confirmations.
 */
export class ResendSupportEmailSender implements SupportEmailSender {
  constructor(
    private readonly emailClient: ResendEmailClient,
    private readonly fromEmail: string,
  ) {}

  /**
   * Sends a lightweight acknowledgement message for a newly created support ticket.
   */
  async sendAcknowledgement(input: SupportTicketAcknowledgementInput): Promise<void> {
    await this.emailClient.emails.send({
      from: this.fromEmail,
      to: input.recipientEmail,
      subject: "[VibeWeb] 문의가 접수되었습니다",
      html: `<p>문의가 접수되었습니다. 티켓 번호: <strong>${input.ticketId}</strong></p>`,
    });
  }
}
