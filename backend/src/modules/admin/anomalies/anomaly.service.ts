import { PrismaClient } from '@prisma/client';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const FAST_SUBMIT_THRESHOLD_MS = 15_000; // < 15 seconds = suspicious
const BURST_WINDOW_MS          = 5 * 60_000; // 5 minutes
const BURST_COUNT_THRESHOLD    = 10; // 10 votes in 5 min from same subnet

function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

export class AnomalyService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Scan a survey and update riskScore + flags ─────────────────────────
  async scanSurvey(surveyId: string): Promise<{ scanned: number; flagged: number }> {
    const metas = await this.prisma.voteMeta.findMany({
      where: { surveyId },
      include: { vote: { include: { items: { select: { optionId: true } } } } },
    });

    let flagged = 0;

    for (const meta of metas) {
      const flags: string[] = [];
      let riskScore = 0;

      // 1. Duplicate User-Agent (same UA already used in this survey)
      const sameUA = metas.filter(m => m.id !== meta.id && m.userAgent === meta.userAgent);
      if (sameUA.length > 0) {
        flags.push('DUPLICATE_UA');
        riskScore += Math.min(30, sameUA.length * 10);
      }

      // 2. IP subnet burst (same /24 subnet, many votes in short time)
      if (meta.ipSubnet) {
        const sameSubnet = metas.filter(m =>
          m.id !== meta.id &&
          m.ipSubnet === meta.ipSubnet &&
          Math.abs(m.submittedAt.getTime() - meta.submittedAt.getTime()) <= BURST_WINDOW_MS
        );
        if (sameSubnet.length >= BURST_COUNT_THRESHOLD) {
          flags.push('SUBNET_BURST');
          riskScore += 40;
        } else if (sameSubnet.length >= 3) {
          flags.push('SHARED_SUBNET');
          riskScore += 15;
        }
      }

      // 3. Identical answers (same set of optionIds as another vote in same survey)
      const myOptions = meta.vote.items.map(i => i.optionId).sort().join(',');
      if (myOptions) {
        const duplicateAnswers = metas.filter(m => {
          if (m.id === meta.id) return false;
          const theirOptions = m.vote.items.map(i => i.optionId).sort().join(',');
          return theirOptions === myOptions && myOptions.length > 0;
        });
        if (duplicateAnswers.length > 0) {
          flags.push('IDENTICAL_ANSWERS');
          riskScore += 25;
        }
      }

      // 4. Fast submit
      const submitDeltaMs = meta.submittedAt.getTime() - meta.vote.createdAt.getTime();
      if (submitDeltaMs < FAST_SUBMIT_THRESHOLD_MS && submitDeltaMs >= 0) {
        flags.push('FAST_SUBMIT');
        riskScore += 20;
      }

      riskScore = Math.min(100, riskScore);

      await this.prisma.voteMeta.update({
        where: { id: meta.id },
        data:  { riskScore, flags },
      });

      if (flags.length > 0) flagged++;
    }

    return { scanned: metas.length, flagged };
  }

  // ── List anomalies with filters ────────────────────────────────────────
  async listAnomalies(params: {
    surveyId?:  string;
    riskLevel?: RiskLevel;
    flag?:      string;
    dateFrom?:  string;
    dateTo?:    string;
    page?:      number;
    limit?:     number;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { surveyId, riskLevel, flag, dateFrom, dateTo, page = 1, limit = 50, sortOrder = 'desc' } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (surveyId) where.surveyId = surveyId;
    if (flag)     where.flags = { has: flag };

    // riskLevel → riskScore range
    if (riskLevel) {
      const ranges: Record<RiskLevel, { gte: number; lt?: number }> = {
        LOW:      { gte: 0,  lt: 25 },
        MEDIUM:   { gte: 25, lt: 50 },
        HIGH:     { gte: 50, lt: 80 },
        CRITICAL: { gte: 80 },
      };
      where.riskScore = ranges[riskLevel];
    }
    if (dateFrom || dateTo) {
      where.submittedAt = {};
      if (dateFrom) where.submittedAt.gte = new Date(dateFrom);
      if (dateTo)   where.submittedAt.lte = new Date(dateTo);
    }

    const [items, total] = await Promise.all([
      this.prisma.voteMeta.findMany({
        where,
        skip,
        take: limit,
        orderBy: { riskScore: sortOrder },
        select: {
          id: true, voteId: true, surveyId: true,
          ip: true, ipSubnet: true, userAgent: true, cookieId: true,
          riskScore: true, flags: true, submittedAt: true,
          vote: {
            select: {
              id: true, createdAt: true, voterUserId: true,
              user: { select: { id: true, name: true, email: true } },
              survey: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.voteMeta.count({ where }),
    ]);

    const enriched = items.map(m => ({
      ...m,
      riskLevel: getRiskLevel(m.riskScore),
    }));

    return {
      anomalies: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Global stats ────────────────────────────────────────────────────────
  async getAnomalyStats() {
    const [total, critical, high, medium, low, flagCounts] = await Promise.all([
      this.prisma.voteMeta.count(),
      this.prisma.voteMeta.count({ where: { riskScore: { gte: 80 } } }),
      this.prisma.voteMeta.count({ where: { riskScore: { gte: 50, lt: 80 } } }),
      this.prisma.voteMeta.count({ where: { riskScore: { gte: 25, lt: 50 } } }),
      this.prisma.voteMeta.count({ where: { riskScore: { lt: 25 } } }),
      // top 5 most flagged surveys
      this.prisma.voteMeta.groupBy({
        by:      ['surveyId'],
        where:   { riskScore: { gt: 0 } },
        _count:  { surveyId: true },
        _avg:    { riskScore: true },
        orderBy: { _avg: { riskScore: 'desc' } },
        take:    5,
      }),
    ]);

    // Flag frequency
    const allMetas = await this.prisma.voteMeta.findMany({
      where:  { flags: { isEmpty: false } },
      select: { flags: true },
    });
    const flagFreq: Record<string, number> = {};
    allMetas.forEach(m => m.flags.forEach(f => { flagFreq[f] = (flagFreq[f] || 0) + 1; }));

    // Risk over time (last 7 days)
    const riskByDay: { date: string; avg: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const from = new Date(); from.setDate(from.getDate() - i); from.setHours(0, 0, 0, 0);
      const to   = new Date(from); to.setHours(23, 59, 59, 999);
      const agg  = await this.prisma.voteMeta.aggregate({
        where:   { submittedAt: { gte: from, lte: to }, riskScore: { gt: 0 } },
        _avg:    { riskScore: true },
        _count:  { id: true },
      });
      riskByDay.push({
        date: from.toISOString().slice(0, 10),
        avg:  Math.round(agg._avg.riskScore ?? 0),
      });
    }

    return { total, critical, high, medium, low, flagFreq, riskByDay, topSurveys: flagCounts };
  }

  // ── Manual flag toggle ──────────────────────────────────────────────────
  async flagVoteMeta(id: string, addFlag: string, actorId: string) {
    const meta = await this.prisma.voteMeta.findUnique({ where: { id } });
    if (!meta) return null;

    const flags = meta.flags.includes(addFlag)
      ? meta.flags.filter(f => f !== addFlag)   // toggle off
      : [...meta.flags, addFlag];               // toggle on

    const riskScore = Math.min(100, flags.length * 25);

    const updated = await this.prisma.voteMeta.update({
      where: { id },
      data:  { flags, riskScore },
      select: { id: true, flags: true, riskScore: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:     'ANOMALY_FLAGGED',
        targetType: 'VOTE_META',
        targetId:   id,
        meta:       { flag: addFlag, flags },
      },
    });

    return { ...updated, riskLevel: getRiskLevel(updated.riskScore) };
  }
}
