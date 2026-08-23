export interface TimelineContext {
  projectType?: string;
  features?: string[];
  seo?: string;
  complexity?: 'simple' | 'medium' | 'complex';
}

export interface TimelineMilestone {
  phase: string;
  durationDays: number;
  description: string;
}

export interface TimelineResult {
  estimatedDays: number;
  estimatedWeeks: number;
  milestones: TimelineMilestone[];
}