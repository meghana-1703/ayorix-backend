import { Body, Controller, Post } from '@nestjs/common';
import type { Intent } from '../intent/intent.types';
import { DecisionService } from './decision.service';

@Controller('aira/decision')
export class DecisionController {
  constructor(private readonly decisionService: DecisionService) {}

  @Post()
  decide(@Body('intent') intent: Intent) {
    return this.decisionService.decide(intent);
  }
}