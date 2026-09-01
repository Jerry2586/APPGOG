import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AdminPermissionGuard } from './admin-permission.guard';
import type { AdminRoleName } from './auth.types';

function context(role: AdminRoleName, method: string, model: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, params: { model }, path: `/admin/${model}`, user: { role } })
    })
  } as ExecutionContext;
}

describe('AdminPermissionGuard', () => {
  const guard = new AdminPermissionGuard();

  it('allows viewers to read content resources', () => {
    expect(guard.canActivate(context('VIEWER', 'GET', 'page'))).toBe(true);
  });

  it('denies viewers from writing', () => {
    expect(() => guard.canActivate(context('VIEWER', 'PATCH', 'page'))).toThrow(ForbiddenException);
  });

  it('allows editors to edit pages but not delete them', () => {
    expect(guard.canActivate(context('EDITOR', 'PATCH', 'page'))).toBe(true);
    expect(() => guard.canActivate(context('EDITOR', 'DELETE', 'page'))).toThrow(ForbiddenException);
  });

  it('allows admins to manage themes', () => {
    expect(guard.canActivate(context('ADMIN', 'POST', 'theme'))).toBe(true);
  });

  it('protects executable plugins with the super-admin role', () => {
    expect(() => guard.canActivate(context('ADMIN', 'GET', 'pluginSnippet'))).toThrow(ForbiddenException);
    expect(guard.canActivate(context('SUPER_ADMIN', 'PATCH', 'pluginSnippet'))).toBe(true);
  });
});
