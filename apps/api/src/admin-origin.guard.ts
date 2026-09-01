import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { configuredAdminOrigins } from './security.config';

@Injectable()
export class AdminOriginGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const origin = request.headers.origin?.replace(/\/$/, '');
    const allowed = configuredAdminOrigins(this.config);
    const production = this.config.get<string>('NODE_ENV') === 'production';
    if (!origin && !production) return true;
    if (!origin || !allowed.includes(origin)) throw new ForbiddenException('请求来源不在 APPGOG 管理后台白名单');
    return true;
  }
}
