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

    const currentStage =
      this.getCurrentStage(project);

    const missingInformation =
      this.getMissingInformation(
        currentStage,
        project,
        client,
      );

    const nextMissingField =
      missingInformation[0];

    const shouldAskQuestion =
      Boolean(nextMissingField);

    const nextStage =
      this.getNextStage(
        currentStage,
        missingInformation,
        project,
        client,
      );

    return {
      currentStage,
      nextStage,
      missingInformation,
      nextMissingField,
      shouldAskQuestion,
    };
  }

  private getCurrentStage(
    project: WorkflowContext['project'],
  ): WorkflowStage {
    switch (project?.status) {
      case 'DISCOVERY':
        return 'DISCOVERY';

      case 'REQUIREMENTS':
        return 'REQUIREMENTS';

      case 'TECHNOLOGY':
        return 'TECHNOLOGY';

      case 'SEO':
        return 'SEO';

      case 'TIMELINE':
        return 'TIMELINE';

      case 'PRICING':
        return 'PRICING';

      case 'PROPOSAL':
        return 'PROPOSAL';

      case 'COMPLETE':
        return 'COMPLETE';

      default:
        return 'DISCOVERY';
    }
  }

  private getMissingInformation(
    stage: WorkflowStage,
    project: WorkflowContext['project'],
    client: WorkflowContext['client'],
  ): string[] {
    const missing: string[] = [];

    /*
     * ========================================================
     * DISCOVERY
     * ========================================================
     *
     * Client information first.
     */

    if (!client?.name) {
      missing.push('clientName');
      return missing;
    }

    if (!project?.name) {
      missing.push('businessName');
      return missing;
    }

    if (!client?.phone) {
      missing.push('phone');
      return missing;
    }

    if (!project?.industry) {
      missing.push('industry');
      return missing;
    }

    if (!project?.projectType) {
      missing.push('projectType');
      return missing;
    }

    if (!project?.goal) {
      missing.push('goal');
      return missing;
    }

    if (!project?.audience) {
      missing.push('audience');
      return missing;
    }

    /*
     * ========================================================
     * REQUIREMENTS
     * ========================================================
     */

    const features =
      this.toList(project?.features);

    if (features.length === 0) {
      missing.push('features');
      return missing;
    }

    /*
     * ========================================================
     * TECHNOLOGY
     * ========================================================
     */

    if (!project?.technology) {
      missing.push('technology');
      return missing;
    }

    /*
     * ========================================================
     * SEO
     * ========================================================
     */

    if (!project?.seo) {
      missing.push('seo');
      return missing;
    }

    /*
     * ========================================================
     * TIMELINE
     * ========================================================
     */

    if (!project?.timeline) {
      missing.push('timeline');
      return missing;
    }

    /*
     * ========================================================
     * PRICING
     * ========================================================
     *
     * Pricing is automatic.
     * Budget is NEVER requested from client.
     */

    /*
     * ========================================================
     * PROPOSAL
     * ========================================================
     *
     * Email is requested only when proposal needs to be sent.
     */

    if (
      stage === 'PROPOSAL' &&
      !client?.email
    ) {
      missing.push('email');
      return missing;
    }

    return missing;
  }

  private getNextStage(
    currentStage: WorkflowStage,
    missingInformation: string[],
    project: WorkflowContext['project'],
    client: WorkflowContext['client'],
  ): WorkflowStage {
    if (missingInformation.length > 0) {
      const field = missingInformation[0];

      if (
        field === 'clientName' ||
        field === 'businessName' ||
        field === 'phone' ||
        field === 'industry' ||
        field === 'projectType' ||
        field === 'goal' ||
        field === 'audience'
      ) {
        return 'DISCOVERY';
      }

      if (field === 'features') {
        return 'REQUIREMENTS';
      }

      if (field === 'technology') {
        return 'TECHNOLOGY';
      }

      if (field === 'seo') {
        return 'SEO';
      }

      if (field === 'timeline') {
        return 'TIMELINE';
      }

      if (field === 'email') {
        return 'PROPOSAL';
      }

      return currentStage;
    }

    if (
      currentStage === 'COMPLETE'
    ) {
      return 'COMPLETE';
    }

    if (
      this.hasAllProjectRequirements(
        project,
      )
    ) {
      if (
        currentStage === 'DISCOVERY' ||
        currentStage === 'REQUIREMENTS' ||
        currentStage === 'TECHNOLOGY' ||
        currentStage === 'SEO' ||
        currentStage === 'TIMELINE' ||
        currentStage === 'PRICING'
      ) {
        return 'PROPOSAL';
      }
    }

    const stages: WorkflowStage[] = [
      'DISCOVERY',
      'REQUIREMENTS',
      'TECHNOLOGY',
      'SEO',
      'TIMELINE',
      'PRICING',
      'PROPOSAL',
      'COMPLETE',
    ];

    const index =
      stages.indexOf(currentStage);

    if (index < 0) {
      return 'DISCOVERY';
    }

    return stages[
      Math.min(
        index + 1,
        stages.length - 1,
      )
    ];
  }

  private hasAllProjectRequirements(
    project: WorkflowContext['project'],
  ): boolean {
    return Boolean(
      project?.name &&
      project?.industry &&
      project?.projectType &&
      project?.goal &&
      project?.audience &&
      this.toList(
        project?.features,
      ).length > 0 &&
      project?.technology &&
      project?.seo &&
      project?.timeline,
    );
  }

  private toList(
    value?: string | string[],
  ): string[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .map((item) =>
          String(item).trim(),
        )
        .filter(Boolean);
    }

    return value
      .split(',')
      .map((item) =>
        item.trim(),
      )
      .filter(Boolean);
  }
}