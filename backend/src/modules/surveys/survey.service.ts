import { PrismaClient, SurveyAccessType } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export interface CreateSurveyDto {
  title: string
  description?: string
  imageUrl?: string
  isPrivate?: boolean
  isActive?: boolean
  accessType?: SurveyAccessType
  inviteExpiresAt?: string
  password?: string
  currentPassword?: string  // for verification when changing password
  deadline?: string
  createdById?: string
  questions: {
    text: string
    imageUrl?: string
    options: { text: string }[]
  }[]
}

export interface SurveyResults {
  surveyId: string
  title: string
  description: string | null
  imageUrl: string | null
  isPrivate: boolean
  isActive: boolean
  accessType: SurveyAccessType
  createdById: string | null
  deadline: string | null
  totalVoters: number
  createdAt: string
  voters: {
    voterUserId: string | null
    createdAt: string
    userName: string | null
    userEmail: string | null
  }[]
  questions: {
    id: string
    text: string
    imageUrl: string | null
    options: {
      id: string
      text: string
      votes: number
      percentage: number
    }[]
  }[]
}

export class SurveyService {
  constructor(private prisma: PrismaClient) {}

  // ── Create ──────────────────────────────────────────────────────────────

  async createSurvey(data: CreateSurveyDto) {
    // Hash password at the service layer — single source of truth
    let passwordHash: string | null = null;
    const isPrivate = data.accessType === SurveyAccessType.PRIVATE || data.isPrivate;
    if (isPrivate && data.password) {
      passwordHash = await bcrypt.hash(data.password, 12);
    }

    const survey = await this.prisma.survey.create({
      data: {
        title:       data.title,
        description: data.description,
        imageUrl:    data.imageUrl,
        isPrivate:   isPrivate ?? false,
        isActive:    data.isActive ?? true,
        accessType:  data.accessType ?? SurveyAccessType.PUBLIC,
        passwordHash,
        createdById: data.createdById,
        deadline:    data.deadline ? new Date(data.deadline) : null,
        questions: {
          create: data.questions.map((q) => ({
            text:     q.text,
            imageUrl: q.imageUrl,
            options: { create: q.options.map((o) => ({ text: o.text })) },
          })),
        },
      },
      include: {
        questions: { include: { options: true } },
      },
    });

    if (data.accessType === SurveyAccessType.ANONYMOUS_INVITE) {
      await this.generateInviteTokens(survey.id, 1, data.inviteExpiresAt ? new Date(data.inviteExpiresAt) : null, 'Master Invite Link');
    }

    return survey;
  }

  // ── Invites ─────────────────────────────────────────────────────────────

  async generateInviteTokens(surveyId: string, count: number = 1, expiresAt?: Date | null, label?: string) {
    const tokensToCreate = Array.from({ length: count }).map(() => ({
      surveyId,
      token: crypto.randomBytes(24).toString('hex'), // 48-char hex
      expiresAt: expiresAt ?? null,
      label,
    }));

    await this.prisma.inviteToken.createMany({
      data: tokensToCreate,
    });

    return this.getInviteTokens(surveyId);
  }

