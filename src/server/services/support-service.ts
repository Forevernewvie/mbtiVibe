import { PrismaClient } from "@prisma/client";
import { Resend } from "resend";

import { env } from "@/lib/env";

type SupportServiceDependencies = {
  prismaClient: PrismaClient;
  emailClient?: Resend | null;
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
  private readonly prismaClient: PrismaClient;
  private readonly emailClient: Resend | null;

  constructor(dependencies: SupportServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.emailClient = dependencies.emailClient ?? (env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null);
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

    if (this.emailClient && env.RESEND_FROM_EMAIL) {
      await this.emailClient.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: input.email,
        subject: "[VibeWeb] 문의가 접수되었습니다",
        html: `<p>문의가 접수되었습니다. 티켓 번호: <strong>${ticket.id}</strong></p>`,
      });
    }

    return {
      ok: true,
      ticketId: ticket.id,
    };
  }
}
