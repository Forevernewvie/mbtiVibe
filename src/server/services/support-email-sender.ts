import type { Resend } from "resend";

import type {
  SupportEmailSender,
  SupportAcknowledgementTemplateBuilder,
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
    private readonly templateBuilder: SupportAcknowledgementTemplateBuilder,
  ) {}

  /**
   * Sends a lightweight acknowledgement message for a newly created support ticket.
   */
  async sendAcknowledgement(input: SupportTicketAcknowledgementInput): Promise<void> {
    const message = this.templateBuilder.build(input);

    await this.emailClient.emails.send({
      from: this.fromEmail,
      to: input.recipientEmail,
      subject: message.subject,
      html: message.html,
    });
  }
}
