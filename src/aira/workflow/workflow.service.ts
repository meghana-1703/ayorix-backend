import { Injectable } from '@nestjs/common';

import {
  WorkflowContext,
  WorkflowResult,
  WorkflowStage,
} from './workflow.types';

@Injectable()
export class WorkflowService {
  determine(
    context: WorkflowContext,
  ): WorkflowResult {
    const project = context.project ?? {};
    const client = context.client ?? {};

    const missingInformation =
      this.getMissingInformation(project, client);

    const nextMissingField =
      missingInformation[0];

    const shouldAskQuestion =
      Boolean(nextMissingField);

    const currentStage =
      this.getStageForField(nextMissingField);

    const nextStage =
      nextMissingField
        ? currentStage
        : 'PROPOSAL';

    return {
      currentStage,
      nextStage,
      missingInformation,
      nextMissingField,
      shouldAskQuestion,
    };
  }

  private getMissingInformation(
    project: WorkflowContext['project'],
    client: WorkflowContext['client'],
  ): string[] {
    const missing: string[] = [];

    // 1. CLIENT NAME
    if (!client?.name) {
      missing.push('clientName');
      return missing;
    }

    // 2. BUSINESS NAME
    if (!project?.name) {
      missing.push('businessName');
      return missing;
    }

    // 3. MOBILE NUMBER
    if (!client?.phone) {
      missing.push('phone');
      return missing;
    }

    // 4. BUSINESS TYPE
    if (!project?.industry) {
      missing.push('industry');
      return missing;
    }

    // 5. WEBSITE TYPE
    if (!project?.projectType) {
      missing.push('projectType');
      return missing;
    }

    // 6. MAIN GOAL
    if (!project?.goal) {
      missing.push('goal');
      return missing;
    }

    // 7. TARGET AUDIENCE
    if (!project?.audience) {
      missing.push('audience');
      return missing;
    }

    // 8. FEATURES
    const features =
      this.toList(project?.features);

    if (features.length === 0) {
      missing.push('features');
      return missing;
    }

    // 9. TECHNOLOGY
    if (!project?.technology) {
      missing.push('technology');
      return missing;
    }

    // 10. SEO
    if (!project?.seo) {
      missing.push('seo');
      return missing;
    }

    // 11. TIMELINE
    if (!project?.timeline) {
      missing.push('timeline');
      return missing;
    }

    /*
     * PRICING IS AUTOMATIC.
     *
     * NEVER ask the client for budget.
     */

    /*
     * EMAIL IS NOT PART OF NORMAL DISCOVERY.
     *
     * Email must be requested ONLY after:
     * "Yes, send proposal"
     *
     * Orchestrator handles that separately.
     */

    return missing;
  }

  private getStageForField(
    field?: string,
  ): WorkflowStage {
    switch (field) {
      case 'clientName':
      case 'businessName':
      case 'phone':
      case 'industry':
      case 'projectType':
      case 'goal':
      case 'audience':
        return 'DISCOVERY';

      case 'features':
        return 'REQUIREMENTS';

      case 'technology':
        return 'TECHNOLOGY';

      case 'seo':
        return 'SEO';

      case 'timeline':
        return 'TIMELINE';

      default:
        return 'PROPOSAL';
    }
  }

  private toList(
    value?: string | string[],
  ): string[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => String(item).trim())
        .filter(Boolean);
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}