  async getInviteTokens(surveyId: string) {
    return this.prisma.inviteToken.findMany({
      where: { surveyId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async activateNewToken(surveyId: string, expiresAt?: Date | null, label?: string) {
    // Deactivate all existing tokens for this survey
    await this.prisma.inviteToken.updateMany({
      where: { surveyId },
      data: { isActive: false },
    });
    // Create fresh token
    return this.generateInviteTokens(surveyId, 1, expiresAt, label);
  }

  async deactivateInviteToken(tokenId: string) {
    return this.prisma.inviteToken.update({
      where: { id: tokenId },
      data: { isActive: false }
    });
  }

  // ── Get one ─────────────────────────────────────────────────────────────

  async getSurveyById(id: string) {
    return this.prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true } },
      },
    });
  }

  async getSurveyBySlug(idOrSlug: string) {
    return this.getSurveyById(idOrSlug);
  }

  // ── Results (raw DB — no cache here, cache handled at route level) ───────

  async getSurveyResults(id: string): Promise<SurveyResults | null> {
    const survey = await this.prisma.survey.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            options: { include: { votes: true } },
          },
        },
        votes: {
          include: { user: true },
        },
      },
    });

    if (!survey) return null;

    // Exclude author's votes from the results count
    const validVotes = survey.votes.filter(v => !v.voterUserId || v.voterUserId !== survey.createdById);
    const totalVoters = validVotes.length;
    const validVoteIds = new Set(validVotes.map(v => v.id));

    const questions = survey.questions.map((q) => ({
      id:       q.id,
      text:     q.text,
      imageUrl: q.imageUrl,
      options: q.options.map((o) => {
        const optionVotesCount = o.votes.filter(v => validVoteIds.has(v.voteId)).length;
        return {
          id:         o.id,
          text:       o.text,
          votes:      optionVotesCount,
          percentage: totalVoters > 0
            ? Math.round((optionVotesCount / totalVoters) * 100)
            : 0,
        }
      }),
    }));

    // Optionally include author in voters list or exclude? Exclude to be consistent.
    const voters = validVotes.map((v) => {
      const voteWithUser = v as typeof v & { user: { name: string | null; email: string } | null }
      return {
        voterUserId: v.voterUserId,
        createdAt:   v.createdAt.toISOString(),
        userName:    voteWithUser.user?.name ?? null,
        userEmail:   voteWithUser.user?.email ?? null,
      }
    });

    return {
      surveyId:    survey.id,
      title:       survey.title,
      description: survey.description,
      imageUrl:    survey.imageUrl,
      isPrivate:   survey.isPrivate,
      isActive:    survey.isActive,
      accessType:  survey.accessType,
      createdById: survey.createdById,
      totalVoters,
      createdAt:   survey.createdAt.toISOString(),
      deadline:    survey.deadline ? survey.deadline.toISOString() : null,
      voters,
      questions,
    };
  }

  // ── Update ──────────────────────────────────────────────────────────────

  async updateSurvey(id: string, data: Partial<CreateSurveyDto>) {
    const updateData: any = {};

    if (data.title       !== undefined) updateData.title       = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.imageUrl    !== undefined) updateData.imageUrl    = data.imageUrl;
    if (data.isActive    !== undefined) updateData.isActive    = data.isActive;

    // ── Access type change ─────────────────────────────────────────────
    if (data.accessType !== undefined) {
      updateData.accessType = data.accessType;
      // Sync isPrivate to match access type
      updateData.isPrivate = data.accessType === SurveyAccessType.PRIVATE;
      // If switching away from PRIVATE, clear the password hash
      if (data.accessType !== SurveyAccessType.PRIVATE) {
        updateData.passwordHash = null;
      }
    }

    if (data.deadline !== undefined) {
      updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    }

    // ── Password change (with old password verification handled in the route) ───
    if (data.password !== undefined) {
      if (data.password === null || data.password === '') {
        updateData.passwordHash = null;
      } else {
        updateData.passwordHash = await bcrypt.hash(data.password, 12);
      }
    }

    await this.prisma.survey.update({
      where: { id },
      data: updateData
    });

    // ── Questions mutation (replace strategy) ─────────────────────────────
    if (data.questions && data.questions.length > 0) {
      await this.prisma.question.deleteMany({ where: { surveyId: id } });
      for (const q of data.questions) {
        await this.prisma.question.create({
          data: {
            surveyId: id,
            text:     q.text,
            imageUrl: q.imageUrl ?? null,
            options: { create: q.options.map((o) => ({ text: o.text })) }
          }
        });
      }
    }

    return this.getSurveyResults(id);
  }

  // ── List all ─────────────────────────────────────────────────────────────

  async getAllSurveys(authorId?: string) {
    const whereClause: any = {};
    if (authorId) {
      whereClause.createdById = authorId;
    } else {
      whereClause.accessType = { not: 'ANONYMOUS_INVITE' };
    }

    return this.prisma.survey.findMany({
      where: whereClause,
      select: {
        id:          true,
        title:       true,
        description: true,
        imageUrl:    true,
        isPrivate:   true,
        isActive:    true,
        accessType:  true,
        createdAt:   true,
        deadline:    true,
        createdById: true,
        _count: { select: { votes: true, questions: true } },
        inviteTokens: authorId ? {
          where: { isActive: true },
          select: { token: true, expiresAt: true, usageCount: true, createdAt: true, id: true },
          take: 1,
          orderBy: { createdAt: 'desc' }
        } : false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async deleteSurvey(id: string) {
    return this.prisma.survey.delete({
      where: { id },
    });
  }
}
