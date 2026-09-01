import { ThemeSchedulerService } from './theme-scheduler.service';
describe('stage11 scheduler',()=>{
  it('reconciles on startup, prevents overlapping local ticks and recovers failures',async()=>{
    let release:()=>void=()=>{};const task=new Promise<void>(resolve=>release=resolve),operations={applySchedule:jest.fn(()=>task)},scheduler=new ThemeSchedulerService(operations as any);
    const first=scheduler.onModuleInit();await scheduler.applySchedule();expect(operations.applySchedule).toHaveBeenCalledTimes(1);release();await first;
    operations.applySchedule.mockRejectedValueOnce(new Error('db unavailable'));const warn=jest.spyOn((scheduler as any).logger,'warn').mockImplementation(()=>{});await scheduler.applySchedule();expect(warn).toHaveBeenCalledTimes(1);await scheduler.applySchedule();expect(operations.applySchedule).toHaveBeenCalledTimes(3);
  });
});
