"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authPlugin = void 0;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const plugin = async (fastify) => {
    // Simple Stub Auth: gets user from headers
    fastify.decorate('authenticate', async (request, reply) => {
        const userId = request.headers['x-user-id'];
        if (!userId) {
            reply.code(401).send({ message: "Unauthorized" });
            return;
        }
        request.user = { id: userId, role: 'USER' };
    });
};
exports.authPlugin = (0, fastify_plugin_1.default)(plugin, { name: 'auth-plugin' });
//# sourceMappingURL=auth.js.map