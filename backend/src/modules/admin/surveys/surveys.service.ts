import { PrismaClient } from '@prisma/client';

export class AdminSurveysService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── List surveys ──────────────────────────────────────────────────────────
  async listSurveys(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    createdById?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page = 1, limit = 20, search, isActive, createdById, dateFrom, dateTo, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { title:       { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isActive !== undefined) where.isActive = isActive;
    if (createdById)            where.createdById = createdById;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(dateTo);
    }

    const validSort = ['createdAt', 'title', 'isActive', 'updatedAt'];
    const orderField = validSort.includes(sortBy) ? sortBy : 'createdAt';

    const [surveys, total] = await Promise.all([
      this.prisma.survey.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder },
        select: {
          id: true, title: true, description: true, imageUrl: true,
          isActive: true, isPrivate: true, accessType: true,
          createdAt: true, updatedAt: true, deadline: true,
          createdById: true, duplicatedFromId: true,
          _count: { select: { votes: true, questions: true } },
        },
      }),
      this.prisma.survey.count({ where }),
    ]);

    return {
      surveys,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Survey stats ──────────────────────────────────────────────────────────
  async getSurveyStats(id: string) {
    const survey = await this.prisma.survey.findUnique({
      where: { id },
      include: {
        _count:    { select: { votes: true, questions: true } },
        questions: { include: { options: { include: { _count: { select: { votes: true } } } } } },
      },
    });
    if (!survey) return null;

    const voteMetas = await this.prisma.voteMeta.findMany({
      where:  { surveyId: id },
      select: { ip: true, userAgent: true, riskScore: true, flags: true, submittedAt: true },
    });

    const uniqueIps      = new Set(voteMetas.map(m => m.ip)).size;
    const uniqueUAs      = new Set(voteMetas.map(m => m.userAgent)).size;
    const suspicious     = voteMetas.filter(m => m.riskScore > 30).length;
    const avgRisk        = voteMetas.length
      ? Math.round(voteMetas.reduce((s, m) => s + m.riskScore, 0) / voteMetas.length)
      : 0;

    // votes per day last 7 days
    const now = new Date();
    const votesByDay: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      votesByDay[d.toISOString().slice(0, 10)] = 0;
    }
    const recentVotes = await this.prisma.vote.findMany({
      where: { surveyId: id, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      select: { createdAt: true },
    });
    recentVotes.forEach(v => {
      const key = v.createdAt.toISOString().slice(0, 10);
      if (key in votesByDay) votesByDay[key]++;
    });

    return {
      survey: {
        id: survey.id, title: survey.title, isActive: survey.isActive,
        createdAt: survey.createdAt, deadline: survey.deadline,
        totalVotes: survey._count.votes, totalQuestions: survey._count.questions,
      },
      fraud:   { uniqueIps, uniqueUAs, suspicious, avgRisk, total: voteMetas.length },
      votesByDay,
      questions: survey.questions.map(q => ({
        id: q.id, text: q.text,
        options: q.options.map(o => ({ id: o.id, text: o.text, votes: o._count.votes })),
      })),
    };
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  async toggleActive(id: string, isActive: boolean, actorId: string) {
    const survey = await this.prisma.survey.findUnique({ where: { id } });
    if (!survey) return null;

    const updated = await this.prisma.survey.update({
      where: { id },
      data:  { isActive },
      select: { id: true, title: true, isActive: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:     isActive ? 'SURVEY_ACTIVATED' : 'SURVEY_DEACTIVATED',
        targetType: 'SURVEY',
        targetId:   id,
        meta: { title: survey.title },
      },
    });

    return updated;
  }

  // ── Duplicate survey ──────────────────────────────────────────────────────
  async duplicateSurvey(id: string, actorId: string) {
    const original = await this.prisma.survey.findUnique({
      where:   { id },
      include: { questions: { include: { options: true } } },
    });
    if (!original) return null;

    const copy = await this.prisma.survey.create({
      data: {
        title:           `${original.title} (копія)`,
        description:     original.description,
        imageUrl:        original.imageUrl,
        isPrivate:       original.isPrivate,
        isActive:        false,
        accessType:      original.accessType,
        createdById:     actorId,
        duplicatedFromId: original.id,
        questions: {
          create: original.questions.map(q => ({
            text:    q.text,
            imageUrl: q.imageUrl,
            options: { create: q.options.map(o => ({ text: o.text })) },
          })),
        },
      },
      select: { id: true, title: true, isActive: true, createdAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:     'SURVEY_DUPLICATED',
        targetType: 'SURVEY',
        targetId:   id,
        meta: { newSurveyId: copy.id, originalTitle: original.title },
      },
    });

    return copy;
  }

  // ── Delete survey ─────────────────────────────────────────────────────────
  async deleteSurvey(id: string, actorId: string) {
    const survey = await this.prisma.survey.findUnique({ where: { id } });
    if (!survey) return null;

    await this.prisma.survey.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:     'SURVEY_DELETED',
        targetType: 'SURVEY',
        targetId:   id,
        meta: { title: survey.title },
      },
    });

    return { success: true };
  }

  // ── Dashboard stats ───────────────────────────────────────────────────────
  async getDashboardStats() {
    const [totalSurveys, activeSurveys, totalVotes, totalUsers, newSurveysWeek, recentSurveys] = await Promise.all([
      this.prisma.survey.count(),
      this.prisma.survey.count({ where: { isActive: true } }),
      this.prisma.vote.count(),
      this.prisma.user.count(),
      this.prisma.survey.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      this.prisma.survey.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, title: true, isActive: true, createdAt: true,
          _count: { select: { votes: true } },
        },
      }),
    ]);

    // votes per day last 7 days
    const votesByDay: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const from = new Date();
      from.setDate(from.getDate() - i);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setHours(23, 59, 59, 999);
      const count = await this.prisma.vote.count({ where: { createdAt: { gte: from, lte: to } } });
      votesByDay.push({ date: from.toISOString().slice(0, 10), count });
    }

    return {
      totalSurveys, activeSurveys, totalVotes, totalUsers, newSurveysWeek,
      recentSurveys, votesByDay,
    };
  }
}
