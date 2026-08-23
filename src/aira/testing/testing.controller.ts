import { Controller, Get } from '@nestjs/common';
import { TestingService } from './testing.service';

@Controller('aira/testing')
export class TestingController {
  constructor(
    private readonly testingService: TestingService,
  ) {}

  @Get()
  runTests() {
    return this.testingService.runTests();
  }
}