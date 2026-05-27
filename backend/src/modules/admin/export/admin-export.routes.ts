import { FastifyInstance, FastifyRequest } from 'fastify';
import { ExportService } from '../../export/export.service';
import { AnomalyService } from '../anomalies/anomaly.service';
import ExcelJS from 'exceljs';

export async function adminExportRoutes(fastify: FastifyInstance) {
  const exportSvc  = new ExportService(fastify.prisma);
  const anomalySvc = new AnomalyService(fastify.prisma);
  const adminOrMod = [fastify.authenticate, (fastify as any).requireRole(['ADMIN', 'MODERATOR'])];
  const onlyAdmin  = [fastify.authenticate, (fastify as any).requireRole(['ADMIN'])];

  function buildDisposition(title: string, ext: string): string {
    const ts   = new Date().toISOString().slice(0, 10);
    const safe = title.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 40) || 'survey';
    return `attachment; filename="${safe}_${ts}.${ext}"; filename*=UTF-8''${encodeURIComponent(`survey_${title.slice(0, 50)}_${ts}.${ext}`)}`;
  }

  // GET /api/admin/export/surveys/:id/csv
  fastify.get('/surveys/:id/csv', {
    schema: {
      tags: ['Admin - Export'], summary: 'Admin CSV export (any survey)', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const data = await exportSvc.getSurveyExportData(req.params.id);
      if (!data) return reply.status(404).send({ error: 'Опитування не знайдено' });
      const buf = await exportSvc.generateCSV(data);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', buildDisposition(data.survey.title, 'csv'))
        .send(buf);
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Export failed' }); }
  });

  // GET /api/admin/export/surveys/:id/json
  fastify.get('/surveys/:id/json', {
    schema: {
      tags: ['Admin - Export'], summary: 'Admin JSON export', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const data = await exportSvc.getSurveyExportData(req.params.id);
      if (!data) return reply.status(404).send({ error: 'Опитування не знайдено' });
      const buf = exportSvc.generateJSON(data);
      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', buildDisposition(data.survey.title, 'json'))
        .send(buf);
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Export failed' }); }
  });

  // GET /api/admin/export/surveys/:id/excel
  fastify.get('/surveys/:id/excel', {
    schema: {
      tags: ['Admin - Export'], summary: 'Admin Excel export with anomaly sheet', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const [data, anomalyResult] = await Promise.all([
        exportSvc.getSurveyExportData(req.params.id),
        anomalySvc.listAnomalies({ surveyId: req.params.id, limit: 1000 }),
      ]);
      if (!data) return reply.status(404).send({ error: 'Опитування не знайдено' });

      const stdBuf = await exportSvc.generateExcel(data);
      const wb     = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(stdBuf) as any);

      const ws = wb.addWorksheet('Аномалії');
      ws.columns = [
        { header: 'Vote ID',      key: 'voteId',      width: 28 },
        { header: 'Risk Score',   key: 'riskScore',   width: 12 },
        { header: 'Risk Level',   key: 'riskLevel',   width: 12 },
        { header: 'Flags',        key: 'flags',       width: 35 },
        { header: 'IP Subnet',    key: 'ipSubnet',    width: 16 },
        { header: 'User Agent',   key: 'userAgent',   width: 50 },
        { header: 'Submitted At', key: 'submittedAt', width: 22 },
        { header: 'User',         key: 'user',        width: 30 },
      ];
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };

      anomalyResult.anomalies.forEach((a: any) => {
        ws.addRow({
          voteId:      a.voteId,
          riskScore:   a.riskScore,
          riskLevel:   a.riskLevel,
          flags:       a.flags.join(', '),
          ipSubnet:    a.ipSubnet ?? '-',
          userAgent:   a.userAgent,
          submittedAt: new Date(a.submittedAt).toLocaleString('uk-UA'),
          user:        a.vote?.user ? `${a.vote.user.name} <${a.vote.user.email}>` : 'Анонім',
        });
      });

      const raw = await wb.xlsx.writeBuffer();
      const finalBuf = Buffer.from(raw as ArrayBuffer);
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', buildDisposition(data.survey.title, 'xlsx'))
        .send(finalBuf);
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Export failed' }); }
  });

  // GET /api/admin/export/anomalies/excel
  fastify.get('/anomalies/excel', {
    schema: {
      tags: ['Admin - Export'], summary: 'Export all anomalies as Excel', security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          surveyId:  { type: 'string' },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          dateFrom:  { type: 'string' },
          dateTo:    { type: 'string' },
        },
      },
    },
    preValidation: adminOrMod,
  }, async (req: FastifyRequest<{ Querystring: any }>, reply) => {
    try {
      const q = req.query as Record<string, any>;
      const result = await anomalySvc.listAnomalies({ surveyId: q.surveyId, riskLevel: q.riskLevel, dateFrom: q.dateFrom, dateTo: q.dateTo, limit: 5000 });

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Survey CMS';
      wb.created = new Date();

      const ws = wb.addWorksheet('Аномалії');
      ws.columns = [
        { header: 'Vote ID',      key: 'voteId',      width: 28 },
        { header: 'Survey',       key: 'survey',      width: 35 },
        { header: 'Risk Score',   key: 'riskScore',   width: 12 },
        { header: 'Risk Level',   key: 'riskLevel',   width: 12 },
        { header: 'Flags',        key: 'flags',       width: 40 },
        { header: 'IP Subnet',    key: 'ipSubnet',    width: 16 },
        { header: 'User Agent',   key: 'userAgent',   width: 50 },
        { header: 'Submitted At', key: 'submittedAt', width: 22 },
        { header: 'User',         key: 'user',        width: 30 },
      ];
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16213E' } };

      result.anomalies.forEach((a: any) => {
        const row = ws.addRow({
          voteId:      a.voteId,
          survey:      a.vote?.survey?.title ?? a.surveyId,
          riskScore:   a.riskScore,
          riskLevel:   a.riskLevel,
          flags:       a.flags.join(', '),
          ipSubnet:    a.ipSubnet ?? '-',
          userAgent:   a.userAgent,
          submittedAt: new Date(a.submittedAt).toLocaleString('uk-UA'),
          user:        a.vote?.user ? `${a.vote.user.name}` : 'Анонім',
        });
        if (a.riskScore >= 80) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
        else if (a.riskScore >= 50) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
      });

      const raw = await wb.xlsx.writeBuffer();
      const buf = Buffer.from(raw as ArrayBuffer);
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', buildDisposition('anomalies', 'xlsx'))
        .send(buf);
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Export failed' }); }
  });
}
