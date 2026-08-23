export type Intent =
  | 'NORMAL_CHAT'
  | 'PROJECT_START'
  | 'PROJECT_DISCOVERY'
  | 'FEATURES'
  | 'TECHNOLOGY'
  | 'SEO'
  | 'PRICING'
  | 'TIMELINE'
  | 'PROPOSAL'
  | 'GENERAL_QUESTION';

export interface IntentResult {
  intent: Intent;
  confidence: number;
}