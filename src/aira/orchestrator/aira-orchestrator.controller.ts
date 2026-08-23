import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { AiraOrchestratorService } from './aira-orchestrator.service';
import { MemoryService } from '../memory/memory.service';

@Controller('aira')
export class AiraOrchestratorController {
constructor(
  private readonly orchestrator: AiraOrchestratorService,
  private readonly memoryService: MemoryService,
) {}

@Post('chat')
async process(
  @Body()
  body: {
    conversationId?: string;
    clientId?: string;
    message?: string;
    project?: any;
    conversationHistory?: any[];
  },
) {
  if (
    typeof body.message !== 'string' ||
    !body.message.trim()
  ) {
    throw new BadRequestException(
      'Message is required',
    );
  }

  /*
   * ---------------------------------------------------------
   * EXISTING CONVERSATION
   * ---------------------------------------------------------
   */

  if (
    body.conversationId &&
    !body.clientId
  ) {
    throw new BadRequestException(
      'Client ID is required',
    );
  }

  /*
   * ---------------------------------------------------------
   * NEW CONVERSATION
   * ---------------------------------------------------------
   */

  let conversationId =
    body.conversationId;

  let clientId =
    body.clientId;

  let project =
    body.project;

  let conversationHistory =
    body.conversationHistory;

  if (!conversationId) {
    /*
     * 1. Create client
     */

    const client =
      await this.memoryService.createClient({
        language: 'en',
      });

    clientId = client.id;

    /*
     * 2. Create project
     */

    const createdProject =
      await this.memoryService.createProject(
        clientId,
        {},
      );

    project = createdProject;

    /*
     * 3. Create conversation
     */

    const conversation =
      await this.memoryService.createConversation(
        clientId,
        createdProject.id,
        'en',
      );

    conversationId =
      conversation.id;

    conversationHistory = [];
  }

  /*
   * ---------------------------------------------------------
   * SEND EVERYTHING TO ORCHESTRATOR
   * ---------------------------------------------------------
   */

const result =
  await this.orchestrator.process({
    conversationId,
    clientId,
    message: body.message.trim(),
    project,
    conversationHistory,
  });

return {
  conversationId,
  clientId,
  projectId: project?.id,
  ...result,
};
}
}