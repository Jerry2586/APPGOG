import { HttpException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

function serviceWith(dbOverrides: Record<string, unknown> = {}) {
  const db: any = {
    adminLoginAttempt: { findUnique: jest.fn().mockResolvedValue(null) },
    adminUser: { findUnique: jest.fn() },
    adminSession: { findUnique: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (input: unknown) => Array.isArray(input) ? Promise.all(input) : undefined),
    ...dbOverrides
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
  const config = { get: jest.fn((key: string) => key === 'ADMIN_REFRESH_TTL_DAYS' ? '7' : undefined) };
  return { service: new AuthService(db, jwt as any, config as any), db, jwt };
}

const admin = {
  id: 'admin-1',
  email: 'admin@appgog.local',
  displayName: '管理员',
  passwordHash: 'unused',
  role: 'ADMIN',
  enabled: true
};

describe('AuthService session security', () => {
  it('rotates a valid refresh secret and issues a short-lived access token', async () => {
    const session = {
      id: 'session-1',
      adminUserId: admin.id,
      tokenHash: hashToken('old-secret'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      adminUser: admin
    };
    const { service, db, jwt } = serviceWith({
      adminSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    });

    const result = await service.refresh('session-1.old-secret');

    expect(result.refreshToken).toMatch(/^session-1\.[A-Za-z0-9_-]{64}$/);
    expect(result.expiresIn).toBe(900);
    expect(db.adminSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'session-1', tokenHash: session.tokenHash })
    }));
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sid: 'session-1', type: 'access' }));
  });

  it('revokes the session when a rotated refresh token is replayed', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn().mockResolvedValue({});
    const db: any = {
      adminLoginAttempt: { findUnique: jest.fn() },
      adminUser: { findUnique: jest.fn() },
      adminSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1', adminUserId: admin.id, tokenHash: hashToken('new-secret'), revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000), adminUser: admin
        }),
        updateMany
      },
      auditLog: { create: auditCreate },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations))
    };
    const service = new AuthService(db, { signAsync: jest.fn() } as any, { get: jest.fn() } as any);

    await expect(service.refresh('session-1.old-secret')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ADMIN_REFRESH_REUSE_DETECTED' })
    }));
  });

  it('blocks login before password verification while the database limiter is active', async () => {
    const { service, db } = serviceWith({
      adminLoginAttempt: {
        findUnique: jest.fn().mockResolvedValue({ blockedUntil: new Date(Date.now() + 60_000) })
      }
    });

    await expect(service.adminLogin('admin@appgog.local', 'anything', '127.0.0.1')).rejects.toBeInstanceOf(HttpException);
    expect(db.adminUser.findUnique).not.toHaveBeenCalled();
  });
});
