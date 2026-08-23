import { Body, Controller, Post } from '@nestjs/common';
import { IntentService } from './intent.service';

@Controller('aira/intent')
export class IntentController {
  constructor(private readonly intentService: IntentService) {}

  @Post('detect')
  detect(@Body('message') message: string) {
    return this.intentService.detect(message);
  }
}