import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import type { DatabaseRuntimeConfig } from "@/server/services/server-runtime-config";
import { getServerRuntimeConfig } from "@/server/services/server-runtime-env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const runtimeConfig = getServerRuntimeConfig();

/**
 * Creates Prisma client with PostgreSQL driver adapter.
 */
function createPrismaClient(configuration: DatabaseRuntimeConfig) {
  const adapter = new PrismaPg({ connectionString: configuration.connectionString });

  return new PrismaClient({
    adapter,
    log: configuration.logLevels,
  });
}

/**
 * Shared Prisma client instance reused across HMR cycles.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient(runtimeConfig.database);

if (runtimeConfig.database.reuseGlobalClient) {
  globalForPrisma.prisma = prisma;
}
