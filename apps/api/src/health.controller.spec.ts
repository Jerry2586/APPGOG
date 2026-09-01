import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('HealthController', () => {
  it('returns the APPGOG API liveness contract', () => {
    const service = new HealthService({} as never);
    const result = new HealthController(service).getHealth();

    expect(result.service).toBe('APPGOG API');
    expect(result.status).toBe('ok');
    expect(result.checks).toEqual({ process: 'ok' });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('reports readiness only after the independent database answers', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const result = await new HealthController(new HealthService({ $queryRaw: query } as never)).getReadiness();

    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'ok', checks: { process: 'ok', database: 'ok' } });
  });

  it('returns a safe 503 readiness result when the database is unavailable', async () => {
    const controller = new HealthController(new HealthService({ $queryRaw: jest.fn().mockRejectedValue(new Error('secret connection string')) } as never));

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.getReadiness()).rejects.not.toThrow('secret connection string');
  });
});
