import { Body, Controller, Post } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import type { TimelineContext } from './timeline.types';

@Controller('aira/timeline')
export class TimelineController {
  constructor(
    private readonly timelineService: TimelineService,
  ) {}

  @Post()
  calculate(@Body() context: TimelineContext) {
    return this.timelineService.calculate(context);
  }
}