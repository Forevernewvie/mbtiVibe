import { UnauthorizedError } from "@/lib/errors";
import type { AdminAccessPolicy } from "@/server/types/contracts";

/**
 * Static admin-token policy used to authorize privileged operations.
 */
export class StaticAdminAccessPolicy implements AdminAccessPolicy {
  constructor(private readonly expectedToken?: string | null) {}

  /**
   * Validates incoming admin token against configured server-side token.
   */
  assertAuthorized(adminToken?: string | null): void {
    if (!this.expectedToken || adminToken !== this.expectedToken) {
      throw new UnauthorizedError("Unauthorized");
    }
  }
}
