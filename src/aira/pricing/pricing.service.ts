import { Injectable } from '@nestjs/common';
import { PRICING_RULES } from './pricing.constants';
import {
  PricingContext,
  PricingResult,
} from './pricing.types';

@Injectable()
export class PricingService {
  calculate(context: PricingContext): PricingResult {
    const breakdown: {
      item: string;
      amount: number;
    }[] = [];

    const basePrice = PRICING_RULES.WEBSITE_BASE;

    breakdown.push({
      item: 'Base website',
      amount: basePrice,
    });

    const projectType =
      context.projectType?.toLowerCase() ?? 'website';

    const projectTypeCost =
      PRICING_RULES.PROJECT_TYPE[
        projectType as keyof typeof PRICING_RULES.PROJECT_TYPE
      ] ?? 0;

    if (projectTypeCost > 0) {
      breakdown.push({
        item: projectType,
        amount: projectTypeCost,
      });
    }

    let featureCost = 0;

    for (const feature of context.features ?? []) {
      const key = this.normalizeFeature(feature);

      const cost =
        PRICING_RULES.FEATURES[
          key as keyof typeof PRICING_RULES.FEATURES
        ] ?? 0;

      if (cost > 0) {
        featureCost += cost;

        breakdown.push({
          item: feature,
          amount: cost,
        });
      }
    }

    const seoKey = context.seo?.toLowerCase() ?? '';

    let seoCost = 0;

    if (seoKey.includes('advanced')) {
      seoCost = PRICING_RULES.SEO.advanced;
    } else if (seoKey.includes('local')) {
      seoCost = PRICING_RULES.SEO.local;
    } else if (seoKey.includes('basic')) {
      seoCost = PRICING_RULES.SEO.basic;
    }

    if (seoCost > 0) {
      breakdown.push({
        item: 'SEO',
        amount: seoCost,
      });
    }

    const complexity = this.normalizeComplexity(context.complexity);




    const complexityCost =
      PRICING_RULES.COMPLEXITY[complexity];

    if (complexityCost > 0) {
      breakdown.push({
        item: `${complexity} complexity`,
        amount: complexityCost,
      });
    }

    const estimatedPrice =
      basePrice +
      projectTypeCost +
      featureCost +
      seoCost +
      complexityCost;

    return {
      basePrice,
      featureCost,
      seoCost,
      complexityCost,
      estimatedPrice,
      currency: 'INR',
      breakdown,
    };
  }

 private normalizeComplexity(
  complexity?: string,
): keyof typeof PRICING_RULES.COMPLEXITY {
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

    if (value.includes('auth') || value.includes('login')) {
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
}