export interface ProposalContext {
  client: {
    name?: string;
    email?: string;
    language?: string;
  };

  project: {
    name?: string;
    projectType?: string;
    industry?: string;
    goal?: string;
    audience?: string;
    features?: string | string[];
    technology?: string;
    seo?: string;
    timeline?: string;
    budget?: string;
  };
}

export interface ProposalResult {
  title: string;
  clientName: string;
  projectSummary: string;

  scope: string[];
  technology: string[];
  seo: string[];

  timeline: string | null;
  budget: string | null;
  budgetNote: string;

  nextStep: string;
}