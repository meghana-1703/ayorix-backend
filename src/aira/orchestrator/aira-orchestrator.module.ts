import { Module } from '@nestjs/common';

import { IntentModule } from '../intent/intent.module';
import { DecisionModule } from '../decision/decision.module';
import { PromptModule } from '../prompt/prompt.module';
import { LlmModule } from '../llm/llm.module';
import { ProposalModule } from '../proposal/proposal.module';
import { PricingModule } from '../pricing/pricing.module';
import { TimelineModule } from '../timeline/timeline.module';
import { MemoryModule } from '../memory/memory.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { UnderstandingModule } from '../understanding/understanding.module';
import { EmailModule } from '../../email/email.module';

import { AiraOrchestratorController } from './aira-orchestrator.controller';
import { AiraOrchestratorService } from './aira-orchestrator.service';

@Module({
  imports: [
    IntentModule,
    DecisionModule,
    PromptModule,
    LlmModule,
    ProposalModule,
    PricingModule,
    TimelineModule,
    MemoryModule,
    WorkflowModule,
    UnderstandingModule,
    EmailModule,
  ],

  controllers: [AiraOrchestratorController],

  providers: [AiraOrchestratorService],

  exports: [AiraOrchestratorService],
})
export class AiraOrchestratorModule {}