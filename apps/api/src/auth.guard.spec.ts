import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './auth.guard';

function context(authorization = 'Bearer valid-token') {
  const request: any = { headers: { authorization } };
  return {
    request,
    context: { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext
  };
}

const user = {
  id: 'admin-1',
  email: 'admin@appgog.local',
  displayName: '管理员',
  role: 'ADMIN',
  enabled: true
};

describe('AdminGuard', () => {
  it('binds a valid JWT to an active database session', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: user.id, sid: 'session-1', role: 'ADMIN', type: 'access' }) };
    const db = { adminSession: { findUnique: jest.fn().mockResolvedValue({ id: 'session-1', adminUserId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), adminUser: user }), update: jest.fn() } };
    const guard = new AdminGuard(jwt as any, db as any);
    const target = context();

    await expect(guard.canActivate(target.context)).resolves.toBe(true);
    expect(target.request.user).toMatchObject({ id: user.id, sessionId: 'session-1', role: 'ADMIN' });
  });

  it('rejects a revoked database session', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: user.id, sid: 'session-1', role: 'ADMIN', type: 'access' }) };
    const db = { adminSession: { findUnique: jest.fn().mockResolvedValue({ id: 'session-1', adminUserId: user.id, revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), adminUser: user }) } };
    const guard = new AdminGuard(jwt as any, db as any);

    await expect(guard.canActivate(context().context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes a session when the administrator role changed', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: user.id, sid: 'session-1', role: 'EDITOR', type: 'access' }) };
    const update = jest.fn().mockResolvedValue({});
    const db = { adminSession: { findUnique: jest.fn().mockResolvedValue({ id: 'session-1', adminUserId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), adminUser: user }), update } };
    const guard = new AdminGuard(jwt as any, db as any);

    await expect(guard.canActivate(context().context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-1' } }));
  });

  it('rejects a malformed Authorization header before database access', async () => {
    const db = { adminSession: { findUnique: jest.fn() } };
    const guard = new AdminGuard({ verifyAsync: jest.fn() } as any, db as any);

    await expect(guard.canActivate(context('Basic abc').context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.adminSession.findUnique).not.toHaveBeenCalled();
  });
});
