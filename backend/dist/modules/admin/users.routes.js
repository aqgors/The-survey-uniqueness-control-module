"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUsersRoutes = adminUsersRoutes;
async function adminUsersRoutes(fastify) {
    // @ts-ignore
    if (!fastify.adminOnly) {
        throw new Error('fastify.adminOnly is undefined. Ensure authPlugin is registered properly using fastify-plugin.');
    }
    // GET /api/admin/users
    fastify.get('/', { preValidation: [fastify.adminOnly] }, async (_req, reply) => {
        try {
            const users = await fastify.prisma.user.findMany({
                select: { id: true, email: true, name: true, role: true, isBlocked: true, createdAt: true },
                orderBy: { createdAt: 'desc' }
            });
            return reply.send({ users });
        }
        catch (err) {
            return reply.status(500).send({ error: 'Failed to load users' });
        }
    });
    // PATCH /api/admin/users/:id/role
    fastify.patch('/:id/role', { preValidation: [fastify.adminOnly] }, async (req, reply) => {
        try {
            const user = await fastify.prisma.user.update({
                where: { id: req.params.id },
                data: { role: req.body.role },
                select: { id: true, role: true }
            });
            return reply.send({ user });
        }
        catch (err) {
            return reply.status(500).send({ error: 'Failed to update user' });
        }
    });
    // PATCH /api/admin/users/:id/block
    fastify.patch('/:id/block', { preValidation: [fastify.adminOnly] }, async (req, reply) => {
        try {
            const user = await fastify.prisma.user.update({
                where: { id: req.params.id },
                data: { isBlocked: req.body.isBlocked },
                select: { id: true, isBlocked: true }
            });
            return reply.send({ user });
        }
        catch (err) {
            return reply.status(500).send({ error: 'Failed to update user' });
        }
    });
    // DELETE /api/admin/users/:id
    fastify.delete('/:id', { preValidation: [fastify.adminOnly] }, async (req, reply) => {
        try {
            await fastify.prisma.user.delete({ where: { id: req.params.id } });
            return reply.send({ success: true });
        }
        catch (err) {
            return reply.status(500).send({ error: 'Failed to delete user' });
        }
    });
}
//# sourceMappingURL=users.routes.js.map