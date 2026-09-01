import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import type { AdminPrincipal } from './auth.types';
import { assertStrongPassword } from './password-policy';
import { PrismaService } from './prisma.service';

type RequestMetadata = { ip?: string; userAgent?: string };
type CreateAccountInput = { email: string; displayName: string; password: string; role: AdminRole };
type UpdateAccountInput = { displayName?: string; role?: AdminRole; enabled?: boolean };

const publicAccountSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  enabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
} as const;

@Injectable()
export class AdminSecurityService {
  constructor(private db: PrismaService) {}

  private strongPassword(password: string, email: string) {
    try {
      assertStrongPassword(password, email);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  listAccounts() {
    return this.db.adminUser.findMany({ select: publicAccountSelect, orderBy: { createdAt: 'asc' } });
  }

  async createAccount(actor: AdminPrincipal, input: CreateAccountInput, metadata: RequestMetadata) {
    const email = input.email.trim().toLowerCase();
    this.strongPassword(input.password, email);
    const existing = await this.db.adminUser.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('管理员邮箱已经存在');
    const passwordHash = await hash(input.password, 12);

    return this.db.$transaction(async tx => {
      const account = await tx.adminUser.create({
        data: { email, displayName: input.displayName.trim(), passwordHash, role: input.role },
        select: publicAccountSelect
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actor.id,
          action: 'ADMIN_ACCOUNT_CREATED',
          resource: 'ADMIN_USER',
          resourceId: account.id,
          after: { email: account.email, displayName: account.displayName, role: account.role, enabled: account.enabled },
          ip: metadata.ip,
          userAgent: metadata.userAgent?.slice(0, 2000)
        }
      });
      return account;
    });
  }

  async updateAccount(actor: AdminPrincipal, id: string, input: UpdateAccountInput, metadata: RequestMetadata) {
    return this.db.$transaction(async tx => {
      const current = await tx.adminUser.findUnique({ where: { id }, select: publicAccountSelect });
      if (!current) throw new NotFoundException('管理员不存在');
      if (actor.id === id && (input.enabled === false || (input.role && input.role !== current.role))) {
        throw new BadRequestException('不能停用或修改自己的角色');
      }
      const removesSuperAdmin = current.role === 'SUPER_ADMIN'
        && (input.enabled === false || (input.role && input.role !== 'SUPER_ADMIN'));
      if (current.enabled && removesSuperAdmin) {
        // The count and update belong to one serializable transaction so two
        // concurrent demotions cannot both remove the final super administrator.
        const enabledSuperAdmins = await tx.adminUser.count({ where: { role: 'SUPER_ADMIN', enabled: true } });
        if (enabledSuperAdmins <= 1) throw new BadRequestException('必须至少保留一个启用的超级管理员');
      }

      const account = await tx.adminUser.update({
        where: { id },
        data: {
          displayName: input.displayName?.trim(),
          role: input.role,
          enabled: input.enabled
        },
        select: publicAccountSelect
      });
      if (input.role !== undefined || input.enabled !== undefined) {
        await tx.adminSession.updateMany({ where: { adminUserId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          adminUserId: actor.id,
          action: 'ADMIN_ACCOUNT_UPDATED',
          resource: 'ADMIN_USER',
          resourceId: id,
          before: { displayName: current.displayName, role: current.role, enabled: current.enabled },
          after: { displayName: account.displayName, role: account.role, enabled: account.enabled },
          ip: metadata.ip,
          userAgent: metadata.userAgent?.slice(0, 2000)
        }
      });
      return account;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resetPassword(actor: AdminPrincipal, id: string, password: string, metadata: RequestMetadata) {
    const account = await this.db.adminUser.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('管理员不存在');
    this.strongPassword(password, account.email);
    if (await compare(password, account.passwordHash)) throw new BadRequestException('新密码不能与当前密码相同');
    const passwordHash = await hash(password, 12);
    await this.db.$transaction([
      this.db.adminUser.update({ where: { id }, data: { passwordHash } }),
      this.db.adminSession.updateMany({ where: { adminUserId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.db.auditLog.create({
        data: {
          adminUserId: actor.id,
          action: 'ADMIN_PASSWORD_RESET',
          resource: 'ADMIN_USER',
          resourceId: id,
          ip: metadata.ip,
          userAgent: metadata.userAgent?.slice(0, 2000)
        }
      })
    ]);
  }

  listAccountSessions(id: string) {
    return this.db.adminSession.findMany({
      where: { adminUserId: id },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async revokeAccountSession(actor: AdminPrincipal, accountId: string, sessionId: string, metadata: RequestMetadata) {
    const result = await this.db.adminSession.updateMany({
      where: { id: sessionId, adminUserId: accountId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (!result.count) throw new NotFoundException('活动会话不存在');
    await this.db.auditLog.create({
      data: {
        adminUserId: actor.id,
        action: 'ADMIN_SESSION_FORCE_REVOKED',
        resource: 'ADMIN_SESSION',
        resourceId: sessionId,
        detail: { accountId },
        ip: metadata.ip,
        userAgent: metadata.userAgent?.slice(0, 2000)
      }
    });
  }

  listAuditLogs(limit: number) {
    return this.db.auditLog.findMany({
      take: Math.min(200, Math.max(1, limit)),
      orderBy: { createdAt: 'desc' },
      include: { adminUser: { select: { id: true, email: true, displayName: true, role: true } } }
    });
  }
}
