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
    /**
     * Checks VoteMeta for duplicate identity signals before accepting a vote.
     *
     * Strictness levels:
     *   1. cookieId — HARD BLOCK: unique per browser session, most reliable
     *   2. IP       — SOFT signal only: shared NAT/Wi-Fi causes false positives
     *   3. UA       — SOFT signal only: many people share identical browser builds
     *
     * Only a cookieId match causes an actual vote rejection. IP and UA matches
     * are recorded in the signal field for analytics but do NOT block the vote.
     */
    async checkUniqueness(surveyId, identity) {
        const hashedIp = this.hashIp(identity.ip);
        const ua = this.normaliseUserAgent(identity.userAgent);
        // ── 1. Cookie check — HARD BLOCK ─────────────────────────────────────
        const byCookie = await this.prisma.voteMeta.findFirst({
            where: { surveyId, cookieId: identity.cookieId },
            select: { id: true },
        });
        if (byCookie) {
            return {
                isUnique: false,
                hardBlock: true,
                signal: 'cookieId',
                message: 'Цей браузер вже використовувався для голосування в цьому опитуванні.',
            };
        }
        // ── 2. Fingerprint check — HARD BLOCK (survives cookie clearing) ────────
        if (identity.fingerprint) {
            const byFp = await this.prisma.voteMeta.findFirst({
                where: { surveyId, fingerprint: identity.fingerprint },
                select: { id: true },
            });
            if (byFp) {
                return {
                    isUnique: false,
                    hardBlock: true,
                    signal: 'fingerprint',
                    message: 'Цей пристрій вже використовувався для голосування в цьому опитуванні.',
                };
            }
        }
        // ── 3. IP check — SOFT signal, vote still allowed ─────────────────────
        const byIp = await this.prisma.voteMeta.findFirst({
            where: { surveyId, ip: hashedIp },
            select: { id: true },
        });
        if (byIp) {
            // isUnique=true so the vote proceeds; signal recorded for admin analytics
            return { isUnique: true, hardBlock: false, signal: 'ip', message: 'OK (shared IP)' };
        }
        // ── 3. User-Agent check — SOFT signal, vote still allowed ─────────────
        const byUA = await this.prisma.voteMeta.findFirst({
            where: { surveyId, userAgent: ua },
            select: { id: true },
        });
        if (byUA) {
            return { isUnique: true, hardBlock: false, signal: 'userAgent', message: 'OK (shared UA)' };
        }
        return { isUnique: true, hardBlock: false, signal: null, message: 'OK' };
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
                fingerprint: identity.fingerprint ?? null,
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