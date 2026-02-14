import browser from "webextension-polyfill";
import type { TranConfig } from "./types";
import { DEFAULT_CONFIG } from "./constants";

const STORAGE_KEY = "tran_config";

export async function loadConfig(): Promise<TranConfig> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  if (!result[STORAGE_KEY]) {
    return { ...DEFAULT_CONFIG };
  }
  const merged = { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] };
  return {
    ...merged,
    apiBaseUrl: normalizeBaseUrl(merged.apiBaseUrl),
  };
}

export async function saveConfig(config: Partial<TranConfig>): Promise<void> {
  const current = await loadConfig();
  const merged = { ...current, ...config };
  await browser.storage.local.set({ [STORAGE_KEY]: merged });
}

export function normalizeBaseUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized) return "";
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, "");
  // Ensure /v1 suffix for OpenAI-compatible chat/completions endpoint.
  if (!normalized.endsWith("/v1")) {
    normalized = `${normalized}/v1`;
  }
  return normalized;
}
