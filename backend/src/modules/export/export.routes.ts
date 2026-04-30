import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ExportService } from './export.service';

type ExportParams = { Params: { id: string } };

const exportSchema = (format: string, summary: string, contentType: string) => ({
  tags: ['Export'],
  summary,
  description: `Only the survey owner can export. Requires x-user-id header matching survey createdById.`,
  security: [{ BearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', description: 'Survey ID' } },
  },
  response: {
    200: { description: `${format} file download`, type: 'string' },
    401: { description: 'Unauthorized',  type: 'object', properties: { error: { type: 'string' } } },
    403: { description: 'Forbidden',     type: 'object', properties: { error: { type: 'string' } } },
    404: { description: 'Survey not found', type: 'object', properties: { error: { type: 'string' } } },
    500: { description: 'Server error',  type: 'object', properties: { error: { type: 'string' } } },
  },
  produces: [contentType],
});

export async function exportRoutes(fastify: FastifyInstance) {
  const exportService = new ExportService(fastify.prisma);

  // ── Shared access-check helper ─────────────────────────────────────────────
  async function checkOwner(
    req: FastifyRequest<ExportParams>,
    reply: FastifyReply
  ) {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;

    if (!userId) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Необхідна авторизація' });
      return null;
    }

    const data = await exportService.getSurveyExportData(id);
    if (!data) {
      reply.code(404).send({ error: 'Not found', message: 'Опитування не знайдено' });
      return null;
    }

    if (data.survey.createdById !== userId) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Тільки автор опитування може завантажити звіт',
      });
      return null;
    }

    return data;
  }

  // ── Filename helpers ───────────────────────────────────────────────────────

  /**
   * Build a safe ASCII fallback filename (no Cyrillic/special chars).
   * Also builds the RFC 5987 encoded version for full UTF-8 support.
   */
  function buildDisposition(title: string, ext: string): string {
    const ts = new Date().toISOString().slice(0, 10);

    // ASCII-only fallback: keep letters, digits, spaces, hyphens
    const ascii = title
      .normalize('NFD')                       // decompose accented letters
      .replace(/[\u0300-\u036f]/g, '')        // strip combining marks
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')     // keep ASCII only
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 50) || 'survey';

    const fallbackName = `${ascii}_${ts}.${ext}`;

    // Full UTF-8 name (Cyrillic intact) encoded per RFC 5987
    const fullName = `survey_${title.slice(0, 60)}_${ts}.${ext}`;
    const encodedName = encodeURIComponent(fullName);

    // Both: ASCII fallback for old clients, UTF-8* for modern ones
    return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
  }

  // ── GET /api/export/survey/:id/csv ─────────────────────────────────────────
  fastify.get(
    '/survey/:id/csv',
    {
      schema: exportSchema('CSV', 'Export survey results as CSV', 'text/csv'),
      preValidation: [(fastify as any).authenticate],
    },
    async (req: FastifyRequest<ExportParams>, reply: FastifyReply) => {
      try {
        const data = await checkOwner(req, reply);
        if (!data) return;

        const buffer = await exportService.generateCSV(data);

        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', buildDisposition(data.survey.title, 'csv'))
          .header('Content-Length', buffer.length)
          .send(buffer);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Export failed' });
      }
    }
  );

  // ── GET /api/export/survey/:id/json ────────────────────────────────────────
  fastify.get(
    '/survey/:id/json',
    {
      schema: exportSchema('JSON', 'Export survey results as JSON', 'application/json'),
      preValidation: [(fastify as any).authenticate],
    },
    async (req: FastifyRequest<ExportParams>, reply: FastifyReply) => {
      try {
        const data = await checkOwner(req, reply);
        if (!data) return;

        const buffer = exportService.generateJSON(data);

        return reply
          .header('Content-Type', 'application/json; charset=utf-8')
          .header('Content-Disposition', buildDisposition(data.survey.title, 'json'))
          .header('Content-Length', buffer.length)
          .send(buffer);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Export failed' });
      }
    }
  );

  // ── GET /api/export/survey/:id/excel ───────────────────────────────────────
  fastify.get(
    '/survey/:id/excel',
    {
      schema: exportSchema(
        'Excel',
        'Export survey results as Excel (.xlsx)',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ),
      preValidation: [(fastify as any).authenticate],
    },
    async (req: FastifyRequest<ExportParams>, reply: FastifyReply) => {
      try {
        const data = await checkOwner(req, reply);
        if (!data) return;

        const buffer = await exportService.generateExcel(data);

        return reply
          .header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          )
          .header('Content-Disposition', buildDisposition(data.survey.title, 'xlsx'))
          .header('Content-Length', buffer.length)
          .send(buffer);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Export failed' });
      }
    }
  );

  // ── GET /api/export/survey/:id/docx ────────────────────────────────────────
  fastify.get(
    '/survey/:id/docx',
    {
      schema: exportSchema(
        'DOCX',
        'Export survey results as Word document (.docx)',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ),
      preValidation: [(fastify as any).authenticate],
    },
    async (req: FastifyRequest<ExportParams>, reply: FastifyReply) => {
      try {
        const data = await checkOwner(req, reply);
        if (!data) return;

        const buffer = await exportService.generateDOCX(data);

        return reply
          .header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          )
          .header('Content-Disposition', buildDisposition(data.survey.title, 'docx'))
          .header('Content-Length', buffer.length)
          .send(buffer);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Export failed' });
      }
    }
  );
}
