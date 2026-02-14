import { loadConfig, saveConfig, normalizeBaseUrl } from "../shared/storage";
import { PROMPT_TEMPLATES, TARGET_LANGUAGES, DEFAULT_CONFIG } from "../shared/constants";
import type { TranConfig, PromptStyle } from "../shared/types";
import { getConfiguredShortcut, getDefaultTriggerShortcut, shortcutFromKeyboardEvent } from "../shared/shortcut";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TAB_IDS = ["api", "translation", "shortcut"] as const;
type TabId = (typeof TAB_IDS)[number];

export function getShortcutLabel(shortcut?: string): string {
  return shortcut && shortcut.trim() ? shortcut : "Not set";
}

export function activateTab(tabId: TabId, root: ParentNode = document): void {
  TAB_IDS.forEach((id) => {
    const tab = root.querySelector<HTMLElement>(`.tab[data-tab="${id}"]`);
    const panel = root.querySelector<HTMLElement>(`.tab-panel[data-panel="${id}"]`);
    const isActive = id === tabId;
    if (tab) {
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    }
    if (panel) {
      panel.hidden = !isActive;
    }
  });
}

function updateShortcutDisplay(shortcut: string): void {
  const label = getShortcutLabel(shortcut);
  $<HTMLElement>("currentShortcut").textContent = label;
  $<HTMLInputElement>("shortcutInput").value = label;
}

function setupTabs(): void {
  document.querySelectorAll<HTMLButtonElement>(".tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabId = tab.dataset.tab as TabId;
      if (TAB_IDS.includes(tabId)) activateTab(tabId);
    });
  });
}

function setupShortcutRecorder(): void {
  const input = $<HTMLInputElement>("shortcutInput");
  const help = $<HTMLElement>("shortcutHelp");

  input.addEventListener("keydown", async (event) => {
    event.preventDefault();
    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut) {
      help.textContent = "Invalid shortcut. Use at least one modifier key plus another key.";
      return;
    }
    input.value = shortcut;
    $<HTMLElement>("currentShortcut").textContent = shortcut;
    help.textContent = `Saved: ${shortcut}`;
    await save();
  });

  $("resetShortcut").addEventListener("click", async () => {
    const defaultShortcut = getDefaultTriggerShortcut();
    input.value = defaultShortcut;
    $<HTMLElement>("currentShortcut").textContent = defaultShortcut;
    help.textContent = `Reset to default: ${defaultShortcut}`;
    await save();
  });
}

async function init(): Promise<void> {
  const config = await loadConfig();
  setupTabs();
  activateTab("api");

  // Populate target languages
  const langSelect = $<HTMLSelectElement>("targetLanguage");
  langSelect.innerHTML = "";
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
  updateShortcutDisplay(getConfiguredShortcut(config));

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
  setupShortcutRecorder();

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
    shortcut: $<HTMLInputElement>("shortcutInput").value.trim(),
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

if (document.getElementById("options-root")) {
  void init();
}
