import { Injectable } from '@nestjs/common';

import {
  WorkflowContext,
  WorkflowField,
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

    /*
     * AIRA MUST ask one question whenever
     * required information is missing.
     *
     * Exactly ONE question at a time.
     */
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

  /*
   * =========================================================
   * CURRENT STAGE
   * =========================================================
   */

  private getCurrentStage(
    project: WorkflowContext['project'],
  ): WorkflowStage {
    const status =
      project?.status;

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
   * - One missing field at a time.
   * - Budget is NEVER requested.
   * - Pricing is calculated automatically.
   * - Email is requested only at proposal stage.
   */

  private getMissingInformation(
    stage: WorkflowStage,
    project: WorkflowContext['project'],
    client: WorkflowContext['client'],
  ): WorkflowField[] {
    const missing: WorkflowField[] = [];

    /*
     * -------------------------------------------------------
     * DISCOVERY
     * -------------------------------------------------------
     */

    if (!client?.name) {
      missing.push('clientName');
      return missing;
    }

    if (!project?.name) {
      missing.push('businessName');
      return missing;
    }

    if (!project?.projectType) {
      missing.push('projectType');
      return missing;
    }

    if (!project?.industry) {
      missing.push('industry');
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
     * -------------------------------------------------------
     * REQUIREMENTS
     * -------------------------------------------------------
     */

    const features =
      this.toList(
        project?.features,
      );

    if (features.length === 0) {
      missing.push('features');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * TECHNOLOGY
     * -------------------------------------------------------
     */

    if (!project?.technology) {
      missing.push('technology');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * SEO
     * -------------------------------------------------------
     */

    if (!project?.seo) {
      missing.push('seo');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * TIMELINE
     * -------------------------------------------------------
     */

    if (!project?.timeline) {
      missing.push('timeline');
      return missing;
    }

    /*
     * -------------------------------------------------------
     * PRICING
     * -------------------------------------------------------
     *
     * NO budget question.
     *
     * PricingService calculates investment automatically.
     */

    /*
     * -------------------------------------------------------
     * PROPOSAL
     * -------------------------------------------------------
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

  /*
   * =========================================================
   * NEXT STAGE
   * =========================================================
   */

  private getNextStage(
    currentStage: WorkflowStage,
    missingInformation: WorkflowField[],
    project: WorkflowContext['project'],
    client: WorkflowContext['client'],
  ): WorkflowStage {
    /*
     * If information is missing,
     * stay in the logical stage.
     */
    if (missingInformation.length > 0) {
      return this.stageForField(
        missingInformation[0],
      );
    }

    /*
     * Everything required is complete.
     */

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

      if (
        currentStage === 'PROPOSAL' &&
        client?.email
      ) {
        return 'COMPLETE';
      }
    }

    return currentStage;
  }

  /*
   * =========================================================
   * FIELD → STAGE
   * =========================================================
   */

  private stageForField(
    field: WorkflowField,
  ): WorkflowStage {
    switch (field) {
      case 'clientName':
      case 'businessName':
      case 'projectType':
      case 'industry':
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

      case 'email':
        return 'PROPOSAL';

      default:
        return 'DISCOVERY';
    }
  }

  /*
   * =========================================================
   * ALL PROJECT REQUIREMENTS
   * =========================================================
   */

  private hasAllProjectRequirements(
    project: WorkflowContext['project'],
  ): boolean {
    if (!project?.name) {
      return false;
    }

    if (!project?.projectType) {
      return false;
    }

    if (!project?.industry) {
      return false;
    }

    if (!project?.goal) {
      return false;
    }

    if (!project?.audience) {
      return false;
    }

    if (
      this.toList(
        project?.features,
      ).length === 0
    ) {
      return false;
    }

    if (!project?.technology) {
      return false;
    }

    if (!project?.seo) {
      return false;
    }

    if (!project?.timeline) {
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