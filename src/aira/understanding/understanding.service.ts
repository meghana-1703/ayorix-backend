import { Injectable } from '@nestjs/common';

import {
  UnderstandingResult,
  ExtractedProjectData,
} from './understanding.types';

@Injectable()
export class UnderstandingService {
  understand(
    message: string,
    project?: any,
  ): UnderstandingResult {
    const text = message.trim();
    const lower = text.toLowerCase();

    const extracted: ExtractedProjectData = {};

    const isGreeting = /^(hi|hii|hello|hey|helo|good morning|good afternoon|good evening)$/i.test(
      text,
    );

    const isThanks = [
      'thanks',
      'thank you',
      'thankyou',
      'thx',
      'thanks a lot',
      'thank you so much',
    ].includes(lower);

    const isProposalConfirmation = [
      'yes',
      'yeah',
      'yep',
      'sure',
      'okay',
      'ok',
      'send it',
      'send proposal',
      'send the proposal',
      'go ahead',
      'yes please',
      'send',
      'avunu',
      'sare',
      'pampu',
      'pampandi',
    ].includes(lower);

    const isProposalDecline = [
      'no',
      'no thanks',
      'not now',
      'no, not now',
      'maybe later',
      'dont send',
      "don't send",
      'vaddu',
      'ippudu vaddu',
    ].includes(lower);

    if (isGreeting) {
      return {
        type: 'GREETING',
        isProjectRelated: false,
        isDirectQuestion: false,
        answersCurrentField: false,
        confidence: 0.99,
        extracted,
      };
    }

    if (isThanks) {
      return {
        type: 'THANKS',
        isProjectRelated: false,
        isDirectQuestion: false,
        answersCurrentField: false,
        confidence: 0.99,
        extracted,
      };
    }

    if (isProposalConfirmation) {
      return {
        type: 'PROPOSAL_CONFIRMATION',
        isProjectRelated: true,
        isDirectQuestion: false,
        answersCurrentField: false,
        confidence: 0.99,
        extracted,
      };
    }

    if (isProposalDecline) {
      return {
        type: 'PROPOSAL_DECLINE',
        isProjectRelated: true,
        isDirectQuestion: false,
        answersCurrentField: false,
        confidence: 0.99,
        extracted,
      };
    }

    const isDirectQuestion =
      text.endsWith('?') ||
      /^(what|why|how|when|where|who|which|can|could|would|is|are|do|does|did|will|should|tell me|explain)\b/i.test(
        text,
      );

    const projectData = this.extractProjectData(
      text,
      project,
    );

    Object.assign(extracted, projectData);

    const hasProjectData =
      Object.keys(extracted).length > 0;

    const projectKeywords = [
      'website',
      'web app',
      'web application',
      'ecommerce',
      'e-commerce',
      'online store',
      'portfolio',
      'business website',
      'booking',
      'payment',
      'razorpay',
      'stripe',
      'seo',
      'dashboard',
      'login',
      'authentication',
      'cms',
      'contact form',
      'website build',
      'website develop',
      'website create',
      'website design',
    ];

    const isProjectRelated =
      hasProjectData ||
      projectKeywords.some((keyword) =>
        lower.includes(keyword),
      );

    if (isDirectQuestion && !isProjectRelated) {
      return {
        type: 'GENERAL_QUESTION',
        isProjectRelated: false,
        isDirectQuestion: true,
        answersCurrentField: false,
        confidence: 0.95,
        extracted,
      };
    }

    if (isProjectRelated) {
      return {
        type: 'PROJECT_MESSAGE',
        isProjectRelated: true,
        isDirectQuestion,
        answersCurrentField: hasProjectData,
        confidence: hasProjectData ? 0.95 : 0.85,
        extracted,
      };
    }

    return {
      type: 'NORMAL_CHAT',
      isProjectRelated: false,
      isDirectQuestion,
      answersCurrentField: false,
      confidence: 0.75,
      extracted,
    };
  }

