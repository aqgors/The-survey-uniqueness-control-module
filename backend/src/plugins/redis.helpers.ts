import Redis from 'ioredis';
import { SurveyResults } from '../modules/surveys/survey.service';

// ── Cache key helpers ──────────────────────────────────────────────────────

const RESULTS_KEY   = (surveyId: string) => `survey:results:${surveyId}`;
const RESULTS_TTL   = 30;   // seconds — results cache lifetime

// ── Results cache ──────────────────────────────────────────────────────────

/**
 * Try to read cached survey results.
 * Returns null if cache is missing, expired, or Redis is unavailable.
 */
export async function getCachedResults(
  redis: Redis,
  surveyId: string
): Promise<SurveyResults | null> {
  try {
    const raw = await redis.get(RESULTS_KEY(surveyId));
    if (!raw) return null;
    return JSON.parse(raw) as SurveyResults;
  } catch {
    return null;   // Redis down → fall through to DB
  }
}

/**
 * Write survey results to cache with TTL.
 * Silently ignores errors so Redis issues never break the vote flow.
 */
export async function setCachedResults(
  redis: Redis,
  surveyId: string,
  results: SurveyResults
): Promise<void> {
  try {
    await redis.set(RESULTS_KEY(surveyId), JSON.stringify(results), 'EX', RESULTS_TTL);
  } catch {
    // ignore
  }
}

/**
 * Invalidate cached results for a survey (call after a vote is recorded).
 */
export async function invalidateResultsCache(
  redis: Redis,
  surveyId: string
): Promise<void> {
  try {
    await redis.del(RESULTS_KEY(surveyId));
  } catch {
    // ignore
  }
}

// ── Rate limiting helpers ──────────────────────────────────────────────────

const RATE_KEY    = (ip: string) => `rate:vote:${ip}`;
const RATE_LIMIT  = Number(process.env.RATE_LIMIT_VOTES)    || 5;    // max requests
const RATE_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_S) || 60;   // window in seconds

/**
 * Sliding-window rate limiter using Redis INCR + EXPIRE.
 *
 * Returns:
 *   { allowed: true,  count, remaining, resetIn }  — request is allowed
 *   { allowed: false, count, remaining: 0, resetIn } — limit exceeded
 */
export async function checkRateLimit(
  redis: Redis,
  ip: string
): Promise<{ allowed: boolean; count: number; remaining: number; resetIn: number }> {
  const key = RATE_KEY(ip);

  try {
    // Atomic increment
    const count = await redis.incr(key);

    // Set TTL only on the first request in the window
    if (count === 1) {
      await redis.expire(key, RATE_WINDOW);
    }

    const ttl       = await redis.ttl(key);
    const resetIn   = ttl > 0 ? ttl : RATE_WINDOW;
    const remaining = Math.max(0, RATE_LIMIT - count);
    const allowed   = count <= RATE_LIMIT;

    return { allowed, count, remaining, resetIn };
  } catch {
    // Redis unavailable → fail open (allow request)
    return { allowed: true, count: 0, remaining: RATE_LIMIT, resetIn: RATE_WINDOW };
  }
}
