import { Body, Controller, Post } from '@nestjs/common';
import { PromptService } from './prompt.service';
import type { PromptContext } from './prompt.types';

@Controller('aira/prompt')
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  @Post()
  build(@Body() context: PromptContext) {
    return this.promptService.buildPrompt(context);
  }
}