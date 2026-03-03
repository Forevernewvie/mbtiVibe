/**
 * Normalized tracking payload contract.
 */
export type TrackEventInput = {
  name: string;
  sessionToken?: string;
  userId?: string;
  properties?: Record<string, unknown>;
};

/**
 * Analytics dependency contract.
 */
export interface EventTracker {
  track(input: TrackEventInput): Promise<void>;
}
