import { headers } from "next/headers";

/**
 * Resolves best-effort client IP from reverse proxy headers.
 */
export async function getRequestIp() {
  const headerStore = await headers();

  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return headerStore.get("x-real-ip") ?? "unknown";
}
