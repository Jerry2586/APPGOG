import type { JwtModuleOptions } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';

export const JWT_ISSUER = 'appgog-api';
export const JWT_AUDIENCE = 'appgog-admin';

export function createJwtOptions(config: ConfigService): JwtModuleOptions {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  if (!secret || secret.length < 32 || /replace|change-?me|example/i.test(secret)) {
    throw new Error('JWT_SECRET 必须是至少 32 位且不可预测的随机密钥');
  }
  return {
    secret,
    signOptions: {
      expiresIn: '15m',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    }
  };
}

export function configuredAdminOrigins(config: ConfigService) {
  return [config.get<string>('APP_ORIGIN'), config.get<string>('ADMIN_ORIGIN')]
    .flatMap(value => value?.split(',') ?? [])
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
