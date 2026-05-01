import { PrismaClient, SurveyAccessType } from '@prisma/client';
export interface CreateSurveyDto {
    title: string;
    description?: string;
    imageUrl?: string;
    isPrivate?: boolean;
    isActive?: boolean;
    accessType?: SurveyAccessType;
    inviteExpiresAt?: string;
    password?: string;
    deadline?: string;
    createdById?: string;
    questions: {
        text: string;
        imageUrl?: string;
        options: {
            text: string;
        }[];
    }[];
}
export interface SurveyResults {
    surveyId: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    isPrivate: boolean;
    isActive: boolean;
    accessType: SurveyAccessType;
    createdById: string | null;
    deadline: string | null;
    totalVoters: number;
    createdAt: string;
    voters: {
        voterUserId: string | null;
        createdAt: string;
        userName: string | null;
        userEmail: string | null;
    }[];
    questions: {
        id: string;
        text: string;
        imageUrl: string | null;
        options: {
            id: string;
            text: string;
            votes: number;
            percentage: number;
        }[];
    }[];
}
export declare class SurveyService {
    private prisma;
    constructor(prisma: PrismaClient);
    createSurvey(data: CreateSurveyDto): Promise<{
        questions: ({
            options: {
                id: string;
                text: string;
                questionId: string;
            }[];
        } & {
            id: string;
            imageUrl: string | null;
            text: string;
            surveyId: string;
        })[];
    } & {
        id: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        isPrivate: boolean;
        isActive: boolean;
        accessType: import(".prisma/client").$Enums.SurveyAccessType;
        passwordHash: string | null;
        deadline: Date | null;
        createdAt: Date;
        createdById: string | null;
    }>;
    generateInviteTokens(surveyId: string, count?: number, expiresAt?: Date | null, label?: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        token: string;
        surveyId: string;
        usageCount: number;
        expiresAt: Date | null;
        usedAt: Date | null;
        label: string | null;
    }[]>;
    getInviteTokens(surveyId: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        token: string;
        surveyId: string;
        usageCount: number;
        expiresAt: Date | null;
        usedAt: Date | null;
        label: string | null;
    }[]>;
    activateNewToken(surveyId: string, expiresAt?: Date | null, label?: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        token: string;
        surveyId: string;
        usageCount: number;
        expiresAt: Date | null;
        usedAt: Date | null;
        label: string | null;
    }[]>;
    deactivateInviteToken(tokenId: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        token: string;
        surveyId: string;
        usageCount: number;
        expiresAt: Date | null;
        usedAt: Date | null;
        label: string | null;
    }>;
    getSurveyById(id: string): Promise<({
        questions: ({
            options: {
                id: string;
                text: string;
                questionId: string;
            }[];
        } & {
            id: string;
            imageUrl: string | null;
            text: string;
            surveyId: string;
        })[];
    } & {
        id: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        isPrivate: boolean;
        isActive: boolean;
        accessType: import(".prisma/client").$Enums.SurveyAccessType;
        passwordHash: string | null;
        deadline: Date | null;
        createdAt: Date;
        createdById: string | null;
    }) | null>;
    getSurveyBySlug(idOrSlug: string): Promise<({
        questions: ({
            options: {
                id: string;
                text: string;
                questionId: string;
            }[];
        } & {
            id: string;
            imageUrl: string | null;
            text: string;
            surveyId: string;
        })[];
    } & {
        id: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        isPrivate: boolean;
        isActive: boolean;
        accessType: import(".prisma/client").$Enums.SurveyAccessType;
        passwordHash: string | null;
        deadline: Date | null;
        createdAt: Date;
        createdById: string | null;
    }) | null>;
    getSurveyResults(id: string): Promise<SurveyResults | null>;
    updateSurvey(id: string, data: Partial<CreateSurveyDto>): Promise<SurveyResults | null>;
    getAllSurveys(authorId?: string): Promise<{
        id: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        isPrivate: boolean;
        isActive: boolean;
        accessType: import(".prisma/client").$Enums.SurveyAccessType;
        deadline: Date | null;
        createdAt: Date;
        createdById: string | null;
        inviteTokens: {
            id: string;
            isActive: boolean;
            createdAt: Date;
            token: string;
            surveyId: string;
            usageCount: number;
            expiresAt: Date | null;
            usedAt: Date | null;
            label: string | null;
        }[];
        _count: {
            questions: number;
            votes: number;
        };
    }[]>;
    deleteSurvey(id: string): Promise<{
        id: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        isPrivate: boolean;
        isActive: boolean;
        accessType: import(".prisma/client").$Enums.SurveyAccessType;
        passwordHash: string | null;
        deadline: Date | null;
        createdAt: Date;
        createdById: string | null;
    }>;
}
//# sourceMappingURL=survey.service.d.ts.map