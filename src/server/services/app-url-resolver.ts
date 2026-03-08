import type { AppUrlResolver } from "@/server/types/contracts";

/**
 * Static application URL resolver for runtime redirects.
 */
export class StaticAppUrlResolver implements AppUrlResolver {
  constructor(private readonly appUrl: string) {}

  /**
   * Returns normalized application base URL from runtime configuration.
   */
  getAppUrl(): string {
    return this.appUrl;
  }
}
