import { Body, Controller, Post } from '@nestjs/common';
import { ProposalService } from './proposal.service';
import type { ProposalContext } from './proposal.types';

@Controller('aira/proposal')
export class ProposalController {
  constructor(
    private readonly proposalService: ProposalService,
  ) {}

  @Post()
  generate(@Body() context: ProposalContext) {
    return this.proposalService.generate(context);
  }
}