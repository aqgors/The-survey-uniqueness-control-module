import { FastifyInstance } from 'fastify';
import { adminUsersRoutes }   from './users/users.routes';
import { adminSurveysRoutes } from './surveys/surveys.routes';
import { adminAnomaliesRoutes } from './anomalies/anomalies.routes';
import { adminExportRoutes }  from './export/admin-export.routes';

export async function adminRoutes(fastify: FastifyInstance) {
  await fastify.register(adminUsersRoutes,    { prefix: '/users' });
  await fastify.register(adminSurveysRoutes,  { prefix: '/surveys' });
  await fastify.register(adminAnomaliesRoutes, { prefix: '/anomalies' });
  await fastify.register(adminExportRoutes,   { prefix: '/export' });
}
