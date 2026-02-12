import browser from "webextension-polyfill";
import type { TranConfig } from "./types";
import { DEFAULT_CONFIG } from "./constants";

const STORAGE_KEY = "tran_config";

export async function loadConfig(): Promise<TranConfig> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  if (!result[STORAGE_KEY]) {
    return { ...DEFAULT_CONFIG };
  }
  return { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] };
}

export async function saveConfig(config: Partial<TranConfig>): Promise<void> {
  const current = await loadConfig();
  const merged = { ...current, ...config };
  await browser.storage.local.set({ [STORAGE_KEY]: merged });
}

export function normalizeBaseUrl(url: string): string {
  let normalized = url.trim();
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, "");
  // Remove trailing /v1 or /v1/ if present (we add it ourselves)
  normalized = normalized.replace(/\/v1$/, "");
  return normalized;
}
