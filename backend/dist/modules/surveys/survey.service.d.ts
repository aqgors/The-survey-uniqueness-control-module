import { PrismaClient } from '@prisma/client';
export interface CreateSurveyDto {
    title: string;
    description?: string;
    imageUrl?: string;
    isPublic?: boolean;
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
    isPublic: boolean;
    totalVoters: number;
    createdAt: string;
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
        isPublic: boolean;
        createdAt: Date;
        createdById: string | null;
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
        isPublic: boolean;
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
        isPublic: boolean;
        createdAt: Date;
        createdById: string | null;
    }) | null>;
    getSurveyResults(id: string): Promise<SurveyResults | null>;
    getAllSurveys(): Promise<{
        id: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        isPublic: boolean;
        createdAt: Date;
        _count: {
            questions: number;
            votes: number;
        };
    }[]>;
}
//# sourceMappingURL=survey.service.d.ts.map