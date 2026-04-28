import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import bcrypt from 'bcryptjs';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export interface CreateSurveyDto {
  title: string
  description?: string
  imageUrl?: string
  isPrivate?: boolean
  isActive?: boolean
  password?: string
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
    if (data.isPrivate && data.password) {
      passwordHash = await bcrypt.hash(data.password, 12);
    }

    return this.prisma.survey.create({
      data: {
        title:       data.title,
        description: data.description,
        imageUrl:    data.imageUrl,
        isPrivate:   data.isPrivate ?? false,
        isActive:    data.isActive ?? true,
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
    const updateData: any = {
      title:       data.title,
      description: data.description,
      imageUrl:    data.imageUrl,
      isPrivate:   data.isPrivate,
      isActive:    data.isActive,
    };

    if (data.deadline !== undefined) {
      updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    }

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

    return this.getSurveyResults(id);
  }

  // ── List all ─────────────────────────────────────────────────────────────

  async getAllSurveys(authorId?: string) {
    return this.prisma.survey.findMany({
      where: authorId ? { createdById: authorId } : undefined,
      select: {
        id:          true,
        title:       true,
        description: true,
        imageUrl:    true,
        isPrivate:   true,
        isActive:    true,
        createdAt:   true,
        deadline:    true,
        createdById: true,
        _count: { select: { votes: true, questions: true } },
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
