import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type AdminUser } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ACCESS_TOKEN_TTL_SECONDS, type AccessTokenPayload, type AdminPrincipal, type AdminRoleName } from './auth.types';
import { assertStrongPassword } from './password-policy';
import { PrismaService } from './prisma.service';

const DUMMY_PASSWORD_HASH = '$2b$12$4MFRFpGoSeWzsMpecQVpzu184pNZFwS6r7aY3DJz8Vp/V5ch1JF.y';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 30 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;

type IssuedAuth = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; email: string; name: string; role: AdminRoleName };
};

@Injectable()
export class AuthService {
  constructor(private db: PrismaService, private jwt: JwtService, private config: ConfigService) {}

  private refreshTtlMs() {
    const configured = Number(this.config.get<string>('ADMIN_REFRESH_TTL_DAYS') || 7);
    const days = Number.isFinite(configured) ? Math.min(30, Math.max(1, configured)) : 7;
    return days * 24 * 60 * 60 * 1000;
  }

  private loginKey(email: string, ip: string) {
    return createHash('sha256').update(`${email}\n${ip}`).digest('hex');
  }

  private emailHash(email: string) {
    return createHash('sha256').update(email).digest('hex');
  }

  private tokenHash(secret: string) {
    return createHash('sha256').update(secret).digest('hex');
  }

  private tokenMatches(secret: string, expectedHash: string) {
    const actual = Buffer.from(this.tokenHash(secret), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private parseRefreshToken(token?: string) {
    if (!token) throw new UnauthorizedException('刷新会话不存在');
    const [sessionId, secret, extra] = token.split('.');
    if (!sessionId || !secret || extra) throw new UnauthorizedException('刷新会话无效');
    return { sessionId, secret };
  }

  private async assertLoginAllowed(keyHash: string) {
    const attempt = await this.db.adminLoginAttempt.findUnique({ where: { keyHash } });
    if (attempt?.blockedUntil && attempt.blockedUntil > new Date()) {
      throw new HttpException('登录尝试过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordLoginFailure(keyHash: string) {
    const now = new Date();
    await this.db.$transaction(async tx => {
      const current = await tx.adminLoginAttempt.findUnique({ where: { keyHash } });
      const expiredWindow = !current || now.getTime() - current.windowStartedAt.getTime() >= LOGIN_WINDOW_MS;
      const failureCount = expiredWindow ? 1 : current.failureCount + 1;
      const blockedUntil = failureCount >= MAX_LOGIN_FAILURES ? new Date(now.getTime() + LOGIN_BLOCK_MS) : null;
      await tx.adminLoginAttempt.upsert({
        where: { keyHash },
        create: { keyHash, failureCount, windowStartedAt: now, blockedUntil },
        update: {
          failureCount,
          windowStartedAt: expiredWindow ? now : current.windowStartedAt,
          blockedUntil
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private accessToken(user: AdminUser, sessionId: string) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      role: user.role as AdminRoleName,
      type: 'access'
    };
    return this.jwt.signAsync(payload);
  }

  private publicUser(user: AdminUser) {
    return { id: user.id, email: user.email, name: user.displayName, role: user.role as AdminRoleName };
  }

  private async newSession(user: AdminUser, ip: string, userAgent?: string): Promise<IssuedAuth> {
    const sessionId = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs());
    const accessToken = await this.accessToken(user, sessionId);
    await this.db.adminSession.create({
      data: {
        id: sessionId,
        adminUserId: user.id,
        tokenHash: this.tokenHash(secret),
        ip,
        userAgent: userAgent?.slice(0, 2000),
        expiresAt: refreshExpiresAt
      }
    });
    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: `${sessionId}.${secret}`,
      refreshExpiresAt,
      user: this.publicUser(user)
    };
  }

  async adminLogin(emailInput: string, password: string, ip: string, userAgent?: string) {
    const email = emailInput.trim().toLowerCase();
    const keyHash = this.loginKey(email, ip);
    await this.assertLoginAllowed(keyHash);

    const user = await this.db.adminUser.findUnique({ where: { email } });
    const passwordValid = await compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !user.enabled || !passwordValid) {
      await this.recordLoginFailure(keyHash);
      await this.db.auditLog.create({
        data: {
          adminUserId: user?.id,
          action: 'ADMIN_LOGIN_FAILED',
          resource: 'ADMIN_AUTH',
          ip,
          userAgent: userAgent?.slice(0, 2000),
          detail: { emailHash: this.emailHash(email) }
        }
      });
      throw new UnauthorizedException('账号或密码错误');
    }

    await this.db.$transaction([
      this.db.adminLoginAttempt.deleteMany({ where: { keyHash } }),
      this.db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.db.auditLog.create({
        data: { adminUserId: user.id, action: 'ADMIN_LOGIN_SUCCEEDED', resource: 'ADMIN_AUTH', ip, userAgent: userAgent?.slice(0, 2000) }
      })
    ]);
    return this.newSession(user, ip, userAgent);
  }

  async refresh(refreshToken?: string) {
    const { sessionId, secret } = this.parseRefreshToken(refreshToken);
    const session = await this.db.adminSession.findUnique({ where: { id: sessionId }, include: { adminUser: true } });
    const now = new Date();
    if (!session) throw new UnauthorizedException('刷新会话无效');
    if (!this.tokenMatches(secret, session.tokenHash)) {
      await this.db.$transaction([
        this.db.adminSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } }),
        this.db.auditLog.create({
          data: { adminUserId: session.adminUserId, action: 'ADMIN_REFRESH_REUSE_DETECTED', resource: 'ADMIN_SESSION', resourceId: session.id }
        })
      ]);
      throw new UnauthorizedException('检测到刷新令牌重复使用，会话已撤销');
    }
    if (session.revokedAt || session.expiresAt <= now || !session.adminUser.enabled) {
      throw new UnauthorizedException('刷新会话已撤销或过期');
    }

    const nextSecret = randomBytes(48).toString('base64url');
    const result = await this.db.adminSession.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { tokenHash: this.tokenHash(nextSecret), lastUsedAt: now }
    });
    if (result.count !== 1) {
      await this.db.adminSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
      throw new UnauthorizedException('刷新令牌已被轮换，会话已撤销');
    }

    return {
      accessToken: await this.accessToken(session.adminUser, session.id),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: `${session.id}.${nextSecret}`,
      refreshExpiresAt: session.expiresAt,
      user: this.publicUser(session.adminUser)
    } satisfies IssuedAuth;
  }

