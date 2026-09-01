import { BadRequestException } from '@nestjs/common';
import { AdminSecurityService } from './admin-security.service';

const actor = {
  id: 'actor-1', sessionId: 'session-1', email: 'owner@appgog.local',
  displayName: '所有者', role: 'SUPER_ADMIN' as const
};

const target = {
  id: 'target-1', email: 'target@appgog.local', displayName: '目标管理员',
  role: 'SUPER_ADMIN', enabled: true, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date()
};

describe('AdminSecurityService invariants', () => {
  it('checks and protects the final enabled super administrator inside the serializable transaction', async () => {
    const tx: any = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue(target),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn()
      },
      adminSession: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() }
    };
    const db: any = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown, options: unknown) => callback(tx))
    };
    const service = new AdminSecurityService(db);

    await expect(service.updateAccount(actor, target.id, { role: 'ADMIN' }, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.adminUser.count).toHaveBeenCalledWith({ where: { role: 'SUPER_ADMIN', enabled: true } });
    expect(tx.adminUser.update).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });

  it('prevents an administrator from disabling their own account', async () => {
    const tx: any = {
      adminUser: { findUnique: jest.fn().mockResolvedValue({ ...target, id: actor.id }) }
    };
    const db: any = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new AdminSecurityService(db);

    await expect(service.updateAccount(actor, actor.id, { enabled: false }, {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
