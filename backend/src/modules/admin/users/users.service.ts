import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  sendBlockedEmail,
  sendUnblockedEmail,
  sendDeletedEmail,
} from '../../../services/email.service';

export class AdminUsersService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── List users ────────────────────────────────────────────────────────────
  async listUsers(params: {
    page?: number; limit?: number; search?: string;
    role?: string; isBlocked?: boolean;
    sortBy?: string; sortOrder?: 'asc' | 'desc';
  }) {
    const { page = 1, limit = 20, search, role, isBlocked, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.OR = [
      { name:  { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
    if (role)                    where.role      = role;
    if (isBlocked !== undefined) where.isBlocked = isBlocked;

    const validSort = ['createdAt', 'name', 'email', 'role', 'lastLoginAt'];
    const orderField = validSort.includes(sortBy) ? sortBy : 'createdAt';

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where, skip, take: limit,
        orderBy: { [orderField]: sortOrder },
        select: {
          id: true, email: true, name: true, role: true,
          isBlocked: true, blockedAt: true, blockedReason: true,
          lastLoginAt: true, createdAt: true, updatedAt: true,
          _count: { select: { votes: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ── Single user ───────────────────────────────────────────────────────────
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, role: true,
        isBlocked: true, blockedAt: true, blockedReason: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
        _count: { select: { votes: true } },
      },
    });
    if (!user) return null;
    const recentVotes = await this.prisma.vote.findMany({
      where: { voterUserId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, createdAt: true, survey: { select: { id: true, title: true } } },
    });
    return { ...user, recentVotes };
  }

  // ── Change role ───────────────────────────────────────────────────────────
  async changeRole(id: string, role: 'USER' | 'MODERATOR' | 'ADMIN', actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    const updated = await this.prisma.user.update({
      where: { id }, data: { role: role as any },
      select: { id: true, email: true, name: true, role: true },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'ROLE_CHANGED', targetType: 'USER', targetId: id, meta: { oldRole: user.role, newRole: role } },
    });
    return updated;
  }

  // ── Block / Unblock + email ───────────────────────────────────────────────
  async toggleBlock(id: string, block: boolean, reason: string | undefined, actorId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    const user  = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isBlocked:     block,
        blockedAt:     block ? new Date() : null,
        blockedReason: block ? (reason ?? null) : null,
      },
      select: { id: true, email: true, name: true, isBlocked: true, blockedAt: true, blockedReason: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:     block ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
        targetType: 'USER',
        targetId:   id,
        meta:       { reason },
      },
    });

    // Send email notification (non-blocking)
    if (block) {
      sendBlockedEmail({ to: user.email, name: user.name, reason, blockedBy: actor?.name ?? 'Адміністратор' });
    } else {
      sendUnblockedEmail({ to: user.email, name: user.name });
    }

    return updated;
  }

  // ── Delete + email ────────────────────────────────────────────────────────
  async deleteUser(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    // Save data before delete
    const { email, name } = user;

    await this.prisma.user.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: { actorId, action: 'USER_DELETED', targetType: 'USER', targetId: id, meta: { email, name } },
    }).catch(() => {}); // audit log might fail if actor was also deleted

    // Send deletion email (non-blocking)
    sendDeletedEmail({ to: email, name });

    return { success: true };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  async getStats() {
    const [total, admins, moderators, blocked, newThisWeek] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.user.count({ where: { role: 'MODERATOR' } }),
      this.prisma.user.count({ where: { isBlocked: true } }),
      this.prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
    ]);
    return { total, admins, moderators, blocked, newThisWeek };
  }


}