  async logout(refreshToken: string | undefined, principal?: AdminPrincipal) {
    if (!refreshToken) return;
    let parsed: { sessionId: string; secret: string };
    try {
      parsed = this.parseRefreshToken(refreshToken);
    } catch {
      return;
    }
    const session = await this.db.adminSession.findUnique({ where: { id: parsed.sessionId } });
    if (!session || !this.tokenMatches(parsed.secret, session.tokenHash)) return;
    await this.db.$transaction([
      this.db.adminSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.db.auditLog.create({
        data: { adminUserId: principal?.id || session.adminUserId, action: 'ADMIN_LOGOUT', resource: 'ADMIN_SESSION', resourceId: session.id }
      })
    ]);
  }

  async listSessions(principal: AdminPrincipal) {
    const sessions = await this.db.adminSession.findMany({
      where: { adminUserId: principal.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true }
    });
    return sessions.map(session => ({ ...session, current: session.id === principal.sessionId }));
  }

  async revokeSession(principal: AdminPrincipal, sessionId: string) {
    const result = await this.db.adminSession.updateMany({
      where: { id: sessionId, adminUserId: principal.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (!result.count) throw new BadRequestException('会话不存在或已经撤销');
    await this.db.auditLog.create({
      data: { adminUserId: principal.id, action: 'ADMIN_SESSION_REVOKED', resource: 'ADMIN_SESSION', resourceId: sessionId }
    });
  }

  async revokeAllSessions(principal: AdminPrincipal) {
    const now = new Date();
    await this.db.$transaction([
      this.db.adminSession.updateMany({ where: { adminUserId: principal.id, revokedAt: null }, data: { revokedAt: now } }),
      this.db.auditLog.create({
        data: { adminUserId: principal.id, action: 'ADMIN_ALL_SESSIONS_REVOKED', resource: 'ADMIN_SESSION' }
      })
    ]);
  }

  async changeOwnPassword(principal: AdminPrincipal, currentPassword: string, nextPassword: string) {
    const user = await this.db.adminUser.findUniqueOrThrow({ where: { id: principal.id } });
    if (!(await compare(currentPassword, user.passwordHash))) throw new UnauthorizedException('当前密码不正确');
    try {
      assertStrongPassword(nextPassword, user.email);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (await compare(nextPassword, user.passwordHash)) throw new BadRequestException('新密码不能与当前密码相同');
    const passwordHash = await hash(nextPassword, 12);
    await this.db.$transaction([
      this.db.adminUser.update({ where: { id: user.id }, data: { passwordHash } }),
      this.db.adminSession.updateMany({ where: { adminUserId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.db.auditLog.create({ data: { adminUserId: user.id, action: 'ADMIN_PASSWORD_CHANGED', resource: 'ADMIN_USER', resourceId: user.id } })
    ]);
  }
}
