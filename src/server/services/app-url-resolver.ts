import { env } from "@/lib/env";
import type { AppUrlResolver } from "@/server/types/contracts";

/**
 * Environment-backed application URL resolver for runtime redirects.
 */
export class EnvAppUrlResolver implements AppUrlResolver {
  /**
   * Returns normalized application base URL from validated environment config.
   */
  getAppUrl(): string {
    return env.APP_URL;
  }
}
