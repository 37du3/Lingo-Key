import type { PromptStyle, TranConfig } from "./types";

export const PROMPT_TEMPLATES: Record<PromptStyle, string> = {
  formal: "You are a professional translator. Translate the following text to {{target_language}} in a formal, polished tone. If the text is already in the target language, return it as-is. Output only the translated text, nothing else.",
  concise: "Translate the following text to {{target_language}}. If the text is already in the target language, return it as-is. Output only the translated text, nothing else.",
  casual: "Translate the following text to {{target_language}} in a casual, conversational tone. If the text is already in the target language, return it as-is. Output only the translated text, nothing else.",
};

export const DEFAULT_CONFIG: TranConfig = {
  apiBaseUrl: "",
  apiKey: "",
  model: "",
  targetLanguage: "English",
  promptStyle: "concise",
  customPrompt: PROMPT_TEMPLATES.concise,
  maxChars: 500,
};

export const TARGET_LANGUAGES = [
  "English", "Japanese", "Korean", "French", "German",
  "Spanish", "Portuguese", "Russian", "Arabic", "Chinese",
];

export const THROTTLE_MS = 80;
export const TOAST_DURATION_MS = 3000;
export const PORT_NAME = "tran-translate";
