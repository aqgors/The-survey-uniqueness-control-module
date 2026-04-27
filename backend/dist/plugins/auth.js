"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authPlugin = void 0;
exports.authRoutes = authRoutes;
const jwt_1 = __importDefault(require("@fastify/jwt"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const plugin = async (fastify) => {
    await fastify.register(jwt_1.default, {
        secret: process.env.JWT_SECRET || 'supersecret_fallback',
        sign: { expiresIn: '7d' },
    });
    // Verify token
    fastify.decorate('authenticate', async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch (err) {
            reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
        }
    });
    // Verify admin role
    fastify.decorate('adminOnly', async (request, reply) => {
        try {
            await request.jwtVerify();
            if (request.user.role !== 'ADMIN') {
                reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
            }
        }
        catch (err) {
            reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
        }
    });
};
exports.authPlugin = (0, fastify_plugin_1.default)(plugin, { name: 'auth-plugin' });
async function authRoutes(fastify) {
    // @ts-ignore
    fastify.post('/login', async (request, reply) => {
        const { email, password } = request.body;
        if (!email || !password)
            return reply.status(400).send({ error: 'Email and password required' });
        // @ts-ignore
        const user = await fastify.prisma.user.findUnique({ where: { email } });
        if (!user)
            return reply.status(401).send({ error: 'Invalid credentials' });
        if (user.isBlocked)
            return reply.status(403).send({ error: 'Account is blocked' });
        const isValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isValid)
            return reply.status(401).send({ error: 'Invalid credentials' });
        // @ts-ignore
        const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role });
        return reply.send({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
    });
    // @ts-ignore
    if (!fastify.authenticate) {
        throw new Error('fastify.authenticate is undefined. Ensure authPlugin is registered properly using fastify-plugin.');
    }
    // @ts-ignore
    fastify.get('/me', { preValidation: [fastify.authenticate] }, async (request, reply) => {
        // @ts-ignore
        const user = await fastify.prisma.user.findUnique({
            where: { id: request.user.id },
            select: { id: true, email: true, name: true, role: true, isBlocked: true }
        });
        if (!user)
            return reply.code(404).send({ error: 'User not found' });
        return reply.send({ user });
    });
}
//# sourceMappingURL=auth.js.map