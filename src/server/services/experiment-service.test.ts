import { type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/errors";
import { ExperimentService } from "@/server/services/experiment-service";
import type { AdminAccessPolicy } from "@/server/types/contracts";

type PrismaClientMock = {
  experiment: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

/**
 * Builds experiment service with isolated persistence and admin policy doubles.
 */
function buildServiceContext() {
  const prismaClient: PrismaClientMock = {
    experiment: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };

  const adminAccessPolicy: AdminAccessPolicy = {
    assertAuthorized: vi.fn(),
  };

  const service = new ExperimentService({
    prismaClient: prismaClient as unknown as PrismaClient,
    adminAccessPolicy,
  });

  return {
    service,
    prismaClient,
    adminAccessPolicy,
  };
}

describe("ExperimentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Enforces admin authorization before mutating experiment state.
   */
  it("throws when admin policy rejects the request", async () => {
    const { service, adminAccessPolicy } = buildServiceContext();

    vi.mocked(adminAccessPolicy.assertAuthorized).mockImplementation(() => {
      throw new UnauthorizedError("Unauthorized");
    });

    await expect(
      service.upsert({
        key: "pricing_hero",
        name: "Pricing hero",
        variants: ["A", "B"],
        isActive: true,
        adminToken: "invalid",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  /**
   * Delegates authorized upsert requests to persistence with stable payload mapping.
   */
  it("upserts experiment when admin policy accepts", async () => {
    const { service, prismaClient, adminAccessPolicy } = buildServiceContext();

    prismaClient.experiment.upsert.mockResolvedValue({ id: "exp-1", key: "pricing_hero" });

    const result = await service.upsert({
      key: "pricing_hero",
      name: "Pricing hero",
      description: "Hero section price order",
      variants: ["A", "B"],
      isActive: true,
      adminToken: "valid-token",
    });

    expect(adminAccessPolicy.assertAuthorized).toHaveBeenCalledWith("valid-token");
    expect(prismaClient.experiment.upsert).toHaveBeenCalledWith({
      where: { key: "pricing_hero" },
      create: {
        key: "pricing_hero",
        name: "Pricing hero",
        description: "Hero section price order",
        variants: ["A", "B"],
        isActive: true,
      },
      update: {
        name: "Pricing hero",
        description: "Hero section price order",
        variants: ["A", "B"],
        isActive: true,
      },
    });
    expect(result).toEqual({ id: "exp-1", key: "pricing_hero" });
  });
});
