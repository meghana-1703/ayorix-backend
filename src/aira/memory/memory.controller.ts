import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MemoryService } from './memory.service';

@Controller('aira/memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post('clients')
  createClient(
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      language?: string;
    },
  ) {
    return this.memoryService.createClient(body);
  }

  @Get('clients/:id')
  getClient(@Param('id') id: string) {
    return this.memoryService.getClient(id);
  }

  @Post('clients/:clientId/projects')
  createProject(
    @Param('clientId') clientId: string,
    @Body()
    body: {
      name?: string;
      projectType?: string;
      industry?: string;
      goal?: string;
      audience?: string;
    },
  ) {
    return this.memoryService.createProject(clientId, body);
  }

  @Post('clients/:clientId/conversations')
  createConversation(
    @Param('clientId') clientId: string,
    @Body() body: { projectId?: string; language?: string },
  ) {
    return this.memoryService.createConversation(
      clientId,
      body.projectId,
      body.language ?? 'en',
    );
  }

  @Post('conversations/:conversationId/messages')
  saveMessage(
    @Param('conversationId') conversationId: string,
    @Body()
    body: {
      role: string;
      content: string;
      intent?: string;
      confidence?: number;
    },
  ) {
    return this.memoryService.saveMessage(conversationId, body);
  }

  @Get('conversations/:conversationId')
  getConversation(@Param('conversationId') conversationId: string) {
    return this.memoryService.getConversation(conversationId);
  }
}