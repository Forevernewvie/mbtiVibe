import { type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupportService } from "@/server/services/support-service";
import type { SupportEmailSender } from "@/server/types/contracts";

type PrismaClientMock = {
  supportTicket: {
    create: ReturnType<typeof vi.fn>;
  };
};

/**
 * Builds isolated support-service dependencies for ticket and email workflows.
 */
function buildServiceContext(emailSender?: SupportEmailSender | null) {
  const prismaClient: PrismaClientMock = {
    supportTicket: {
      create: vi.fn(),
    },
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const service = new SupportService({
    prismaClient: prismaClient as unknown as PrismaClient,
    logger,
    emailSender,
  });

  return {
    service,
    prismaClient,
    logger,
  };
}

describe("SupportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Persists support tickets even when email acknowledgements are disabled.
   */
  it("creates ticket without acknowledgement sender", async () => {
    const { service, prismaClient, logger } = buildServiceContext(null);

    prismaClient.supportTicket.create.mockResolvedValue({ id: "ticket-1" });

    const result = await service.createTicket({
      email: "user@example.com",
      subject: "Need help",
      message: "Please contact me",
    });

    expect(result).toEqual({
      ok: true,
      ticketId: "ticket-1",
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  /**
   * Sends acknowledgement email after ticket creation when sender is configured.
   */
  it("sends acknowledgement with created ticket id", async () => {
    const emailSender: SupportEmailSender = {
      sendAcknowledgement: vi.fn(async () => undefined),
    };
    const { service, prismaClient } = buildServiceContext(emailSender);

    prismaClient.supportTicket.create.mockResolvedValue({ id: "ticket-2" });

    await service.createTicket({
      email: "user@example.com",
      subject: "Support request",
      message: "Need billing help",
    });

    expect(emailSender.sendAcknowledgement).toHaveBeenCalledWith({
      recipientEmail: "user@example.com",
      ticketId: "ticket-2",
    });
  });

  /**
   * Logs acknowledgement delivery failures while preserving successful ticket creation.
   */
  it("logs email failure without failing ticket creation", async () => {
    const emailSender: SupportEmailSender = {
      sendAcknowledgement: vi.fn(async () => {
        throw new Error("email provider down");
      }),
    };
    const { service, prismaClient, logger } = buildServiceContext(emailSender);

    prismaClient.supportTicket.create.mockResolvedValue({ id: "ticket-3" });

    const result = await service.createTicket({
      email: "user@example.com",
      subject: "Email failure",
      message: "Still store ticket",
    });

    expect(result.ticketId).toBe("ticket-3");
    expect(logger.error).toHaveBeenCalledWith(
      "Support acknowledgement email failed",
      expect.objectContaining({
        ticketId: "ticket-3",
        recipientEmail: "user@example.com",
      }),
    );
  });
});
