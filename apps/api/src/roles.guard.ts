import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminPrincipal, AdminRoleName } from './auth.types';
import { ADMIN_ROLES_METADATA } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<AdminRoleName[]>(ADMIN_ROLES_METADATA, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest().user as AdminPrincipal | undefined;
    if (!user || !required.includes(user.role)) throw new ForbiddenException('当前管理员没有执行该操作的权限');
    return true;
  }
}
