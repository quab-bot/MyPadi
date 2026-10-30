/** Minimal LLM interface so the planner/synthesizer can be tested with a fake. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  /** Ask for a JSON object response (planner). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface Llm {
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string>;
}
