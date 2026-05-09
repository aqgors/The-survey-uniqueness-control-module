"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authPlugin = void 0;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
require("@fastify/jwt");
const plugin = async (fastify) => {
    // Simple Stub Auth: gets user from headers
    fastify.decorate('authenticate', async (request, reply) => {
        const userId = request.headers['x-user-id'];
        if (!userId) {
            reply.code(401).send({ error: "Неавторизовано" });
            return;
        }
        const user = await fastify.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true }
        });
        if (!user) {
            reply.code(401).send({ error: "Обліковий запис видалено або не існує" });
            return;
        }
        request.user = { id: user.id, role: user.role };
    });
};
exports.authPlugin = (0, fastify_plugin_1.default)(plugin, { name: 'auth-plugin' });
//# sourceMappingURL=auth.js.map