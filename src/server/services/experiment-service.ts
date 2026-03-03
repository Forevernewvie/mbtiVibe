import { PrismaClient } from "@prisma/client";

import { UnauthorizedError } from "@/lib/errors";
import { env } from "@/lib/env";

type ExperimentServiceDependencies = {
  prismaClient: PrismaClient;
};

export type UpsertExperimentInput = {
  key: string;
  name: string;
  description?: string;
  variants: string[];
  isActive: boolean;
  adminToken?: string | null;
};

/**
 * Manages A/B experiment definitions.
 */
export class ExperimentService {
  private readonly prismaClient: PrismaClient;

  constructor(dependencies: ExperimentServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
  }

  /**
   * Returns current experiments ordered by recent update.
   */
  async list() {
    return this.prismaClient.experiment.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  /**
   * Upserts experiment after validating admin authentication token.
   */
  async upsert(input: UpsertExperimentInput) {
    if (!env.ADMIN_API_TOKEN || input.adminToken !== env.ADMIN_API_TOKEN) {
      throw new UnauthorizedError("Unauthorized");
    }

    return this.prismaClient.experiment.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        name: input.name,
        description: input.description,
        variants: input.variants,
        isActive: input.isActive,
      },
      update: {
        name: input.name,
        description: input.description,
        variants: input.variants,
        isActive: input.isActive,
      },
    });
  }
}
