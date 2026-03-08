import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@/lib/errors";

const { createServerServicesMock } = vi.hoisted(() => ({
  createServerServicesMock: vi.fn(),
}));

vi.mock("@/server/services/service-factory", () => ({
  createServerServices: createServerServicesMock,
}));

import { POST } from "@/app/api/webhooks/payment/route";

describe("payment webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Returns webhook acknowledgement body when service succeeds.
   */
  it("returns parsed webhook response body", async () => {
    const handle = vi.fn(async () => ({
      received: true,
    }));

    createServerServicesMock.mockReturnValue({
      webhook: {
        handle,
      },
    });

    const request = new Request("http://localhost/api/webhooks/payment", {
      method: "POST",
      body: JSON.stringify({
        externalId: "ext-1",
        status: "PAID",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
    });
    expect(handle).toHaveBeenCalledWith(request);
  });

  /**
   * Returns normalized validation errors from webhook orchestration failures.
   */
  it("returns normalized error response when service rejects request", async () => {
    createServerServicesMock.mockReturnValue({
      webhook: {
        handle: vi.fn(async () => {
          throw new BadRequestError("invalid webhook");
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/payment", {
        method: "POST",
        body: "{}",
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid webhook",
      code: "BAD_REQUEST",
    });
  });
});
