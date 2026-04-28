"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SurveyService = void 0;
const nanoid_1 = require("nanoid");
const nanoid = (0, nanoid_1.customAlphabet)('abcdefghijklmnopqrstuvwxyz0123456789', 10);
class SurveyService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ── Create ──────────────────────────────────────────────────────────────
    async createSurvey(data) {
        return this.prisma.survey.create({
            data: {
                title: data.title,
                description: data.description,
                imageUrl: data.imageUrl,
                isPublic: data.isPublic ?? true,
                createdById: data.createdById,
                deadline: data.deadline ? new Date(data.deadline) : null,
                questions: {
                    create: data.questions.map((q) => ({
                        text: q.text,
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
    async getSurveyById(id) {
        return this.prisma.survey.findUnique({
            where: { id },
            include: {
                questions: { include: { options: true } },
            },
        });
    }
    async getSurveyBySlug(idOrSlug) {
        return this.getSurveyById(idOrSlug);
    }
    // ── Results (raw DB — no cache here, cache handled at route level) ───────
    async getSurveyResults(id) {
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
        if (!survey)
            return null;
        const totalVoters = survey.votes.length;
        const questions = survey.questions.map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            options: q.options.map((o) => ({
                id: o.id,
                text: o.text,
                votes: o.votes.length,
                percentage: totalVoters > 0
                    ? Math.round((o.votes.length / totalVoters) * 100)
                    : 0,
            })),
        }));
        const voters = survey.votes.map((v) => {
            const voteWithUser = v;
            return {
                voterUserId: v.voterUserId,
                createdAt: v.createdAt.toISOString(),
                userName: voteWithUser.user?.name ?? null,
                userEmail: voteWithUser.user?.email ?? null,
            };
        });
        return {
            surveyId: survey.id,
            title: survey.title,
            description: survey.description,
            imageUrl: survey.imageUrl,
            isPublic: survey.isPublic,
            createdById: survey.createdById,
            totalVoters,
            createdAt: survey.createdAt.toISOString(),
            deadline: survey.deadline ? survey.deadline.toISOString() : null,
            voters,
            questions,
        };
    }
    // ── Update ──────────────────────────────────────────────────────────────
    async updateSurvey(id, data) {
        await this.prisma.survey.update({
            where: { id },
            data: {
                title: data.title,
                description: data.description,
                imageUrl: data.imageUrl,
                isPublic: data.isPublic,
            }
        });
        return this.getSurveyResults(id);
    }
    // ── List all ─────────────────────────────────────────────────────────────
    async getAllSurveys(authorId) {
        return this.prisma.survey.findMany({
            where: authorId ? { createdById: authorId } : undefined,
            select: {
                id: true,
                title: true,
                description: true,
                imageUrl: true,
                isPublic: true,
                createdAt: true,
                deadline: true,
                createdById: true,
                _count: { select: { votes: true, questions: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    // ── Delete ───────────────────────────────────────────────────────────────
    async deleteSurvey(id) {
        return this.prisma.survey.delete({
            where: { id },
        });
    }
}
exports.SurveyService = SurveyService;
//# sourceMappingURL=survey.service.js.map