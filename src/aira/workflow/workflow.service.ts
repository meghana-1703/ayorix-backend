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
      missingInformation.length > 0
        ? missingInformation[0]
        : undefined;

    const shouldAskQuestion =
      missingInformation.length > 0 &&
      currentStage !== 'COMPLETE';

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

  /*
   * =========================================================
   * CURRENT STAGE
   * =========================================================
   *
   * Project status is used when available.
   * However, status alone must NEVER cause AIRA to skip
   * genuinely missing information.
   */

  private getCurrentStage(
    project: WorkflowContext['project'],
  ): WorkflowStage {
    const status = project?.status;

    switch (status) {
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

  /*
   * =========================================================
   * MISSING INFORMATION
   * =========================================================
   *
   * IMPORTANT:
   *
   * Budget is NEVER a user input.
   *
   * Pricing is calculated automatically.
   *
   * Therefore PRICING stage does NOT ask for budget.
   */

  private getMissingInformation(
    stage: WorkflowStage,
    project: WorkflowContext['project'],
    client: WorkflowContext['client'],
  ): string[] {
    const missing: string[] = [];

    /*
     * -------------------------------------------------------
     * DISCOVERY
     * -------------------------------------------------------
     */

    if (
      !project?.projectType
    ) {
      missing.push('projectType');
      return missing;
    }

    if (
      !project?.industry
    ) {
      missing.push('industry');
      return missing;
    }

    if (
      !project?.goal
    ) {
      missing.push('goal');
      return missing;
    }

    if (
      !project?.audience
    ) {
      missing.push('audience');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * REQUIREMENTS
     * -------------------------------------------------------
     */

    const features =
      this.toList(
        project?.features,
      );

    if (
      features.length === 0
    ) {
      missing.push('features');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * TECHNOLOGY
     * -------------------------------------------------------
     */

    if (
      !project?.technology
    ) {
      missing.push('technology');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * SEO
     * -------------------------------------------------------
     */

    if (
      !project?.seo
    ) {
      missing.push('seo');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * TIMELINE
     * -------------------------------------------------------
     */

    if (
      !project?.timeline
    ) {
      missing.push('timeline');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * PRICING
     * -------------------------------------------------------
     *
     * Pricing is automatic.
     *
     * NEVER ask:
     * "What is your budget?"
     *
     * NEVER make "budget" a blocking workflow field.
     */

    /*
     * -------------------------------------------------------
     * PROPOSAL
     * -------------------------------------------------------
     *
     * Once all project requirements exist, proposal
     * confirmation happens in AiraOrchestratorService.
     *
     * Email is requested only AFTER confirmation.
     */

    if (
      stage === 'PROPOSAL' &&
      !client?.email
    ) {
      missing.push('email');
      return missing;
    }

    /*
     * No missing field.
     */

    return missing;
  }

  /*
   * =========================================================
   * NEXT STAGE
   * =========================================================
   */

  private getNextStage(
    currentStage: WorkflowStage,
    missingInformation: string[],
    project: WorkflowContext['project'],
    client: WorkflowContext['client'],
  ): WorkflowStage {
    /*
     * If anything is missing, remain logically within
     * the current workflow area.
     */

    if (
      missingInformation.length > 0
    ) {
      return currentStage;
    }

    /*
     * Canonical stage order.
     */

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

    const currentIndex =
      stages.indexOf(
        currentStage,
      );

    if (
      currentIndex === -1
    ) {
      return 'DISCOVERY';
    }

    if (
      currentIndex >=
      stages.length - 1
    ) {
      return 'COMPLETE';
    }

    /*
     * If all actual requirements are complete,
     * move toward proposal.
     */

    if (
      this.hasAllProjectRequirements(
        project,
      )
    ) {
      if (
        currentStage ===
          'TIMELINE' ||
        currentStage ===
          'PRICING'
      ) {
        return 'PROPOSAL';
      }
    }

    return stages[
      currentIndex + 1
    ];
  }

  /*
   * =========================================================
   * ALL PROJECT REQUIREMENTS
   * =========================================================
   */

  private hasAllProjectRequirements(
    project: WorkflowContext['project'],
  ): boolean {
    if (
      !project?.projectType
    ) {
      return false;
    }

    if (
      !project?.industry
    ) {
      return false;
    }

    if (
      !project?.goal
    ) {
      return false;
    }

    if (
      !project?.audience
    ) {
      return false;
    }

    if (
      this.toList(
        project?.features,
      ).length === 0
    ) {
      return false;
    }

    if (
      !project?.technology
    ) {
      return false;
    }

    if (
      !project?.seo
    ) {
      return false;
    }

    if (
      !project?.timeline
    ) {
      return false;
    }

    return true;
  }

  /*
   * =========================================================
   * NORMALIZE LIST
   * =========================================================
   */

  private toList(
    value?:
      | string
      | string[],
  ): string[] {
    if (!value) {
      return [];
    }

    if (
      Array.isArray(
        value,
      )
    ) {
      return value
        .map(
          (item) =>
            String(item).trim(),
        )
        .filter(Boolean);
    }

    return value
      .split(',')
      .map(
        (item) =>
          item.trim(),
      )
      .filter(Boolean);
  }
}