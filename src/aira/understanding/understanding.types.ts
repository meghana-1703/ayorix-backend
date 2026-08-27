export type UnderstandingType =
  | 'PROJECT_MESSAGE'
  | 'GENERAL_QUESTION'
  | 'NORMAL_CHAT'
  | 'GREETING'
  | 'THANKS'
  | 'PROPOSAL_CONFIRMATION'
  | 'PROPOSAL_DECLINE';

export interface ExtractedProjectData {
  businessName?: string;
  projectType?: string;
  industry?: string;
  goal?: string;
  audience?: string;
  features?: string[];
  technology?: string;
  seo?: string;
  timeline?: string;
}

export interface UnderstandingResult {
  type: UnderstandingType;

  isProjectRelated: boolean;

  isDirectQuestion: boolean;

  answersCurrentField: boolean;

  confidence: number;

  extracted: ExtractedProjectData;

  responseContext?: string;
}