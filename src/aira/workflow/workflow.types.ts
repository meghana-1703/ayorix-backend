export type WorkflowStage =
  | 'DISCOVERY'
  | 'REQUIREMENTS'
  | 'TECHNOLOGY'
  | 'SEO'
  | 'TIMELINE'
  | 'PRICING'
  | 'PROPOSAL'
  | 'COMPLETE';

export type WorkflowField =
  | 'clientName'
  | 'businessName'
  | 'projectType'
  | 'industry'
  | 'goal'
  | 'audience'
  | 'features'
  | 'technology'
  | 'seo'
  | 'timeline'
  | 'email';

export interface WorkflowContext {
  project?: {
    id?: string;
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
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface WorkflowResult {
  currentStage: WorkflowStage;
  nextStage: WorkflowStage;

  missingInformation: WorkflowField[];

  nextMissingField?: WorkflowField;

  shouldAskQuestion: boolean;
}