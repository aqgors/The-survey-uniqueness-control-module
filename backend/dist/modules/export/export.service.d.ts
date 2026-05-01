import { PrismaClient } from '@prisma/client';
import { ExportSurveyData } from './export.types';
export declare class ExportService {
    private prisma;
    constructor(prisma: PrismaClient);
    getSurveyExportData(surveyId: string): Promise<ExportSurveyData | null>;
    generateCSV(data: ExportSurveyData): Promise<Buffer>;
    generateJSON(data: ExportSurveyData): Buffer;
    generateExcel(data: ExportSurveyData): Promise<Buffer>;
    generateDOCX(data: ExportSurveyData): Promise<Buffer>;
}
//# sourceMappingURL=export.service.d.ts.map