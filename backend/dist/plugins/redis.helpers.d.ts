import Redis from 'ioredis';
import { SurveyResults } from '../modules/surveys/survey.service';
/**
 * Try to read cached survey results.
 * Returns null if cache is missing, expired, or Redis is unavailable.
 */
export declare function getCachedResults(redis: Redis, surveyId: string): Promise<SurveyResults | null>;
/**
 * Write survey results to cache with TTL.
 * Silently ignores errors so Redis issues never break the vote flow.
 */
export declare function setCachedResults(redis: Redis, surveyId: string, results: SurveyResults): Promise<void>;
/**
 * Invalidate cached results for a survey (call after a vote is recorded).
 */
export declare function invalidateResultsCache(redis: Redis, surveyId: string): Promise<void>;
/**
 * Sliding-window rate limiter using Redis INCR + EXPIRE.
 *
 * Returns:
 *   { allowed: true,  count, remaining, resetIn }  — request is allowed
 *   { allowed: false, count, remaining: 0, resetIn } — limit exceeded
 */
export declare function checkRateLimit(redis: Redis, ip: string): Promise<{
    allowed: boolean;
    count: number;
    remaining: number;
    resetIn: number;
}>;
//# sourceMappingURL=redis.helpers.d.ts.map