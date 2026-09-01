import {KnowledgeWorkerService} from './knowledge-worker.service';
describe('durable worker scheduling',()=>{
  let original:string|undefined;beforeAll(()=>original=process.env.AI_WORKER_ENABLED);afterAll(()=>{if(original===undefined)delete process.env.AI_WORKER_ENABLED;else process.env.AI_WORKER_ENABLED=original});
  it('pauses explicitly, reconciles batches, cleans expired counters and suppresses overlapping ticks',async()=>{
    let finish:()=>void=()=>{};const knowledge:any={reconcile:jest.fn(async()=> 'last-id'),processNext:jest.fn(()=>new Promise<void>(resolve=>{finish=resolve}))},db:any={aiRateBucket:{deleteMany:jest.fn(async()=>({count:0}))}},worker=new KnowledgeWorkerService(knowledge,db);
    process.env.AI_WORKER_ENABLED='false';await worker.tick();expect(knowledge.reconcile).not.toHaveBeenCalled();process.env.AI_WORKER_ENABLED='true';const pending=worker.tick();await Promise.resolve();await Promise.resolve();await worker.tick();expect(knowledge.processNext).toHaveBeenCalledTimes(1);expect(db.aiRateBucket.deleteMany).toHaveBeenCalledTimes(1);finish();await pending;
    knowledge.processNext.mockResolvedValue({status:'IDLE'});await worker.tick();expect(knowledge.reconcile).toHaveBeenCalledTimes(1);
    const clock=jest.spyOn(Date,'now').mockReturnValue(Date.now()+61000);try{await worker.tick();expect(knowledge.reconcile).toHaveBeenLastCalledWith('last-id')}finally{clock.mockRestore()}
  });
});
