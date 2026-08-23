import { Injectable } from '@nestjs/common';
import { TIMELINE_RULES } from './timeline.constants';
import {
  TimelineContext,
  TimelineMilestone,
  TimelineResult,
} from './timeline.types';

@Injectable()
export class TimelineService {
  calculate(context: TimelineContext): TimelineResult {
    const projectType =
      context.projectType?.toLowerCase() ?? 'website';

    const baseDays =
      TIMELINE_RULES.PROJECT_TYPE[
        projectType as keyof typeof TIMELINE_RULES.PROJECT_TYPE
      ] ?? TIMELINE_RULES.PROJECT_TYPE.website;

    let featureDays = 0;

    for (const feature of context.features ?? []) {
      const key = this.normalizeFeature(feature);

      const days =
        TIMELINE_RULES.FEATURES[
          key as keyof typeof TIMELINE_RULES.FEATURES
        ] ?? 0;

      featureDays += days;
    }

    const seoKey = context.seo?.toLowerCase() ?? '';

    let seoDays = 0;

    if (seoKey.includes('advanced')) {
      seoDays = TIMELINE_RULES.SEO.advanced;
    } else if (seoKey.includes('local')) {
      seoDays = TIMELINE_RULES.SEO.local;
    } else if (seoKey.includes('basic')) {
      seoDays = TIMELINE_RULES.SEO.basic;
    }

    const complexity =
  this.normalizeComplexity(context.complexity);

    const complexityDays =
      TIMELINE_RULES.COMPLEXITY[complexity];

    const estimatedDays =
      baseDays +
      featureDays +
      seoDays +
      complexityDays;

    const estimatedWeeks =
      Math.ceil(estimatedDays / 7);

    const milestones =
      this.buildMilestones(estimatedDays);

    return {
      estimatedDays,
      estimatedWeeks,
      milestones,
    };
  }

  private normalizeComplexity(
  complexity?: string,
): keyof typeof TIMELINE_RULES.COMPLEXITY {
  const value = complexity?.toLowerCase().trim() ?? 'simple';

  if (
    value === 'low' ||
    value === 'simple' ||
    value.includes('low complexity')
  ) {
    return 'simple';
  }

  if (
    value === 'medium' ||
    value === 'moderate' ||
    value.includes('medium complexity')
  ) {
    return 'medium';
  }

  if (
    value === 'high' ||
    value === 'complex' ||
    value.includes('high complexity')
  ) {
    return 'complex';
  }

  return 'simple';
}

  private normalizeFeature(feature: string): string {
    const value = feature.toLowerCase();

    if (value.includes('online order')) {
      return 'onlineOrdering';
    }

    if (
      value.includes('auth') ||
      value.includes('login')
    ) {
      return 'authentication';
    }

    if (
      value.includes('payment') ||
      value.includes('razorpay')
    ) {
      return 'paymentGateway';
    }

    if (
      value.includes('admin') ||
      value.includes('dashboard')
    ) {
      return 'adminDashboard';
    }

    if (
      value.includes('booking') ||
      value.includes('appointment')
    ) {
      return 'bookingSystem';
    }

    if (value.includes('cms')) {
      return 'cms';
    }

    if (value.includes('contact')) {
      return 'contactForm';
    }

    return '';
  }

  private buildMilestones(
    totalDays: number,
  ): TimelineMilestone[] {
    const planningDays = Math.max(
      1,
      Math.ceil(totalDays * 0.15),
    );

    const designDays = Math.max(
      1,
      Math.ceil(totalDays * 0.25),
    );

    const developmentDays = Math.max(
      1,
      Math.ceil(totalDays * 0.4),
    );

    const testingDays = Math.max(
      1,
      Math.ceil(totalDays * 0.2),
    );

    return [
      {
        phase: 'Planning',
        durationDays: planningDays,
        description:
          'Requirements, structure and project planning.',
      },
      {
        phase: 'UI/UX Design',
        durationDays: designDays,
        description:
          'Interface design and responsive user experience.',
      },
      {
        phase: 'Development',
        durationDays: developmentDays,
        description:
          'Frontend, backend and required integrations.',
      },
      {
        phase: 'Testing & Launch',
        durationDays: testingDays,
        description:
          'Testing, optimization and deployment.',
      },
    ];
  }
}