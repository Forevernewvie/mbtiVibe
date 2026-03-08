import { type PrismaClient } from "@prisma/client";

import type { Logger } from "@/lib/logger";
import type { SupportEmailSender } from "@/server/types/contracts";

type SupportServiceDependencies = {
  prismaClient: SupportTicketPersistence;
  logger: Logger;
  emailSender?: SupportEmailSender | null;
};

type SupportTicketPersistence = {
  supportTicket: Pick<PrismaClient["supportTicket"], "create">;
};

export type CreateSupportTicketInput = {
  email: string;
  subject: string;
  message: string;
};

/**
 * Handles support ticket creation and optional acknowledgment emails.
 */
export class SupportService {
  private readonly prismaClient: SupportTicketPersistence;
  private readonly logger: Logger;
  private readonly emailSender: SupportEmailSender | null;

  constructor(dependencies: SupportServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.logger = dependencies.logger;
    this.emailSender = dependencies.emailSender ?? null;
  }

  /**
   * Creates ticket and sends confirmation email when mail provider is configured.
   */
  async createTicket(input: CreateSupportTicketInput) {
    const ticket = await this.prismaClient.supportTicket.create({
      data: {
        email: input.email,
        subject: input.subject,
        message: input.message,
      },
    });

    await this.sendAcknowledgementSafely(ticket.id, input.email);

    return {
      ok: true,
      ticketId: ticket.id,
    };
  }

  /**
   * Sends acknowledgement email without blocking ticket creation on provider failures.
   */
  private async sendAcknowledgementSafely(ticketId: string, recipientEmail: string): Promise<void> {
    if (!this.emailSender) {
      return;
    }

    try {
      await this.emailSender.sendAcknowledgement({
        recipientEmail,
        ticketId,
      });
    } catch (error) {
      this.logger.error("Support acknowledgement email failed", {
        ticketId,
        recipientEmail,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
