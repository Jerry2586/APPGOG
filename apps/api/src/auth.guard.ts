import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload, AdminPrincipal, AdminRoleName } from './auth.types';
import { ADMIN_ROLES } from './auth.types';
import { PrismaService } from './prisma.service';
import { JWT_AUDIENCE, JWT_ISSUER } from './security.config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwt: JwtService, private db: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i) : null;
    if (!match) throw new UnauthorizedException('请登录 APPGOG 管理后台');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(match[1], {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      });
    } catch {
      throw new UnauthorizedException('管理会话已失效，请重新登录');
    }
    if (payload.type !== 'access' || !payload.sub || !payload.sid || !ADMIN_ROLES.includes(payload.role)) {
      throw new UnauthorizedException('管理令牌无效');
    }

    const session = await this.db.adminSession.findUnique({
      where: { id: payload.sid },
      include: { adminUser: true }
    });
    const now = new Date();
    if (!session || session.adminUserId !== payload.sub || session.revokedAt || session.expiresAt <= now || !session.adminUser.enabled) {
      throw new UnauthorizedException('管理会话已撤销或过期');
    }
    if (session.adminUser.role !== payload.role) {
      await this.db.adminSession.update({ where: { id: session.id }, data: { revokedAt: now } });
      throw new UnauthorizedException('管理员权限已变化，请重新登录');
    }

    const principal: AdminPrincipal = {
      id: session.adminUser.id,
      sessionId: session.id,
      email: session.adminUser.email,
      displayName: session.adminUser.displayName,
      role: session.adminUser.role as AdminRoleName
    };
    request.user = principal;
    return true;
  }
}
