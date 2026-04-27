import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export interface CreateSurveyDto {
  title: string
  isPublic?: boolean
  questions: {
    text: string
    options: { text: string }[]
  }[]
}

export interface SurveyResults {
  surveyId: string
  title: string
  isPublic: boolean
  totalVoters: number
  createdAt: string
  questions: {
    id: string
    text: string
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
        title:    data.title,
        isPublic: data.isPublic ?? true,
        questions: {
          create: data.questions.map((q) => ({
            text: q.text,
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
        votes: true,
      },
    });

    if (!survey) return null;

    const totalVoters = survey.votes.length;

    const questions = survey.questions.map((q) => ({
      id:   q.id,
      text: q.text,
      options: q.options.map((o) => ({
        id:   o.id,
        text: o.text,
        votes:      o.votes.length,
        percentage: totalVoters > 0
          ? Math.round((o.votes.length / totalVoters) * 100)
          : 0,
      })),
    }));

    return {
      surveyId:    survey.id,
      title:       survey.title,
      isPublic:    survey.isPublic,
      totalVoters,
      createdAt:   survey.createdAt.toISOString(),
      questions,
    };
  }

  // ── List all ─────────────────────────────────────────────────────────────

  async getAllSurveys() {
    return this.prisma.survey.findMany({
      select: {
        id:        true,
        title:     true,
        isPublic:  true,
        createdAt: true,
        _count: { select: { votes: true, questions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
