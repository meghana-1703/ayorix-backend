import { Injectable } from '@nestjs/common';
import {
  ProposalContext,
  ProposalResult,
} from './proposal.types';

@Injectable()
export class ProposalService {
  generate(context: ProposalContext): ProposalResult {
    const client = context.client ?? {};
const project = context.project ?? {};

    const features = this.toList(project.features);
    const technology = this.toList(project.technology);
    const seo = this.toList(project.seo);

   return {
  title: project.name
    ? `${project.name} — AYORIX Project Proposal`
    : 'AYORIX — Project Proposal',

  clientName: client.name ?? 'Client',

  projectSummary:
    project.goal ??
    'A thoughtfully tailored digital solution designed around the project goals, audience, and requirements.',

  scope: features,

  technology,

  seo,

  timeline: project.timeline || null,

  budget: project.budget || null,

  budgetNote:
    'This is an estimated project cost based on the requirements discussed. The final project cost will be confirmed by AYORIX after reviewing the complete requirements.',

  nextStep:
    'AYORIX will review your project details and reach out to you shortly.',
};
  }

 private toList(
  value?: string | string[],
): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
}