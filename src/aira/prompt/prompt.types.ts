import { Intent } from '../intent/intent.types';
import { Decision } from '../decision/decision.types';

export interface PromptContext {
  message: string;

  intent: Intent;

  decision: Decision;

  responseLanguage:
    | 'en'
    | 'te-en'
    | 'te';

  client?: {
    name?: string;
    language?: string;
    email?: string;
  };

  project?: {
    name?: string;
    projectType?: string;
    industry?: string;
    goal?: string;
    audience?: string;
    technology?: string;
    features?: string | string[];
    seo?: string;
    complexity?: string;
    timeline?: string;
    budget?: string;
  };

  conversationHistory?: {
    role: string;
    content: string;
  }[];
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}