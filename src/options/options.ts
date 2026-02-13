import { loadConfig, saveConfig, normalizeBaseUrl } from "../shared/storage";
import { PROMPT_TEMPLATES, TARGET_LANGUAGES, DEFAULT_CONFIG } from "../shared/constants";
import type { TranConfig, PromptStyle } from "../shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function init(): Promise<void> {
  const config = await loadConfig();

  // Populate target languages
  const langSelect = $<HTMLSelectElement>("targetLanguage");
  TARGET_LANGUAGES.forEach((lang) => {
    const opt = document.createElement("option");
    opt.value = lang;
    opt.textContent = lang;
    langSelect.appendChild(opt);
  });

  // Fill form
  $<HTMLInputElement>("apiBaseUrl").value = config.apiBaseUrl;
  $<HTMLInputElement>("apiKey").value = config.apiKey;
  $<HTMLInputElement>("model").value = config.model;
  langSelect.value = config.targetLanguage;
  $<HTMLSelectElement>("promptStyle").value = config.promptStyle;
  $<HTMLTextAreaElement>("customPrompt").value = config.customPrompt;
  $<HTMLInputElement>("maxChars").value = String(config.maxChars);

  // Auto-save on change
  document.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("input", () => save());
    el.addEventListener("change", () => save());
  });

  // Prompt style preset
  $<HTMLSelectElement>("promptStyle").addEventListener("change", (e) => {
    const style = (e.target as HTMLSelectElement).value as PromptStyle;
    $<HTMLTextAreaElement>("customPrompt").value = PROMPT_TEMPLATES[style];
    save();
  });

  // Toggle API key visibility
  $("toggleKey").addEventListener("click", () => {
    const input = $<HTMLInputElement>("apiKey");
    const btn = $("toggleKey");
    if (input.type === "password") {
      input.type = "text"; btn.textContent = "Hide";
    } else {
      input.type = "password"; btn.textContent = "Show";
    }
  });

  // Test connection
  $("testConnection").addEventListener("click", testConnection);

  // Hide quick start if already configured
  if (config.apiKey) {
    $("quick-start").style.display = "none";
  }
}

async function save(): Promise<void> {
  const config: TranConfig = {
    apiBaseUrl: normalizeBaseUrl($<HTMLInputElement>("apiBaseUrl").value),
    apiKey: $<HTMLInputElement>("apiKey").value.trim(),
    model: $<HTMLInputElement>("model").value.trim(),
    targetLanguage: $<HTMLSelectElement>("targetLanguage").value,
    promptStyle: $<HTMLSelectElement>("promptStyle").value as PromptStyle,
    customPrompt: $<HTMLTextAreaElement>("customPrompt").value,
    maxChars: parseInt($<HTMLInputElement>("maxChars").value) || DEFAULT_CONFIG.maxChars,
  };
  await saveConfig(config);
  const status = $("saveStatus");
  status.textContent = "✓ Saved";
  setTimeout(() => { status.textContent = "Settings auto-saved"; }, 1500);
}

async function testConnection(): Promise<void> {
  const result = $("testResult");
  result.textContent = "Testing...";
  result.className = "";
  try {
    const config = await loadConfig();
    const url = `${config.apiBaseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
      }),
    });
    if (res.ok) {
      result.textContent = "✓ Connection successful";
      result.className = "success";
    } else if (res.status === 401) {
      result.textContent = "✗ Invalid API Key";
      result.className = "error";
    } else {
      result.textContent = `✗ Error (${res.status})`;
      result.className = "error";
    }
  } catch (err: any) {
    result.textContent = `✗ ${err.message}`;
    result.className = "error";
  }
}

init();
