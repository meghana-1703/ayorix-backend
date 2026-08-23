import { Injectable } from '@nestjs/common';
import { Intent } from '../intent/intent.types';
import { Decision } from './decision.types';

@Injectable()
export class DecisionService {
  decide(intent: Intent): Decision {
    switch (intent) {
      case 'NORMAL_CHAT':
        return {
          advisor: 'chat',
          action: 'respond_naturally',
          nextStep: 'answer_user',
        };

      case 'PROJECT_START':
        return {
          advisor: 'discovery',
          action: 'start_discovery',
          nextStep: 'understand_business',
        };

      case 'PROJECT_DISCOVERY':
        return {
          advisor: 'discovery',
          action: 'continue_discovery',
          nextStep: 'collect_requirements',
        };

      case 'FEATURES':
        return {
          advisor: 'features',
          action: 'recommend_features',
          nextStep: 'suggest_features',
        };

      case 'TECHNOLOGY':
        return {
          advisor: 'technology',
          action: 'recommend_technology',
          nextStep: 'explain_technology',
        };

      case 'SEO':
        return {
          advisor: 'seo',
          action: 'explain_seo',
          nextStep: 'provide_seo_guidance',
        };

      case 'PRICING':
        return {
          advisor: 'pricing',
          action: 'estimate_pricing',
          nextStep: 'prepare_pricing_context',
        };

      case 'TIMELINE':
        return {
          advisor: 'timeline',
          action: 'estimate_timeline',
          nextStep: 'prepare_timeline_context',
        };

      case 'PROPOSAL':
        return {
          advisor: 'proposal',
          action: 'prepare_proposal',
          nextStep: 'generate_proposal',
        };

      default:
        return {
          advisor: 'chat',
          action: 'respond_helpfully',
          nextStep: 'answer_user',
        };
    }
  }
}