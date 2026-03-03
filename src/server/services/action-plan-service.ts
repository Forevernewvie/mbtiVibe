import { PrismaClient } from "@prisma/client";

import { NotFoundError } from "@/lib/errors";

type ActionPlanServiceDependencies = {
  prismaClient: PrismaClient;
  now?: () => Date;
};

/**
 * Handles action-plan state transitions.
 */
export class ActionPlanService {
  private readonly prismaClient: PrismaClient;
  private readonly now: () => Date;

  constructor(dependencies: ActionPlanServiceDependencies) {
    this.prismaClient = dependencies.prismaClient;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * Marks action-plan item completion status.
   */
  async toggle(planId: string, completed: boolean) {
    try {
      const updated = await this.prismaClient.actionPlan.update({
        where: { id: planId },
        data: {
          completed,
          completedAt: completed ? this.now() : null,
        },
      });

      return {
        id: updated.id,
        completed: updated.completed,
      };
    } catch {
      throw new NotFoundError("액션플랜 항목을 찾을 수 없습니다.", {
        planId,
      });
    }
  }
}
