import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { sendVerificationCode } from '../../services/email.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ── Avatar directory ──────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export class ProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Get profile ─────────────────────────────────────────────────────────────
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, role: true,
        avatarUrl: true, createdAt: true, lastLoginAt: true,
        _count: { select: { votes: true } },
      },
    });
    return user;
  }

  // ── Upload avatar ───────────────────────────────────────────────────────────
  async uploadAvatar(userId: string, fileBuffer: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowed.includes(ext)) throw new Error('Дозволені формати: jpg, png, webp, gif');

    // Remove old avatar
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    if (user?.avatarUrl) {
      const oldFile = path.join(process.cwd(), user.avatarUrl.replace(/^\//, ''));
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }

    const filename = `${userId}-${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, fileBuffer);

    const avatarUrl = `/uploads/avatars/${filename}`;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    return avatarUrl;
  }

  // ── Request password change ─────────────────────────────────────────────────
  async requestPasswordChange(userId: string): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Користувача не знайдено');

    // Invalidate old tokens of this type
    await this.prisma.userToken.deleteMany({ where: { userId, type: 'PASSWORD_CHANGE' } });

    const code = generateCode();
    await this.prisma.userToken.create({
      data: {
        userId,
        type: 'PASSWORD_CHANGE',
        code,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await sendVerificationCode({ to: user.email, name: user.name, code, purpose: 'password' });
    console.info(`[Profile] Password change code sent to ${user.email}. Code: ${code}`);
    return { ok: true };
  }

  // ── Confirm password change ─────────────────────────────────────────────────
  async confirmPasswordChange(userId: string, code: string, newPassword: string): Promise<{ ok: boolean }> {
    const token = await this.prisma.userToken.findFirst({
      where: { userId, type: 'PASSWORD_CHANGE', code },
    });
    if (!token) throw new Error('Невірний або прострочений код');
    if (token.expiresAt < new Date()) {
      await this.prisma.userToken.delete({ where: { id: token.id } });
      throw new Error('Код прострочений. Спробуйте знову.');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    await this.prisma.userToken.deleteMany({ where: { userId, type: 'PASSWORD_CHANGE' } });
    return { ok: true };
  }

  // ── Request email change (Step 1 — old email verification) ─────────────────
  async requestEmailChange(userId: string, newEmail: string): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Користувача не знайдено');
    if (user.email === newEmail) throw new Error('Нова пошта збігається з поточною');

    const existing = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) throw new Error('Ця пошта вже використовується');

    // Invalidate old tokens
    await this.prisma.userToken.deleteMany({ where: { userId, type: { in: ['EMAIL_CHANGE_OLD', 'EMAIL_CHANGE_NEW'] } } });

    const code = generateCode();
    await this.prisma.userToken.create({
      data: {
        userId,
        type: 'EMAIL_CHANGE_OLD',
        code,
        payload: newEmail, // store new email for step 2
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await sendVerificationCode({ to: user.email, name: user.name, code, purpose: 'email_old', newEmail });
    console.info(`[Profile] Email change step1 code sent to ${user.email}. Code: ${code}`);
    return { ok: true };
  }

  // ── Confirm old email (Step 2 — send code to new email) ─────────────────────
  async confirmOldEmail(userId: string, code: string): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Користувача не знайдено');

    const token = await this.prisma.userToken.findFirst({
      where: { userId, type: 'EMAIL_CHANGE_OLD', code },
    });
    if (!token) throw new Error('Невірний або прострочений код');
    if (token.expiresAt < new Date()) {
      await this.prisma.userToken.delete({ where: { id: token.id } });
      throw new Error('Код прострочений. Спробуйте знову.');
    }

    const newEmail = token.payload!;
    // Remove old step1 token
    await this.prisma.userToken.deleteMany({ where: { userId, type: 'EMAIL_CHANGE_OLD' } });

    // Create step2 token for new email
    const code2 = generateCode();
    await this.prisma.userToken.create({
      data: {
        userId,
        type: 'EMAIL_CHANGE_NEW',
        code: code2,
        payload: newEmail,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await sendVerificationCode({ to: newEmail, name: user.name, code: code2, purpose: 'email_new' });
    console.info(`[Profile] Email change step2 code sent to ${newEmail}. Code: ${code2}`);
    return { ok: true };
  }

  // ── Confirm new email (Final step — apply change) ───────────────────────────
  async confirmNewEmail(userId: string, code: string): Promise<{ ok: boolean; newEmail: string }> {
    const token = await this.prisma.userToken.findFirst({
      where: { userId, type: 'EMAIL_CHANGE_NEW', code },
    });
    if (!token) throw new Error('Невірний або прострочений код');
    if (token.expiresAt < new Date()) {
      await this.prisma.userToken.delete({ where: { id: token.id } });
      throw new Error('Код прострочений. Спробуйте знову.');
    }

    const newEmail = token.payload!;
    await this.prisma.user.update({ where: { id: userId }, data: { email: newEmail } });
    await this.prisma.userToken.deleteMany({ where: { userId, type: 'EMAIL_CHANGE_NEW' } });
    return { ok: true, newEmail };
  }

  // ── Update display name ─────────────────────────────────────────────────────
  async updateName(userId: string, name: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
  }
}
