import {Body,Controller,Get,Header,Post,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {AiQuestionDto} from './ai.dto';
import {AiPolicyService} from './ai-policy.service';
import {AiService,aiClientAddress} from './ai.service';
@Controller('ai')
export class AiController {
  constructor(private ai:AiService,private policy:AiPolicyService){}
  @Get('config') @Header('Cache-Control','no-store') config(){return this.policy.publicConfig()}
  @Post('search') async search(@Body() dto:AiQuestionDto,@Req() req:Request,@Res({passthrough:true}) res:Response){
    res.setHeader('Cache-Control','no-store');
    return this.ai.search(dto.question,aiClientAddress(req));
  }
}
