"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SurveyService = void 0;
const client_1 = require("@prisma/client");
const nanoid_1 = require("nanoid");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const nanoid = (0, nanoid_1.customAlphabet)('abcdefghijklmnopqrstuvwxyz0123456789', 10);
class SurveyService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ── Create ──────────────────────────────────────────────────────────────
    async createSurvey(data) {
        // Hash password at the service layer — single source of truth
        let passwordHash = null;
        const isPrivate = data.accessType === client_1.SurveyAccessType.PRIVATE || data.isPrivate;
        if (isPrivate && data.password) {
            passwordHash = await bcryptjs_1.default.hash(data.password, 12);
        }
        const survey = await this.prisma.survey.create({
            data: {
                title: data.title,
                description: data.description,
                imageUrl: data.imageUrl,
                isPrivate: isPrivate ?? false,
                isActive: data.isActive ?? true,
                accessType: data.accessType ?? client_1.SurveyAccessType.PUBLIC,
                passwordHash,
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
        if (data.accessType === client_1.SurveyAccessType.ANONYMOUS_INVITE) {
            await this.generateInviteTokens(survey.id, 1, data.inviteExpiresAt ? new Date(data.inviteExpiresAt) : null, 'Master Invite Link');
        }
        return survey;
    }
    // ── Invites ─────────────────────────────────────────────────────────────
    async generateInviteTokens(surveyId, count = 1, expiresAt, label) {
        const tokensToCreate = Array.from({ length: count }).map(() => ({
            surveyId,
            token: crypto_1.default.randomBytes(24).toString('hex'), // 48-char hex
            expiresAt: expiresAt ?? null,
            label,
        }));
        await this.prisma.inviteToken.createMany({
            data: tokensToCreate,
        });
        return this.getInviteTokens(surveyId);
    }
    async getInviteTokens(surveyId) {
        return this.prisma.inviteToken.findMany({
            where: { surveyId },
            orderBy: { createdAt: 'desc' }
        });
    }
    async activateNewToken(surveyId, expiresAt, label) {
        // Deactivate all existing tokens for this survey
        await this.prisma.inviteToken.updateMany({
            where: { surveyId },
            data: { isActive: false },
        });
        // Create fresh token
        return this.generateInviteTokens(surveyId, 1, expiresAt, label);
    }
    async deactivateInviteToken(tokenId) {
        return this.prisma.inviteToken.update({
            where: { id: tokenId },
            data: { isActive: false }
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
        // Exclude author's votes from the results count
        const validVotes = survey.votes.filter(v => !v.voterUserId || v.voterUserId !== survey.createdById);
        const totalVoters = validVotes.length;
        const validVoteIds = new Set(validVotes.map(v => v.id));
        const questions = survey.questions.map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            options: q.options.map((o) => {
                const optionVotesCount = o.votes.filter(v => validVoteIds.has(v.voteId)).length;
                return {
                    id: o.id,
                    text: o.text,
                    votes: optionVotesCount,
                    percentage: totalVoters > 0
                        ? Math.round((optionVotesCount / totalVoters) * 100)
                        : 0,
                };
            }),
        }));
        // Optionally include author in voters list or exclude? Exclude to be consistent.
        const voters = validVotes.map((v) => {
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
            isPrivate: survey.isPrivate,
            isActive: survey.isActive,
            accessType: survey.accessType,
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
        const updateData = {};
        if (data.title !== undefined)
            updateData.title = data.title;
        if (data.description !== undefined)
            updateData.description = data.description;
        if (data.imageUrl !== undefined)
            updateData.imageUrl = data.imageUrl;
        if (data.isActive !== undefined)
            updateData.isActive = data.isActive;
        // ── Access type change ─────────────────────────────────────────────
        if (data.accessType !== undefined) {
            updateData.accessType = data.accessType;
            // Sync isPrivate to match access type
            updateData.isPrivate = data.accessType === client_1.SurveyAccessType.PRIVATE;
            // If switching away from PRIVATE, clear the password hash
            if (data.accessType !== client_1.SurveyAccessType.PRIVATE) {
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
            }
            else {
                updateData.passwordHash = await bcryptjs_1.default.hash(data.password, 12);
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
                        text: q.text,
                        imageUrl: q.imageUrl ?? null,
                        options: { create: q.options.map((o) => ({ text: o.text })) }
                    }
                });
            }
        }
        return this.getSurveyResults(id);
    }
    // ── List all ─────────────────────────────────────────────────────────────
    async getAllSurveys(authorId) {
        const whereClause = {};
        if (authorId) {
            whereClause.createdById = authorId;
        }
        else {
            whereClause.accessType = { not: 'ANONYMOUS_INVITE' };
        }
        return this.prisma.survey.findMany({
            where: whereClause,
            select: {
                id: true,
                title: true,
                description: true,
                imageUrl: true,
                isPrivate: true,
                isActive: true,
                accessType: true,
                createdAt: true,
                deadline: true,
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
    async deleteSurvey(id) {
        return this.prisma.survey.delete({
            where: { id },
        });
    }
}
exports.SurveyService = SurveyService;
//# sourceMappingURL=survey.service.js.map