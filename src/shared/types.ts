export interface TranConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  targetLanguage: string;
  promptStyle: PromptStyle;
  customPrompt: string;
  maxChars: number;
}

export type PromptStyle = "formal" | "concise" | "casual";

// Port message types between Content Script and Service Worker
export interface TranslateRequest {
  type: "translate";
  text: string;
  config: TranConfig;
}

export interface TranslateChunk {
  type: "chunk";
  content: string; // accumulated full translation so far
}

export interface TranslateComplete {
  type: "complete";
}

export interface TranslateError {
  type: "error";
  message: string;
  code?: "no_api_key" | "invalid_api_key" | "timeout" | "network" | "unknown";
}

export type PortMessage = TranslateChunk | TranslateComplete | TranslateError;
