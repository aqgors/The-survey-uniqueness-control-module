"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportService = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
const docx_1 = require("docx");
const papaparse_1 = __importDefault(require("papaparse"));
// ── Helper: Fetch & shape data from DB ───────────────────────────────────────
class ExportService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ── Fetch raw survey data for export ─────────────────────────────────────
    async getSurveyExportData(surveyId) {
        const survey = await this.prisma.survey.findUnique({
            where: { id: surveyId },
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
        // Exclude author's own votes
        const validVotes = survey.votes.filter((v) => !v.voterUserId || v.voterUserId !== survey.createdById);
        const totalVoters = validVotes.length;
        const validVoteIds = new Set(validVotes.map((v) => v.id));
        const questions = survey.questions.map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            options: q.options.map((o) => {
                const votesCount = o.votes.filter((v) => validVoteIds.has(v.voteId)).length;
                return {
                    id: o.id,
                    text: o.text,
                    votes: votesCount,
                    percentage: totalVoters > 0 ? Math.round((votesCount / totalVoters) * 100) : 0,
                };
            }),
        }));
        const voters = validVotes.map((v) => {
            const voteWithUser = v;
            return {
                voterUserId: v.voterUserId,
                userName: voteWithUser.user?.name ?? null,
                userEmail: voteWithUser.user?.email ?? null,
                createdAt: v.createdAt.toISOString(),
            };
        });
        return {
            survey: {
                id: survey.id,
                title: survey.title,
                description: survey.description,
                createdAt: survey.createdAt.toISOString(),
                deadline: survey.deadline ? survey.deadline.toISOString() : null,
                isPrivate: survey.isPrivate,
                isActive: survey.isActive,
                createdById: survey.createdById,
            },
            statistics: {
                totalVoters,
                totalQuestions: questions.length,
                totalOptions: questions.reduce((acc, q) => acc + q.options.length, 0),
                exportedAt: new Date().toISOString(),
            },
            questions,
            voters,
        };
    }
    // ── CSV Export ────────────────────────────────────────────────────────────
    async generateCSV(data) {
        const rows = [];
        // Header info rows
        rows.push({ 'Поле': 'Назва опитування', 'Значення': data.survey.title });
        rows.push({ 'Поле': 'Опис', 'Значення': data.survey.description ?? '' });
        rows.push({ 'Поле': 'Дата створення', 'Значення': new Date(data.survey.createdAt).toLocaleString('uk-UA') });
        rows.push({ 'Поле': 'Дедлайн', 'Значення': data.survey.deadline ? new Date(data.survey.deadline).toLocaleString('uk-UA') : 'Немає' });
        rows.push({ 'Поле': 'Всього голосів', 'Значення': data.statistics.totalVoters });
        rows.push({ 'Поле': 'Питань', 'Значення': data.statistics.totalQuestions });
        rows.push({ 'Поле': 'Дата експорту', 'Значення': new Date(data.statistics.exportedAt).toLocaleString('uk-UA') });
        rows.push({ 'Поле': '', 'Значення': '' }); // blank separator
        // Results per question
        for (const q of data.questions) {
            rows.push({ 'Поле': `Питання: ${q.text}`, 'Значення': '' });
            for (const opt of q.options) {
                rows.push({
                    'Поле': `  ${opt.text}`,
                    'Значення': `${opt.votes} голосів (${opt.percentage}%)`,
                });
            }
            rows.push({ 'Поле': '', 'Значення': '' });
        }
        const csv = papaparse_1.default.unparse(rows, { delimiter: ',', quotes: true });
        // Prepend UTF-8 BOM for Excel compatibility
        return Buffer.from('\uFEFF' + csv, 'utf8');
    }
    // ── JSON Export ───────────────────────────────────────────────────────────
    generateJSON(data) {
        const json = JSON.stringify(data, null, 2);
        return Buffer.from(json, 'utf8');
    }
    // ── Excel Export (.xlsx) ──────────────────────────────────────────────────
    async generateExcel(data) {
        const wb = new exceljs_1.default.Workbook();
        wb.creator = 'SurveyPulse';
        wb.created = new Date();
        // ── Colors ──────────────────────────────────────────────────────────────
        const PRIMARY = '3B82F6';
        const HEADER_BG = '1E40AF';
        const ALT_ROW = 'EFF6FF';
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        const titleFont = { bold: true, size: 14, color: { argb: 'FF1E40AF' } };
        const labelFont = { bold: true, size: 10, color: { argb: 'FF374151' } };
        function setHeaderRow(row, bg = HEADER_BG) {
            row.font = headerFont;
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
            row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            row.height = 22;
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                    bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                    left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                    right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                };
            });
        }
        // ────────────────────────────────────────────────────────────────────────
        // Sheet 1 — Survey Info
        // ────────────────────────────────────────────────────────────────────────
        const infoSheet = wb.addWorksheet('📋 Інформація');
        infoSheet.columns = [
            { key: 'field', width: 28 },
            { key: 'value', width: 55 },
        ];
        // Title
        const titleRow = infoSheet.addRow(['SurveyPulse — Звіт опитування', '']);
        infoSheet.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
        titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF' + PRIMARY } };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 32;
        infoSheet.addRow([]);
        const fields = [
            ['Назва опитування', data.survey.title],
            ['Опис', data.survey.description ?? '—'],
            ['Статус', data.survey.isActive ? 'Активне' : 'Закрите'],
            ['Приватне', data.survey.isPrivate ? 'Так' : 'Ні'],
            ['Дата створення', new Date(data.survey.createdAt).toLocaleString('uk-UA')],
            ['Дедлайн', data.survey.deadline ? new Date(data.survey.deadline).toLocaleString('uk-UA') : 'Немає'],
            ['Всього голосів', String(data.statistics.totalVoters)],
            ['Питань', String(data.statistics.totalQuestions)],
            ['Дата експорту', new Date(data.statistics.exportedAt).toLocaleString('uk-UA')],
        ];
        for (const [field, value] of fields) {
            const r = infoSheet.addRow([field, value]);
            r.getCell(1).font = labelFont;
            r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
            r.getCell(2).alignment = { wrapText: true };
            r.height = 20;
            r.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                };
            });
        }
        // ────────────────────────────────────────────────────────────────────────
        // Sheet 2 — Statistics
        // ────────────────────────────────────────────────────────────────────────
        const statsSheet = wb.addWorksheet('📊 Статистика');
        statsSheet.columns = [
            { key: 'question', width: 40 },
            { key: 'option', width: 35 },
            { key: 'votes', width: 12 },
            { key: 'pct', width: 14 },
        ];
        const statsHeader = statsSheet.addRow(['Питання', 'Варіант відповіді', 'Голосів', 'Відсоток']);
        setHeaderRow(statsHeader);
        let rowIdx = 0;
        for (const q of data.questions) {
            for (const opt of q.options) {
                const isFirst = q.options.indexOf(opt) === 0;
                const r = statsSheet.addRow([isFirst ? q.text : '', opt.text, opt.votes, `${opt.percentage}%`]);
                r.height = 18;
                const bg = rowIdx % 2 === 0 ? 'FFFFFFFF' : 'FF' + ALT_ROW;
                r.eachCell((cell, colNum) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                    cell.border = {
                        top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    };
                    if (colNum === 1 && isFirst)
                        cell.font = { bold: true };
                    if (colNum === 3) {
                        const pct = opt.percentage;
                        const barColor = pct >= 60 ? 'FF16A34A' : pct >= 30 ? 'FFCA8A04' : 'FFEF4444';
                        cell.font = { color: { argb: barColor }, bold: true };
                    }
                    cell.alignment = { vertical: 'middle', wrapText: true };
                });
                rowIdx++;
            }
        }
        statsSheet.autoFilter = { from: 'A1', to: 'D1' };
        // ────────────────────────────────────────────────────────────────────────
        // Sheet 3 — Voters
        // ────────────────────────────────────────────────────────────────────────
        const votersSheet = wb.addWorksheet('👥 Учасники');
        votersSheet.columns = [
            { key: 'num', width: 6 },
            { key: 'name', width: 30 },
            { key: 'email', width: 35 },
            { key: 'date', width: 22 },
        ];
        const votersHeader = votersSheet.addRow(['#', "Ім'я", 'Email', 'Час голосування']);
        setHeaderRow(votersHeader);
        data.voters.forEach((v, i) => {
            const r = votersSheet.addRow([
                i + 1,
                v.userName ?? '(Анонімно)',
                v.userEmail ?? '—',
                new Date(v.createdAt).toLocaleString('uk-UA'),
            ]);
            const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FF' + ALT_ROW;
            r.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cell.border = {
                    top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                };
                cell.alignment = { vertical: 'middle' };
            });
            r.height = 18;
        });
        votersSheet.autoFilter = { from: 'A1', to: 'D1' };
        const buffer = await wb.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }
    // ── DOCX Export ───────────────────────────────────────────────────────────
    async generateDOCX(data) {
        const borderCell = {
            top: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '3B82F6' },
            bottom: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '3B82F6' },
            left: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '3B82F6' },
            right: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '3B82F6' },
        };
        const thinBorder = {
            top: { style: docx_1.BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            bottom: { style: docx_1.BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            left: { style: docx_1.BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            right: { style: docx_1.BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
        };
        function headerCell(text) {
            return new docx_1.TableCell({
                children: [new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
                        alignment: docx_1.AlignmentType.CENTER,
                    })],
                shading: { fill: '1E40AF' },
                borders: borderCell,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
            });
        }
        function dataCell(text, bold = false) {
            return new docx_1.TableCell({
                children: [new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text, bold, size: 18 })],
                    })],
                borders: thinBorder,
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
            });
        }
        // ── Info section ─────────────────────────────────────────────────────────
        const infoTable = new docx_1.Table({
            layout: docx_1.TableLayoutType.FIXED,
            width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
            rows: [
                new docx_1.TableRow({ children: [headerCell('Поле'), headerCell('Значення')] }),
                ...[
                    ['Назва', data.survey.title],
                    ['Опис', data.survey.description ?? '—'],
                    ['Статус', data.survey.isActive ? 'Активне' : 'Закрите'],
                    ['Приватне', data.survey.isPrivate ? 'Так' : 'Ні'],
                    ['Дата створення', new Date(data.survey.createdAt).toLocaleString('uk-UA')],
                    ['Дедлайн', data.survey.deadline ? new Date(data.survey.deadline).toLocaleString('uk-UA') : 'Немає'],
                    ['Всього голосів', String(data.statistics.totalVoters)],
                    ['Питань', String(data.statistics.totalQuestions)],
                    ['Дата експорту', new Date(data.statistics.exportedAt).toLocaleString('uk-UA')],
                ].map(([label, value]) => new docx_1.TableRow({
                    children: [dataCell(label, true), dataCell(value)],
                })),
            ],
        });
        // ── Results section ───────────────────────────────────────────────────────
        const resultsSections = [];
        for (const [qIdx, q] of data.questions.entries()) {
            resultsSections.push(new docx_1.Paragraph({
                text: `${qIdx + 1}. ${q.text}`,
                heading: docx_1.HeadingLevel.HEADING_3,
                spacing: { before: 240, after: 120 },
            }));
            const qTable = new docx_1.Table({
                layout: docx_1.TableLayoutType.FIXED,
                width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
                rows: [
                    new docx_1.TableRow({ children: [headerCell('Варіант відповіді'), headerCell('Голосів'), headerCell('%')] }),
                    ...q.options.map((opt, oIdx) => {
                        const shading = oIdx % 2 === 0 ? 'FFFFFF' : 'EFF6FF';
                        function shadedCell(text, bold = false) {
                            return new docx_1.TableCell({
                                children: [new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text, bold, size: 18 })],
                                    })],
                                shading: { fill: shading },
                                borders: thinBorder,
                                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                            });
                        }
                        return new docx_1.TableRow({
                            children: [
                                shadedCell(opt.text),
                                shadedCell(String(opt.votes), opt.votes > 0),
                                shadedCell(`${opt.percentage}%`, opt.votes > 0),
                            ],
                        });
                    }),
                ],
            });
            resultsSections.push(qTable);
        }
        // ── Voters section ────────────────────────────────────────────────────────
        const voterRows = data.voters.map((v, i) => new docx_1.TableRow({
            children: [
                dataCell(String(i + 1)),
                dataCell(v.userName ?? '(Анонімно)'),
                dataCell(v.userEmail ?? '—'),
                dataCell(new Date(v.createdAt).toLocaleString('uk-UA')),
            ],
        }));
        const votersTable = new docx_1.Table({
            layout: docx_1.TableLayoutType.FIXED,
            width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
            rows: [
                new docx_1.TableRow({ children: [headerCell('#'), headerCell("Ім'я"), headerCell('Email'), headerCell('Час голосування')] }),
                ...voterRows,
            ],
        });
        const doc = new docx_1.Document({
            sections: [{
                    children: [
                        // ── Title ──────────────────────────────────────────────────────────
                        new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: 'SurveyPulse — Звіт опитування',
                                    bold: true,
                                    size: 36,
                                    color: '1E40AF',
                                }),
                            ],
                            alignment: docx_1.AlignmentType.CENTER,
                            spacing: { after: 240 },
                        }),
                        new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: data.survey.title,
                                    bold: true,
                                    size: 28,
                                    color: '374151',
                                }),
                            ],
                            heading: docx_1.HeadingLevel.HEADING_1,
                            spacing: { after: 80 },
                        }),
                        ...(data.survey.description ? [new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: data.survey.description, italics: true, color: '6B7280', size: 20 })],
                                spacing: { after: 300 },
                            })] : []),
                        // ── Info table ─────────────────────────────────────────────────────
                        new docx_1.Paragraph({
                            text: 'Загальна інформація',
                            heading: docx_1.HeadingLevel.HEADING_2,
                            spacing: { before: 240, after: 120 },
                        }),
                        infoTable,
                        // ── Results ────────────────────────────────────────────────────────
                        new docx_1.Paragraph({
                            text: 'Результати опитування',
                            heading: docx_1.HeadingLevel.HEADING_2,
                            spacing: { before: 400, after: 120 },
                        }),
                        ...resultsSections,
                        // ── Voters ─────────────────────────────────────────────────────────
                        ...(data.voters.length > 0 ? [
                            new docx_1.Paragraph({
                                text: 'Список учасників',
                                heading: docx_1.HeadingLevel.HEADING_2,
                                spacing: { before: 400, after: 120 },
                            }),
                            votersTable,
                        ] : []),
                        // ── Footer ─────────────────────────────────────────────────────────
                        new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `Звіт згенеровано: ${new Date(data.statistics.exportedAt).toLocaleString('uk-UA')}`,
                                    italics: true,
                                    color: '9CA3AF',
                                    size: 16,
                                }),
                            ],
                            alignment: docx_1.AlignmentType.RIGHT,
                            spacing: { before: 400 },
                        }),
                    ],
                }],
        });
        const buffer = await docx_1.Packer.toBuffer(doc);
        return buffer;
    }
}
exports.ExportService = ExportService;
//# sourceMappingURL=export.service.js.map