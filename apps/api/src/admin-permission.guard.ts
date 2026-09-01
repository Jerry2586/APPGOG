import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AdminPrincipal, AdminRoleName } from './auth.types';

const includesRole = (role: AdminRoleName, allowed: AdminRoleName[]) => allowed.includes(role);

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AdminPrincipal | undefined;
    if (!user) throw new ForbiddenException('缺少管理员身份');

    const method = String(request.method).toUpperCase();
    const resource = String(request.params?.model || (request.path.includes('/page/') ? 'page' : ''));
    const contentResources = ['page', 'category', 'content', 'product'];
    const operationalResources = ['theme', 'themeSchedule', 'marketingCampaign', 'outboundLink'];
    const sensitiveResources = ['globalSetting', 'pluginSnippet'];

    if (method === 'GET') {
      if (sensitiveResources.includes(resource) && user.role !== 'SUPER_ADMIN') return this.deny();
      if (resource === 'outboundLink' && !includesRole(user.role, ['ADMIN', 'SUPER_ADMIN'])) return this.deny();
      return true;
    }
    if (contentResources.includes(resource)) {
      const allowed = method === 'DELETE' ? ['ADMIN', 'SUPER_ADMIN'] : ['EDITOR', 'ADMIN', 'SUPER_ADMIN'];
      if (!includesRole(user.role, allowed as AdminRoleName[])) return this.deny();
      return true;
    }
    if (operationalResources.includes(resource)) {
      if (!includesRole(user.role, ['ADMIN', 'SUPER_ADMIN'])) return this.deny();
      return true;
    }
    if (sensitiveResources.includes(resource)) {
      if (user.role !== 'SUPER_ADMIN') return this.deny();
      return true;
    }
    return this.deny();
  }

  private deny(): false {
    throw new ForbiddenException('当前管理员没有管理该资源的权限');
  }
}
