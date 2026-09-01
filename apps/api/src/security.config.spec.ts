import type { ConfigService } from '@nestjs/config';
import { configuredAdminOrigins, createJwtOptions } from './security.config';

function config(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('security config', () => {
  it('rejects weak JWT secrets', () => {
    expect(() => createJwtOptions(config({ JWT_SECRET: 'replace-with-a-secret' }))).toThrow('JWT_SECRET');
  });

  it('uses a fifteen minute access token', () => {
    const result = createJwtOptions(config({ JWT_SECRET: 'r4ndom-secret-value-with-more-than-32-characters!' }));
    expect(result.signOptions?.expiresIn).toBe('15m');
  });

  it('normalizes configured origins', () => {
    expect(configuredAdminOrigins(config({ APP_ORIGIN: 'https://www.example.com/', ADMIN_ORIGIN: 'https://admin.example.com' })))
      .toEqual(['https://www.example.com', 'https://admin.example.com']);
  });
});
