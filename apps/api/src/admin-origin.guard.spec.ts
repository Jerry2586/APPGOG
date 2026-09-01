import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { AdminOriginGuard } from './admin-origin.guard';

function context(origin?: string) {
  return { switchToHttp: () => ({ getRequest: () => ({ headers: { origin } }) }) } as ExecutionContext;
}

function config(nodeEnv: string) {
  const values: Record<string, string> = { NODE_ENV: nodeEnv, APP_ORIGIN: 'https://app.example.com', ADMIN_ORIGIN: 'https://admin.example.com' };
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('AdminOriginGuard', () => {
  it('accepts a configured production origin', () => {
    expect(new AdminOriginGuard(config('production')).canActivate(context('https://admin.example.com'))).toBe(true);
  });

  it('rejects a foreign production origin', () => {
    expect(() => new AdminOriginGuard(config('production')).canActivate(context('https://evil.example'))).toThrow(ForbiddenException);
  });

  it('rejects a missing Origin header in production', () => {
    expect(() => new AdminOriginGuard(config('production')).canActivate(context())).toThrow(ForbiddenException);
  });

  it('allows origin-less local tools outside production', () => {
    expect(new AdminOriginGuard(config('development')).canActivate(context())).toBe(true);
  });
});
