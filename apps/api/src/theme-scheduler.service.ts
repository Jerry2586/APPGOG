import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OperationsService } from './operations.service';

@Injectable()
export class ThemeSchedulerService implements OnModuleInit {
  private running = false;
  private readonly logger = new Logger(ThemeSchedulerService.name);
  constructor(private operations: OperationsService) {}
  onModuleInit() { return this.applySchedule(); }

  @Interval(15_000)
  async applySchedule() {
    if (this.running) return;
    this.running = true;
    try { await this.operations.applySchedule(); }
    catch { this.logger.warn('主题调度未完成，将在下一轮重试'); }
    finally { this.running = false; }
  }
}
