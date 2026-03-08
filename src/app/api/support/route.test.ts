import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@/lib/errors";

const { createServerServicesMock } = vi.hoisted(() => ({
  createServerServicesMock: vi.fn(),
}));

vi.mock("@/server/services/service-factory", () => ({
  createServerServices: createServerServicesMock,
}));

import { POST } from "@/app/api/support/route";

describe("support route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Returns created support ticket payload when service call succeeds.
   */
  it("creates support ticket successfully", async () => {
    const createTicket = vi.fn(async () => ({
      ok: true,
      ticketId: "ticket-123",
    }));

    createServerServicesMock.mockReturnValue({
      support: {
        createTicket,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/support", {
        method: "POST",
        body: JSON.stringify({
          email: "user@example.com",
          subject: "Need help",
          message: "Please reply",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ticketId: "ticket-123",
    });
    expect(createTicket).toHaveBeenCalledWith({
      email: "user@example.com",
      subject: "Need help",
      message: "Please reply",
    });
  });

  /**
   * Converts service-layer validation errors into stable JSON error responses.
   */
  it("returns normalized error response on service failure", async () => {
    createServerServicesMock.mockReturnValue({
      support: {
        createTicket: vi.fn(async () => {
          throw new BadRequestError("invalid");
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/support", {
        method: "POST",
        body: JSON.stringify({
          email: "user@example.com",
          subject: "Need help",
          message: "Please reply",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid",
      code: "BAD_REQUEST",
    });
  });
});
