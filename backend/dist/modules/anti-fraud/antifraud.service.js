"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AntiFraudService = void 0;
const crypto_1 = require("crypto");
// ── Service ────────────────────────────────────────────────────────────────
class AntiFraudService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    /** SHA-256 hash of a string (for safe IP storage) */
    hashIp(rawIp) {
        return (0, crypto_1.createHash)('sha256').update(rawIp.trim()).digest('hex');
    }
    /** Truncate User-Agent to 512 chars to match DB column */
    normaliseUserAgent(ua) {
        return ua.trim().slice(0, 512);
    }
    // ── Core uniqueness check ─────────────────────────────────────────────────
    /**
     * Checks VoteMeta for duplicate identity signals before accepting a vote.
     *
     * Uses the composite DB indexes directly:
     *   @@unique([surveyId, ip])       → "unique_survey_ip"
     *   @@unique([surveyId, cookieId]) → "unique_survey_cookie"
     *   @@index([surveyId, userAgent]) → "index_votemeta_ua_survey"
     *
     * Priority: cookieId (most reliable) → IP → User-Agent
     */
    async checkUniqueness(surveyId, identity) {
        const hashedIp = this.hashIp(identity.ip);
        const ua = this.normaliseUserAgent(identity.userAgent);
        // ── 1. Cookie check (strongest signal) ───────────────────────────────
        const byCookie = await this.prisma.voteMeta.findFirst({
            where: { surveyId, cookieId: identity.cookieId },
            select: { id: true },
        });
        if (byCookie) {
            return {
                isUnique: false,
                signal: 'cookieId',
                message: 'Ви вже голосували в цьому опитуванні (cookie).',
            };
        }
        // ── 2. IP check ───────────────────────────────────────────────────────
        const byIp = await this.prisma.voteMeta.findFirst({
            where: { surveyId, ip: hashedIp },
            select: { id: true },
        });
        if (byIp) {
            return {
                isUnique: false,
                signal: 'ip',
                message: 'Ви вже голосували в цьому опитуванні (IP-адреса).',
            };
        }
        // ── 3. User-Agent check (weakest — supplementary signal) ──────────────
        const byUA = await this.prisma.voteMeta.findFirst({
            where: { surveyId, userAgent: ua },
            select: { id: true },
        });
        if (byUA) {
            return {
                isUnique: false,
                signal: 'userAgent',
                message: 'Ви вже голосували в цьому опитуванні (браузер).',
            };
        }
        return { isUnique: true, signal: null, message: 'OK' };
    }
    // ── Record VoteMeta ───────────────────────────────────────────────────────
    /**
     * Creates a VoteMeta record linking the vote to all three identity signals.
     * Must be called inside the same DB transaction as Vote creation.
     *
     * @param tx - Prisma transaction client (pass `tx` from $transaction callback)
     */
    async recordVoteMeta(voteId, surveyId, identity, tx) {
        await tx.voteMeta.create({
            data: {
                voteId,
                surveyId,
                ip: this.hashIp(identity.ip),
                userAgent: this.normaliseUserAgent(identity.userAgent),
                cookieId: identity.cookieId,
            },
        });
    }
    // ── Fraud statistics ──────────────────────────────────────────────────────
    /**
     * Returns fraud statistics for a survey — useful for survey creators.
     *
     * Leverages the @@index([surveyId, ip]) and @@index([surveyId, userAgent])
     * indexes for efficient aggregation.
     */
    async getFraudStats(surveyId) {
        const metas = await this.prisma.voteMeta.findMany({
            where: { surveyId },
            select: { ip: true, userAgent: true, cookieId: true },
        });
        const uniqueIps = new Set(metas.map((m) => m.ip)).size;
        const uniqueUAs = new Set(metas.map((m) => m.userAgent)).size;
        const uniqueCookies = new Set(metas.map((m) => m.cookieId)).size;
        const total = metas.length;
        // Submissions where signals are inconsistent (e.g. same IP, different cookie)
        const suspiciousCount = total - Math.min(uniqueIps, uniqueCookies, uniqueUAs);
        return {
            totalVotes: total,
            uniqueIps,
            uniqueUserAgents: uniqueUAs,
            uniqueCookies,
            suspiciousCount: Math.max(0, suspiciousCount),
        };
    }
}
exports.AntiFraudService = AntiFraudService;
//# sourceMappingURL=antifraud.service.js.map