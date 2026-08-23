import { Body, Controller, Post } from '@nestjs/common';
import { LlmService } from './llm.service';
import type { LlmRequest } from './llm.types';

@Controller('aira/llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post()
  generate(@Body() request: LlmRequest) {
    return this.llmService.generate(request);
  }
}