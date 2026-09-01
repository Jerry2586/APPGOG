import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { HealthStatus } from '@appgog/contracts';
import { PrismaService } from './prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly db: PrismaService) {}

  liveness(): HealthStatus {
    return {
      service: 'APPGOG API',
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: { process: 'ok' }
    };
  }

  async readiness(): Promise<HealthStatus> {
    try {
      await this.db.$queryRaw(Prisma.sql`SELECT 1`);
      return {
        ...this.liveness(),
        checks: { process: 'ok', database: 'ok' }
      };
    } catch {
      throw new ServiceUnavailableException({
        service: 'APPGOG API',
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: { process: 'ok', database: 'unavailable' }
      } satisfies HealthStatus);
    }
  }
}
