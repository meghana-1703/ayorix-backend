import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IntentModule } from './aira/intent/intent.module';
import { MemoryModule } from './aira/memory/memory.module';
import { DecisionModule } from './aira/decision/decision.module';
import { PromptModule } from './aira/prompt/prompt.module';
import { LlmModule } from './aira/llm/llm.module';
import { EmailModule } from './email/email.module';
import { ProposalModule } from './aira/proposal/proposal.module';
import { PricingModule } from './aira/pricing/pricing.module';
import { TimelineModule } from './aira/timeline/timeline.module';
import { TestingModule } from './aira/testing/testing.module';
import { AiraOrchestratorModule } from './aira/orchestrator/aira-orchestrator.module';
import { WorkflowModule } from './aira/workflow/workflow.module';

@Module({
  imports: [IntentModule, MemoryModule, DecisionModule, PromptModule, LlmModule, EmailModule, ProposalModule, PricingModule, TimelineModule, TestingModule, AiraOrchestratorModule, WorkflowModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}