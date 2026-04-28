import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export interface CreateSurveyDto {
  title: string
  description?: string
  imageUrl?: string
  isPublic?: boolean
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
  isPublic: boolean
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
    return this.prisma.survey.create({
      data: {
        title:       data.title,
        description: data.description,
        imageUrl:    data.imageUrl,
        isPublic:    data.isPublic ?? true,
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

    const totalVoters = survey.votes.length;

    const questions = survey.questions.map((q) => ({
      id:       q.id,
      text:     q.text,
      imageUrl: q.imageUrl,
      options: q.options.map((o) => ({
        id:         o.id,
        text:       o.text,
        votes:      o.votes.length,
        percentage: totalVoters > 0
          ? Math.round((o.votes.length / totalVoters) * 100)
          : 0,
      })),
    }));

    const voters = survey.votes.map((v) => {
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
      isPublic:    survey.isPublic,
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
    await this.prisma.survey.update({
      where: { id },
      data: {
        title:       data.title,
        description: data.description,
        imageUrl:    data.imageUrl,
        isPublic:    data.isPublic,
      }
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
        isPublic:    true,
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
