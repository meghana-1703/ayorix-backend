import { Controller, Get } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('aira/email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
  ) {}

  @Get('test')
  async testConnection() {
    return this.emailService.testConnection();
  }
}