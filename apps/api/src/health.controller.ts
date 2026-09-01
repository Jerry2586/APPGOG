import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@appgog/contracts';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth(): HealthStatus {
    return this.health.liveness();
  }

  @Get('ready')
  getReadiness(): Promise<HealthStatus> {
    return this.health.readiness();
  }
}
