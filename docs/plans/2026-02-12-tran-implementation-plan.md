# Tran Chrome Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome extension that translates text in web input fields using LLM streaming, triggered by keyboard shortcut.

**Architecture:** Chrome MV3 extension with three modules: Content Script (input detection, text replacement, UI overlay), Service Worker (OpenAI-compatible streaming API calls), Options Page (configuration). Communication via `chrome.runtime.connect` port messaging.

**Tech Stack:** TypeScript, Vite + `vite-plugin-web-extension`, Vitest for unit tests, `webextension-polyfill` for cross-browser API.

**Note:** Design doc referenced `@crxjs/vite-plugin`, but `vite-plugin-web-extension` is more actively maintained and has better Vite 5+ support. Functionally equivalent.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `manifest.json`

**Step 1: Initialize project and install dependencies**

Run:
```bash
cd /Users/yangming/code/tran
npm init -y
npm install -D typescript vite vite-plugin-web-extension webextension-polyfill @types/webextension-polyfill vitest
```

**Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["webextension-polyfill"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Tran",
  "version": "1.0.0",
  "description": "Translate text in input fields using LLM",
  "permissions": ["storage"],
  "commands": {
    "trigger-translate": {
      "suggested_key": {
        "default": "Alt+T",
        "mac": "Ctrl+Shift+T"
      },
      "description": "Translate text in current input field"
    }
  },
  "background": {
    "service_worker": "src/background/service-worker.ts"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"]
    }
  ],
  "options_page": "src/options/options.html"
}
```

**Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [webExtension()],
  build: {
    minify: false,
  },
});
```

**Step 5: Create placeholder source files**

Create empty entry points so the build can run:
- `src/background/service-worker.ts` → `export {};`
- `src/content/index.ts` → `export {};`
- `src/options/options.html` → minimal HTML shell
- `src/options/options.ts` → `export {};`
- `src/options/options.css` → empty

**Step 6: Verify build works**

Run: `npx vite build`
Expected: Build succeeds, `dist/` directory created with manifest.json

**Step 7: Commit**

```bash
git init
echo "node_modules/\ndist/" > .gitignore
git add -A
git commit -m "chore: project scaffolding with vite-plugin-web-extension"
```

---

### Task 2: Shared Types, Constants, and Storage

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/constants.ts`
- Create: `src/shared/storage.ts`
- Create: `tests/shared/storage.test.ts`

**Step 1: Write `src/shared/types.ts`**

```ts
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
  content: string;       // accumulated full translation so far
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
```

**Step 2: Write `src/shared/constants.ts`**

```ts
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
```

**Step 3: Write failing test for storage**

Create `tests/shared/storage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig, saveConfig } from "../../src/shared/storage";
import { DEFAULT_CONFIG } from "../../src/shared/constants";

// Mock chrome.storage.local
const mockStorage: Record<string, any> = {};
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn((keys) =>
        Promise.resolve(
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((k: string) => [k, mockStorage[k]])
          )
        )
      ),
      set: vi.fn((items) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
});

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
});

describe("loadConfig", () => {
  it("returns default config when storage is empty", async () => {
    const config = await loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("merges stored values with defaults", async () => {
    mockStorage.config = { apiKey: "sk-test", model: "gpt-4o" };
    const config = await loadConfig();
    expect(config.apiKey).toBe("sk-test");
    expect(config.model).toBe("gpt-4o");
    expect(config.maxChars).toBe(500);
  });
});

describe("saveConfig", () => {
  it("persists config to chrome.storage.local", async () => {
    const config = { ...DEFAULT_CONFIG, apiKey: "sk-new" };
    await saveConfig(config);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ config });
  });
});
```

**Step 4: Run test to verify it fails**

Run: `npx vitest run tests/shared/storage.test.ts`
Expected: FAIL — `loadConfig` and `saveConfig` not found

**Step 5: Write `src/shared/storage.ts`**

```ts
import type { TranConfig } from "./types";
import { DEFAULT_CONFIG } from "./constants";

export async function loadConfig(): Promise<TranConfig> {
  const result = await chrome.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...(result.config || {}) };
}

export async function saveConfig(config: TranConfig): Promise<void> {
  await chrome.storage.local.set({ config });
}

