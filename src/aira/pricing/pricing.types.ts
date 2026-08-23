export interface PricingContext {
  projectType?: string;
  features?: string[];
  seo?: string;
  complexity?: 'simple' | 'medium' | 'complex';
}

export interface PricingResult {
  basePrice: number;
  featureCost: number;
  seoCost: number;
  complexityCost: number;
  estimatedPrice: number;
  currency: 'INR';
  breakdown: {
    item: string;
    amount: number;
  }[];
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