export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
}

export interface LlmResponse {
  content: string;
  provider: string;
  model: string;
}