export function normalizeBaseUrl(url: string): string {
  let normalized = url.trim().replace(/\/+$/, "");
  if (normalized && !normalized.endsWith("/v1")) {
    normalized += "/v1";
  }
  return normalized;
}
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/shared/storage.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: shared types, constants, and storage layer"
```

---

### Task 3: Service Worker — Streaming API Client

**Files:**
- Create: `src/background/service-worker.ts`
- Create: `src/background/api-client.ts`
- Create: `tests/background/api-client.test.ts`

**Step 1: Write failing test for SSE stream parsing**

Create `tests/background/api-client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "../../src/background/api-client";

describe("parseSSEChunk", () => {
  it("extracts content from a valid SSE data line", () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
    expect(parseSSEChunk(line)).toBe("Hello");
  });

  it("returns null for [DONE] signal", () => {
    expect(parseSSEChunk("data: [DONE]")).toBeNull();
  });

  it("returns null for empty lines", () => {
    expect(parseSSEChunk("")).toBeNull();
  });

  it("returns null for lines without delta content", () => {
    const line = 'data: {"choices":[{"delta":{}}]}';
    expect(parseSSEChunk(line)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/background/api-client.test.ts`
Expected: FAIL

**Step 3: Write `src/background/api-client.ts`**

```ts
import type { TranConfig } from "../shared/types";

export function parseSSEChunk(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

export function buildRequestBody(text: string, config: TranConfig): object {
  const systemPrompt = config.customPrompt.replace(
    /\{\{target_language\}\}/g,
    config.targetLanguage
  );
  return {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    stream: true,
  };
}

export async function* streamTranslation(
  text: string,
  config: TranConfig,
  signal: AbortSignal
): AsyncGenerator<string> {
  const url = `${config.apiBaseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildRequestBody(text, config)),
    signal,
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error("API Key 无效，请检查设置");
    if (status === 429) throw new Error("请求过于频繁，请稍后再试");
    throw new Error(`API 请求失败 (${status})`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!; // keep incomplete line in buffer

    for (const line of lines) {
      const content = parseSSEChunk(line);
      if (content !== null) {
        accumulated += content;
        yield accumulated;
      }
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/background/api-client.test.ts`
Expected: PASS

**Step 5: Write `src/background/service-worker.ts`**

```ts
import browser from "webextension-polyfill";
import { streamTranslation } from "./api-client";
import { loadConfig } from "../shared/storage";
import { PORT_NAME } from "../shared/constants";
import type { TranslateRequest, PortMessage } from "../shared/types";

// Open options page on install
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
});

// Forward chrome.commands to the active tab's content script
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "trigger-translate") return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
  }
});

// Handle streaming translation via port connections
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  let abortController: AbortController | null = null;

  port.onMessage.addListener(async (msg: TranslateRequest) => {
    if (msg.type !== "translate") return;

    abortController = new AbortController();

    try {
      const config = msg.config;
      if (!config.apiKey) {
        const errorMsg: PortMessage = {
          type: "error",
          message: "请先配置 API Key",
          code: "no_api_key",
        };
        port.postMessage(errorMsg);
        return;
      }

      for await (const accumulated of streamTranslation(
        msg.text,
        config,
        abortController.signal
      )) {
        const chunk: PortMessage = { type: "chunk", content: accumulated };
        port.postMessage(chunk);
      }

      const complete: PortMessage = { type: "complete" };
      port.postMessage(complete);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const errorMsg: PortMessage = {
        type: "error",
        message: err.message || "翻译失败",
        code: err.message?.includes("API Key") ? "invalid_api_key" : "unknown",
      };
      port.postMessage(errorMsg);
    }
  });

  port.onDisconnect.addListener(() => {
    abortController?.abort();
    abortController = null;
  });
});
```

**Step 6: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: service worker with streaming API client"
```

---

### Task 4: Content Script — Text Replacer

**Files:**
- Create: `src/content/replacer.ts`
- Create: `tests/content/replacer.test.ts`

**Step 1: Write failing test for text extraction**

Create `tests/content/replacer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractText, getTextRange } from "../../src/content/replacer";

describe("getTextRange", () => {
  it("returns selection range when text is selected", () => {
    const el = document.createElement("textarea");
    el.value = "Hello 你好世界";
    el.selectionStart = 6;
    el.selectionEnd = 10;
    const range = getTextRange(el, 500);
    expect(range).toEqual({ start: 6, end: 10, text: "你好世界" });
  });

  it("returns cursor-back range when no selection", () => {
    const el = document.createElement("textarea");
    el.value = "A".repeat(600) + "你好";
    el.selectionStart = 602;
    el.selectionEnd = 602;
    const range = getTextRange(el, 500);
    expect(range.text.length).toBe(500);
    expect(range.end).toBe(602);
    expect(range.start).toBe(102);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/replacer.test.ts`
Expected: FAIL

**Step 3: Write `src/content/replacer.ts`**

```ts
export interface TextRange {
  start: number;
  end: number;
  text: string;
}

export function getTextRange(
  el: HTMLInputElement | HTMLTextAreaElement,
  maxChars: number
): TextRange {
  const { selectionStart, selectionEnd, value } = el;
  if (selectionStart !== selectionEnd && selectionStart !== null && selectionEnd !== null) {
    return { start: selectionStart, end: selectionEnd, text: value.slice(selectionStart, selectionEnd) };
  }
  const cursor = selectionEnd ?? value.length;
  const start = Math.max(0, cursor - maxChars);
  return { start, end: cursor, text: value.slice(start, cursor) };
}

export function replaceInputText(
  el: HTMLInputElement | HTMLTextAreaElement,
  range: TextRange,
  newText: string
): void {
  el.focus();
  el.setSelectionRange(range.start, range.end);
  document.execCommand("insertText", false, newText);
}

export function getContentEditableText(maxChars: number): {
  text: string;
  range: Range;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  if (!range.collapsed) {
    return { text: range.toString(), range: range.cloneRange() };
  }

  // No selection: get text before cursor up to maxChars
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const fullText = node.textContent || "";
  const offset = range.startOffset;
  const start = Math.max(0, offset - maxChars);
  const text = fullText.slice(start, offset);
  const backRange = document.createRange();
  backRange.setStart(node, start);
  backRange.setEnd(node, offset);
  return { text, range: backRange };
}

export function replaceContentEditableText(
  range: Range,
  newText: string
): void {
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertText", false, newText);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/content/replacer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: text extraction and replacement logic"
```

---

### Task 5: Content Script — Overlay & Toast

**Files:**
- Create: `src/content/overlay.ts`
- Create: `src/content/toast.ts`

**Step 1: Write `src/content/overlay.ts`**

Floating `✨ Translating...` indicator anchored to input element.

```ts
import { TOAST_DURATION_MS } from "../shared/constants";

let overlayEl: HTMLDivElement | null = null;

export function showOverlay(anchor: HTMLElement): void {
  removeOverlay();
  overlayEl = document.createElement("div");
  overlayEl.textContent = "✨ Translating...";
  overlayEl.setAttribute("style", `
    position: fixed; z-index: 2147483647;
    padding: 4px 10px; border-radius: 6px;
    background: #1a1a2e; color: #e0e0e0;
    font-size: 13px; font-family: system-ui, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    pointer-events: none; white-space: nowrap;
  `);
  document.body.appendChild(overlayEl);
  positionOverlay(anchor);
}

export function removeOverlay(): void {
  overlayEl?.remove();
  overlayEl = null;
}

function positionOverlay(anchor: HTMLElement): void {
  if (!overlayEl) return;
  const rect = anchor.getBoundingClientRect();
  let top = rect.top - 30;
  let left = rect.right - overlayEl.offsetWidth;

  // Viewport collision detection
  if (top < 4) top = rect.bottom + 4;
  if (left < 4) left = rect.left;
  if (left + overlayEl.offsetWidth > window.innerWidth - 4) {
    left = window.innerWidth - overlayEl.offsetWidth - 4;
  }

  overlayEl.style.top = `${top}px`;
  overlayEl.style.left = `${left}px`;
}
```

**Step 2: Write `src/content/toast.ts`**

```ts
import { TOAST_DURATION_MS } from "../shared/constants";

export function showToast(
  message: string,
  options?: { clickable?: boolean; onClick?: () => void }
): void {
  const toast = document.createElement("div");
  toast.textContent = message;
  const clickable = options?.clickable ?? false;
  toast.setAttribute("style", `
    position: fixed; bottom: 20px; right: 20px;
    z-index: 2147483647;
    padding: 10px 16px; border-radius: 8px;
    background: #dc3545; color: #fff;
    font-size: 14px; font-family: system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    cursor: ${clickable ? "pointer" : "default"};
    transition: opacity 0.3s;
  `);
  if (clickable && options?.onClick) {
    toast.style.pointerEvents = "auto";
    toast.addEventListener("click", () => {
      options.onClick!();
      toast.remove();
    });
  }
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, TOAST_DURATION_MS);
}
```

**Step 3: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: overlay and toast UI components"
```

---

### Task 6: Content Script — Main Orchestration

**Files:**
- Create: `src/content/index.ts`

**Step 1: Write `src/content/index.ts`**

This is the core orchestration: listens for translate command, extracts text, manages port connection, handles streaming replacement, interrupt, and rollback.

```ts
import browser from "webextension-polyfill";
import { loadConfig } from "../shared/storage";
import { PORT_NAME, THROTTLE_MS } from "../shared/constants";
import {
  getTextRange, replaceInputText,
  getContentEditableText, replaceContentEditableText,
  type TextRange,
} from "./replacer";
import { showOverlay, removeOverlay } from "./overlay";
import { showToast } from "./toast";
import type { TranConfig, PortMessage, TranslateRequest } from "../shared/types";

let isTranslating = false;
let activePort: browser.Runtime.Port | null = null;
let snapshot: { element: HTMLElement; text: string; range: any } | null = null;
let isComposing = false;

// Track composition events globally
document.addEventListener("compositionstart", () => { isComposing = true; });
document.addEventListener("compositionend", () => { isComposing = false; });

// Listen for translate command from service worker
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "trigger-translate") handleTranslate();
});

async function handleTranslate(): Promise<void> {
  // If already translating, abort and rollback
  if (isTranslating) {
    abortAndRollback();
    return;
  }

  const el = document.activeElement as HTMLElement;
  if (!el) return;

  // Check: is it a supported input element?
  const isInput = el instanceof HTMLInputElement && el.type !== "password";
  const isTextarea = el instanceof HTMLTextAreaElement;
  const isEditable = el.isContentEditable;
  if (!isInput && !isTextarea && !isEditable) return;

  const config = await loadConfig();
  if (!config.apiKey) {
    showToast("请先配置 API Key，点击前往设置", {
      clickable: true,
      onClick: () => browser.runtime.sendMessage({ type: "open-options" }),
    });
    return;
  }

  // Extract text
  let text: string;
  let range: any;

  if (isInput || isTextarea) {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
    const r = getTextRange(inputEl, config.maxChars);
    text = r.text;
    range = r;
    snapshot = { element: el, text: inputEl.value, range: r };
  } else {
    const result = getContentEditableText(config.maxChars);
    if (!result) return;
    text = result.text;
    range = result.range;
    snapshot = { element: el, text: el.innerHTML, range: result.range };
  }

  if (!text.trim()) return;

  // Start translation
  isTranslating = true;
  showOverlay(el);
  setupInputInterruptListener(el);

  activePort = browser.runtime.connect({ name: PORT_NAME });
  let lastUpdate = 0;
  let pendingContent = "";

  activePort.onMessage.addListener((msg: PortMessage) => {
    if (msg.type === "chunk") {
      pendingContent = msg.content;
      const now = Date.now();
      if (now - lastUpdate >= THROTTLE_MS) {
        applyReplacement(el, range, pendingContent, isEditable);
        lastUpdate = now;
      }
    } else if (msg.type === "complete") {
      // Final flush
      if (pendingContent) {
        applyReplacement(el, range, pendingContent, isEditable);
      }
      cleanup();
    } else if (msg.type === "error") {
      rollback();
      showToast(msg.message, {
        clickable: msg.code === "no_api_key",
        onClick: msg.code === "no_api_key"
          ? () => browser.runtime.sendMessage({ type: "open-options" })
          : undefined,
      });
      cleanup();
    }
  });

  activePort.onDisconnect.addListener(() => cleanup());

  const request: TranslateRequest = { type: "translate", text, config };
  activePort.postMessage(request);
}
```

Remaining functions in `src/content/index.ts`:

```ts
function applyReplacement(
  el: HTMLElement, range: any, newText: string, isEditable: boolean
): void {
  if (isEditable) {
    try {
      replaceContentEditableText(range as Range, newText);
    } catch {
      // Fallback: show copy panel
      showCopyFallback(newText);
      cleanup();
    }
  } else {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
    replaceInputText(inputEl, range as TextRange, newText);
    // Update range end for next chunk
    range.end = range.start + newText.length;
  }
}

function showCopyFallback(text: string): void {
  removeOverlay();
  const panel = document.createElement("div");
  panel.setAttribute("style", `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 2147483647; padding: 16px; border-radius: 10px;
    background: #fff; color: #333; font-size: 14px;
    font-family: system-ui, sans-serif;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2); max-width: 400px;
  `);
  const pre = document.createElement("pre");
  pre.textContent = text;
  pre.style.cssText = "white-space: pre-wrap; margin: 0 0 10px 0;";
  const btn = document.createElement("button");
  btn.textContent = "复制译文";
  btn.style.cssText = "padding: 6px 14px; border: none; border-radius: 4px; background: #4CAF50; color: #fff; cursor: pointer;";
  btn.onclick = () => {
    navigator.clipboard.writeText(text);
    panel.remove();
  };
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "关闭";
  closeBtn.style.cssText = "padding: 6px 14px; border: none; border-radius: 4px; background: #ccc; color: #333; cursor: pointer; margin-left: 8px;";
  closeBtn.onclick = () => panel.remove();
  panel.append(pre, btn, closeBtn);
  document.body.appendChild(panel);
}

let inputListener: (() => void) | null = null;

function setupInputInterruptListener(el: HTMLElement): void {
  const handler = () => {
    if (isComposing) return; // Ignore composition events
    abortAndRollback();
  };
  el.addEventListener("input", handler);
  inputListener = () => el.removeEventListener("input", handler);
}

function abortAndRollback(): void {
  activePort?.disconnect();
  rollback();
  cleanup();
}

function rollback(): void {
  if (!snapshot) return;
  const { element, text } = snapshot;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (element.isContentEditable) {
    element.innerHTML = text;
  }
}

function cleanup(): void {
  isTranslating = false;
  activePort = null;
  snapshot = null;
  removeOverlay();
  if (inputListener) { inputListener(); inputListener = null; }
}
```

**Step 2: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: content script orchestration with interrupt and rollback"
```

---

### Task 7: Service Worker — Command Routing & Install Hook

**Files:**
- Modify: `src/background/service-worker.ts`

**Step 1: Add command routing and install handler**

Add to the top of `src/background/service-worker.ts` (before the existing port listener):

```ts
import browser from "webextension-polyfill";

// On install: open options page for first-time setup
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
});

// Route chrome.commands to active tab's content script
browser.commands.onCommand.addListener(async (command) => {
  if (command === "trigger-translate") {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
    }
  }
});

// Handle open-options request from content script
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "open-options") {
    browser.runtime.openOptionsPage();
  }
});
```

**Step 2: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: command routing and install hook in service worker"
```

---

### Task 8: Options Page

**Files:**
- Create: `src/options/options.html`
- Create: `src/options/options.ts`
- Create: `src/options/options.css`

**Step 1: Write `src/options/options.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tran Settings</title>
  <link rel="stylesheet" href="./options.css" />
</head>
<body>
  <div class="container">
    <h1>Tran Settings</h1>

    <!-- Quick Start -->
    <div id="quick-start" class="card info">
      <h3>Quick Start</h3>
      <p>Configure your API to get started. Get an API key from
        <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI</a> or
        <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek</a>.
      </p>
      <p class="privacy-note">Your data is sent directly to the API you configure. No intermediate servers.</p>
    </div>

    <!-- API Config -->
    <section class="card">
      <h2>API Configuration</h2>
      <label>API Base URL
        <input type="text" id="apiBaseUrl" placeholder="https://api.openai.com/v1" />
      </label>
      <label>API Key
        <div class="password-field">
          <input type="password" id="apiKey" placeholder="sk-..." />
          <button type="button" id="toggleKey">Show</button>
        </div>
      </label>
      <label>Model
        <input type="text" id="model" placeholder="gpt-4o" />
      </label>
      <button type="button" id="testConnection">Test Connection</button>
      <span id="testResult"></span>
    </section>

    <!-- Translation Config -->
    <section class="card">
      <h2>Translation</h2>
      <label>Target Language
        <select id="targetLanguage"></select>
      </label>
      <label>Prompt Style
        <select id="promptStyle">
          <option value="formal">Formal</option>
          <option value="concise">Concise</option>
          <option value="casual">Casual</option>
        </select>
      </label>
      <label>Custom Prompt
        <textarea id="customPrompt" rows="3"></textarea>
      </label>
      <label>Max Characters
        <input type="number" id="maxChars" min="50" max="5000" />
      </label>
    </section>

    <!-- Shortcut -->
    <section class="card">
      <h2>Shortcut</h2>
      <p>Current shortcut is managed by Chrome.
        <a href="chrome://extensions/shortcuts" id="shortcutLink">
          Change shortcut →
        </a>
      </p>
    </section>

    <p class="save-status" id="saveStatus">Settings auto-saved</p>
  </div>
  <script type="module" src="./options.ts"></script>
</body>
</html>
```

**Step 2: Write `src/options/options.ts`**

```ts
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
```

**Step 3: Write `src/options/options.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
.container { max-width: 600px; margin: 0 auto; }
h1 { font-size: 22px; margin-bottom: 16px; }
h2 { font-size: 16px; margin-bottom: 12px; color: #555; }
.card { background: #fff; border-radius: 10px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.card.info { background: #e8f4fd; border-left: 4px solid #2196F3; }
.privacy-note { font-size: 12px; color: #666; margin-top: 6px; }
label { display: block; margin-bottom: 12px; font-size: 14px; font-weight: 500; }
input[type="text"], input[type="password"], input[type="number"], select, textarea {
  display: block; width: 100%; margin-top: 4px; padding: 8px 10px;
  border: 1px solid #ddd; border-radius: 6px; font-size: 14px;
}
textarea { resize: vertical; font-family: monospace; }
.password-field { display: flex; gap: 8px; margin-top: 4px; }
.password-field input { flex: 1; }
button { padding: 8px 16px; border: none; border-radius: 6px; background: #4CAF50; color: #fff; cursor: pointer; font-size: 14px; }
button:hover { opacity: 0.9; }
#toggleKey { background: #eee; color: #333; }
#testResult { margin-left: 10px; font-size: 13px; }
#testResult.success { color: #4CAF50; }
#testResult.error { color: #dc3545; }
.save-status { text-align: center; font-size: 12px; color: #999; margin-top: 8px; }
a { color: #2196F3; }
```

**Step 4: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: options page with API config, translation settings, and quick start"
```

---

### Task 9: End-to-End Manual Testing

**Files:** None (manual verification)

**Step 1: Build and load extension**

```bash
cd /Users/yangming/code/tran
npx vite build
```

Open Chrome → `chrome://extensions/` → Enable Developer Mode → Load unpacked → select `dist/` folder.

**Step 2: Verify first-install flow**

Expected: Options page opens automatically after loading the extension.

**Step 3: Configure API and test connection**

Fill in a valid API Base URL, API Key, and Model. Click "Test Connection".
Expected: "✓ Connection successful"

**Step 4: Test translation on textarea**

Go to any page with a textarea (e.g., GitHub issue comment).
Type some Chinese text, press `Alt+T` (or `Ctrl+Shift+T` on macOS).
Expected: `✨ Translating...` overlay appears, text is progressively replaced with English.

**Step 5: Test interrupt (shortcut)**

Start a translation, press the shortcut again during streaming.
Expected: Translation stops, text reverts to original Chinese.

**Step 6: Test interrupt (user input)**

Start a translation, type something during streaming.
Expected: Translation stops, text reverts to original Chinese.

**Step 7: Test Ctrl+Z undo**

Complete a successful translation, then press `Ctrl+Z` / `Cmd+Z`.
Expected: Text reverts to original Chinese.

**Step 8: Test error handling**

Set an invalid API Key, trigger translation.
Expected: Toast shows "API Key 无效" or similar, text unchanged.

**Step 9: Test password field protection**

Focus a password input, press shortcut.
Expected: Nothing happens.

**Step 10: Commit final state**

```bash
git add -A
git commit -m "chore: ready for manual testing"
```

---

### Task 10: Compatibility Testing

**Files:** None (manual verification)

Test on each site in the compatibility matrix:

| Site | Element | Status |
|------|---------|--------|
| GitHub (issue comment) | textarea | |
| GitHub (PR review) | contenteditable | |
| Stack Overflow (answer) | textarea | |
| Gmail (compose) | contenteditable | |
| Outlook Web (compose) | contenteditable | |
| Slack Web (message) | contenteditable | |

For each: trigger translation, verify streaming replacement, verify undo, verify interrupt.

Document any failures. If `contenteditable` replacement fails on a site, verify the copy-fallback panel appears.

**After testing, commit any fixes:**

```bash
git add -A
git commit -m "fix: compatibility adjustments from site testing"
```
