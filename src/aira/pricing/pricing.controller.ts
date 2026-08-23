import { Body, Controller, Post } from '@nestjs/common';
import { PricingService } from './pricing.service';
import type { PricingContext } from './pricing.types';

@Controller('aira/pricing')
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
  ) {}

  @Post()
  calculate(@Body() context: PricingContext) {
    return this.pricingService.calculate(context);
  }
}