export type WorkflowStage =
  | 'DISCOVERY'
  | 'REQUIREMENTS'
  | 'TECHNOLOGY'
  | 'SEO'
  | 'TIMELINE'
  | 'PRICING'
  | 'PROPOSAL'
  | 'COMPLETE';

export interface WorkflowContext {
  project?: {
    name?: string;
    projectType?: string;
    industry?: string;
    goal?: string;
    audience?: string;
    features?: string | string[];
    technology?: string;
    seo?: string;
    complexity?: string;
    timeline?: string;
    budget?: string;
    status?: string;
  };

  client?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface WorkflowResult {
  currentStage: WorkflowStage;
  nextStage: WorkflowStage;
  missingInformation: string[];
  nextMissingField?: string;
  shouldAskQuestion: boolean;
}