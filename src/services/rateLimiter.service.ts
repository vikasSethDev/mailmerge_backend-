import { ICampaignRateLimits } from '../models/Campaign.model';

export interface RateCheckResult {
  allowed: boolean;
  retryAfterMs: number;
  reason?: 'minute' | 'hour' | 'day';
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Enforces configurable per-campaign send limits (per minute / hour / day)
 * entirely in-process, using plain in-memory counters with expiring windows.
 *
 * This throttles OUR OWN outbound send rate; it never attempts to bypass or
 * evade a mail provider's own rate limits.
 *
 * Trade-off vs. a Redis-backed limiter: state lives only in this Node
 * process's memory. That's perfectly fine for a single backend instance
 * (the common case for this module), but if you ever run multiple API
 * instances behind a load balancer AND let more than one of them run
 * campaign sending, each instance would track its own counters instead of
 * sharing a global one. For a single-instance deployment (or if only one
 * instance is responsible for running campaigns) this is not an issue.
 */
class InMemoryCampaignRateLimiter {
  private windows = new Map<string, WindowState>();

  private key(campaignId: string, window: 'minute' | 'hour' | 'day'): string {
    return `${campaignId}:${window}`;
  }

  private getWindow(key: string, ttlMs: number): WindowState {
    const now = Date.now();
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh: WindowState = { count: 0, resetAt: now + ttlMs };
      this.windows.set(key, fresh);
      return fresh;
    }
    return existing;
  }

  checkAndConsume(campaignId: string, limits: ICampaignRateLimits): RateCheckResult {
    const now = Date.now();
    const windows: { name: 'minute' | 'hour' | 'day'; limit: number; ttlMs: number }[] = [
      { name: 'minute', limit: limits.perMinute, ttlMs: MINUTE_MS },
      { name: 'hour', limit: limits.perHour, ttlMs: HOUR_MS },
      { name: 'day', limit: limits.perDay, ttlMs: DAY_MS },
    ];

    for (const w of windows) {
      const key = this.key(campaignId, w.name);
      const state = this.getWindow(key, w.ttlMs);
      if (state.count >= w.limit) {
        return { allowed: false, retryAfterMs: Math.max(state.resetAt - now, 1000), reason: w.name };
      }
    }

    for (const w of windows) {
      const key = this.key(campaignId, w.name);
      const state = this.getWindow(key, w.ttlMs);
      state.count += 1;
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  resetForCampaign(campaignId: string): void {
    (['minute', 'hour', 'day'] as const).forEach((w) => this.windows.delete(this.key(campaignId, w)));
  }
}

export const campaignRateLimiter = new InMemoryCampaignRateLimiter();