  private extractProjectData(
    message: string,
    project?: any,
  ): ExtractedProjectData {
    const text = message.trim();
    const lower = text.toLowerCase();

    const data: ExtractedProjectData = {};

    // PROJECT TYPE
    if (
      lower.includes('ecommerce') ||
      lower.includes('e-commerce') ||
      lower.includes('online store') ||
      lower.includes('online shop')
    ) {
      data.projectType = 'E-commerce Website';
    } else if (
      lower.includes('web application') ||
      lower.includes('web app')
    ) {
      data.projectType = 'Web Application';
    } else if (
      lower.includes('portfolio') ||
      lower.includes('personal website')
    ) {
      data.projectType = 'Portfolio Website';
    } else if (
      lower === 'website' ||
      lower.includes('business website') ||
      lower.includes('need a website') ||
      lower.includes('want a website')
    ) {
      data.projectType = 'Business Website';
    }

    // INDUSTRY
    if (
      lower.includes('restaurant') ||
      lower.includes('food') ||
      lower.includes('cafe') ||
      lower.includes('hotel')
    ) {
      data.industry = 'Restaurant / Food';
    } else if (
      lower.includes('software') ||
      lower.includes('technology') ||
      lower.includes('tech')
    ) {
      data.industry = 'Software / Technology';
    } else if (
      lower.includes('school') ||
      lower.includes('college') ||
      lower.includes('education')
    ) {
      data.industry = 'Education';
    } else if (
      lower.includes('hospital') ||
      lower.includes('clinic') ||
      lower.includes('healthcare')
    ) {
      data.industry = 'Healthcare';
    } else if (
      lower.includes('real estate') ||
      lower.includes('property')
    ) {
      data.industry = 'Real Estate';
    } else if (
      lower.includes('salon') ||
      lower.includes('beauty') ||
      lower.includes('spa')
    ) {
      data.industry = 'Beauty / Salon';
    } else if (
      lower.includes('photography') ||
      lower.includes('photographer')
    ) {
      data.industry = 'Photography';
    }

    // GOAL
    if (
      lower.includes('more customers') ||
      lower.includes('more clients')
    ) {
      data.goal = 'Get more customers';
    } else if (
      lower.includes('generate leads') ||
      lower.includes('more leads') ||
      lower.includes('lead generation')
    ) {
      data.goal = 'Generate leads';
    } else if (
      lower.includes('sell products') ||
      lower.includes('sell online')
    ) {
      data.goal = 'Sell products online';
    } else if (
      lower.includes('brand presence') ||
      lower.includes('branding')
    ) {
      data.goal = 'Build brand presence';
    }

    // AUDIENCE
    if (
      lower.includes('local business') ||
      lower.includes('local customer')
    ) {
      data.audience = 'Local businesses';
    } else if (
      lower.includes('startup') ||
      lower.includes('startups')
    ) {
      data.audience = 'Startups';
    } else if (
      lower.includes('consumer') ||
      lower.includes('customers')
    ) {
      data.audience = 'General consumers';
    } else if (
      lower.includes('student')
    ) {
      data.audience = 'Students';
    } else if (
      lower.includes('professional')
    ) {
      data.audience = 'Professionals';
    }

    // FEATURES
    const features: string[] = [];

    const featureMap: Record<string, string> = {
      'online ordering': 'Online ordering',
      'online order': 'Online ordering',
      payment: 'Payment gateway',
      razorpay: 'Payment gateway',
      stripe: 'Payment gateway',
      checkout: 'Payment gateway',
      'contact form': 'Contact form',
      booking: 'Booking system',
      appointment: 'Booking system',
      reservation: 'Booking system',
      login: 'Authentication',
      authentication: 'Authentication',
      'admin dashboard': 'Admin dashboard',
      'admin panel': 'Admin dashboard',
      dashboard: 'Admin dashboard',
      cms: 'CMS',
      search: 'Search',
      'live chat': 'Live chat',
      chat: 'Live chat',
      reviews: 'Reviews / Testimonials',
      testimonials: 'Reviews / Testimonials',
    };

    for (const key of Object.keys(featureMap)) {
      if (lower.includes(key)) {
        features.push(featureMap[key]);
      }
    }

    if (features.length > 0) {
      data.features = [...new Set(features)];
    }

    // TECHNOLOGY
    if (
      lower.includes('react') &&
      lower.includes('tailwind')
    ) {
      data.technology = 'React + Tailwind CSS';
    } else if (lower.includes('next.js') || lower.includes('nextjs')) {
      data.technology = 'Next.js';
    } else if (lower.includes('react')) {
      data.technology = 'React';
    } else if (lower.includes('custom stack')) {
      data.technology = 'Custom stack';
    }

    // SEO
    if (
      lower.includes('no seo') ||
      lower.includes('without seo')
    ) {
      data.seo = 'No SEO';
    } else if (
      lower.includes('seo') ||
      lower.includes('google ranking')
    ) {
      data.seo = 'SEO optimization';
    }

    // TIMELINE
    const weeks = lower.match(/(\d+)\s*weeks?/i);
    const days = lower.match(/(\d+)\s*days?/i);

    if (weeks?.[1]) {
      data.timeline = `${weeks[1]} weeks`;
    } else if (days?.[1]) {
      data.timeline = `${days[1]} days`;
    }

    return data;
  }
}