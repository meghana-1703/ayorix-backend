import { Module } from '@nestjs/common';
import { UnderstandingService } from './understanding.service';

@Module({
  providers: [UnderstandingService],
  exports: [UnderstandingService],
})
export class UnderstandingModule {}