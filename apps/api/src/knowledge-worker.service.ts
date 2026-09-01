import {Injectable,Logger} from '@nestjs/common';
import {Interval} from '@nestjs/schedule';
import {KnowledgeService} from './knowledge.service';
import {PrismaService} from './prisma.service';
@Injectable()
export class KnowledgeWorkerService {
  private running=false;
  private lastReconcile=0;
  private cursor:string|null=null;
  private logger=new Logger(KnowledgeWorkerService.name);
  constructor(private knowledge:KnowledgeService,private db:PrismaService){}
  @Interval(5000)
  async tick(){if(this.running||process.env.AI_WORKER_ENABLED==='false')return;this.running=true;try{
    if(Date.now()-this.lastReconcile>=60000){this.cursor=await this.knowledge.reconcile(this.cursor||undefined);this.lastReconcile=Date.now();await this.db.aiRateBucket.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-3600000)}}})}
    await this.knowledge.processNext();
  }catch{this.logger.warn('AI 索引工作器暂时不可用；任务保留，等待下次检查')}finally{this.running=false}}
}
