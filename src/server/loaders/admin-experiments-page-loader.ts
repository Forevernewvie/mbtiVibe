import { APP_POLICY } from "@/config/app-policy";
import type { FunnelMetricsOutput } from "@/server/services/metrics-service";

export type ExperimentSummary = {
  id: string;
  key: string;
  name: string;
  variants: string[];
  isActive: boolean;
};

export type FunnelDashboardState = {
  metrics: FunnelMetricsOutput | null;
  errorMessage: string | null;
};

export type AdminExperimentsPageData = {
  experiments: ExperimentSummary[];
  funnelDashboard: FunnelDashboardState;
  windowDays: number;
};

type AdminExperimentsPageServices = {
  experiment: {
    list(): Promise<ExperimentSummary[]>;
  };
  metrics: {
    getFunnelMetrics(
      windowDays: number | undefined,
      adminToken?: string | null,
    ): Promise<FunnelMetricsOutput>;
  };
};

type AdminExperimentsPageLoaderDependencies = {
  services?: AdminExperimentsPageServices;
  adminToken?: string | null;
  windowDays?: number;
};

/**
 * Loads experiment-admin page data from services and runtime configuration.
 */
export async function loadAdminExperimentsPageData(
  dependencies: AdminExperimentsPageLoaderDependencies = {},
): Promise<AdminExperimentsPageData> {
  const services = dependencies.services ?? (await createDefaultServices());
  const windowDays = dependencies.windowDays ?? APP_POLICY.analytics.funnelDefaultWindowDays;
  const adminToken = await resolveAdminToken(dependencies.adminToken);
  const experiments = await services.experiment.list();
  const funnelDashboard = await loadFunnelDashboardState({
    services,
    adminToken,
    windowDays,
  });

  return {
    experiments,
    funnelDashboard,
    windowDays,
  };
}

/**
 * Lazily imports the composition root to keep page loader tests infrastructure-free.
 */
async function createDefaultServices(): Promise<AdminExperimentsPageServices> {
  const { createServerServices } = await import("@/server/services/service-factory");
  return createServerServices();
}

/**
 * Resolves admin token lazily to avoid loading runtime env during isolated tests.
 */
async function resolveAdminToken(adminToken?: string | null): Promise<string | null> {
  if (adminToken !== undefined) {
    return adminToken;
  }

  const { getServerRuntimeConfig } = await import("@/server/services/server-runtime-env");
  return getServerRuntimeConfig().adminApiToken ?? null;
}

/**
 * Loads funnel metrics while preserving admin page availability on runtime failures.
 */
async function loadFunnelDashboardState(input: {
  services: Pick<AdminExperimentsPageServices, "metrics">;
  adminToken?: string | null;
  windowDays: number;
}): Promise<FunnelDashboardState> {
  if (!input.adminToken) {
    return {
      metrics: null,
      errorMessage: "ADMIN_API_TOKEN 미설정으로 퍼널 지표를 불러올 수 없습니다.",
    };
  }

  try {
    const metrics = await input.services.metrics.getFunnelMetrics(
      input.windowDays,
      input.adminToken,
    );

    return {
      metrics,
      errorMessage: null,
    };
  } catch {
    return {
      metrics: null,
      errorMessage: "퍼널 지표 조회 중 오류가 발생했습니다.",
    };
  }
}
