import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface VoterIdentity {
  /** Raw IP address — hashed with SHA-256 before storage */
  ip: string;
  /** Full User-Agent string from request headers */
  userAgent: string;
  /** UUID token persisted in voter's browser cookie / localStorage */
  cookieId: string;
  /** FingerprintJS visitorId — device fingerprint, survives cookie clearing */
  fingerprint?: string;
}

export type FraudSignal = 'ip' | 'userAgent' | 'cookieId' | 'fingerprint' | 'userId';

export interface UniquenessCheckResult {
  isUnique: boolean;
  /** Which signal triggered the duplicate detection, or null if unique */
  signal: FraudSignal | null;
  /** Whether the check is a hard block or a soft warning */
  hardBlock: boolean;
  message: string;
}

// ── Service ────────────────────────────────────────────────────────────────

export class AntiFraudService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** SHA-256 hash of a string (for safe IP storage) */
  hashIp(rawIp: string): string {
    return createHash('sha256').update(rawIp.trim()).digest('hex');
  }

  /** Truncate User-Agent to 512 chars to match DB column */
  normaliseUserAgent(ua: string): string {
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
  async checkUniqueness(
    surveyId: string,
    identity: VoterIdentity
  ): Promise<UniquenessCheckResult> {
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
  async recordVoteMeta(
    voteId: string,
    surveyId: string,
    identity: VoterIdentity,
    tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
  ): Promise<void> {
    await tx.voteMeta.create({
      data: {
        voteId,
        surveyId,
        ip:          this.hashIp(identity.ip),
        userAgent:   this.normaliseUserAgent(identity.userAgent),
        cookieId:    identity.cookieId,
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
  async getFraudStats(surveyId: string) {
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
