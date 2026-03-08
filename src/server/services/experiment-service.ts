import { type PrismaClient } from "@prisma/client";

import type { AdminAccessPolicy } from "@/server/types/contracts";

type ExperimentServiceDependencies = {
  prismaClient: ExperimentPersistence;
  adminAccessPolicy: AdminAccessPolicy;
};

type ExperimentPersistence = {
  experiment: Pick<PrismaClient["experiment"], "findMany" | "upsert">;
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
  private readonly prismaClient: ExperimentPersistence;
  private readonly adminAccessPolicy: AdminAccessPolicy;

  constructor(dependencies: ExperimentServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.adminAccessPolicy = dependencies.adminAccessPolicy;
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
    this.adminAccessPolicy.assertAuthorized(input.adminToken);

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
