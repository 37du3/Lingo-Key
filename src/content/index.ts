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
import type { TranslateRequest } from "../shared/types";

let isTranslating = false;
let activePort: browser.Runtime.Port | null = null;
let snapshot: { element: HTMLElement; text: string; range: any } | null = null;
let isComposing = false;

// Track composition events globally
document.addEventListener("compositionstart", () => { isComposing = true; });
document.addEventListener("compositionend", () => { isComposing = false; });

// Listen for translate command from service worker
browser.runtime.onMessage.addListener((msg: any) => {
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

  activePort.onMessage.addListener((msg: any) => {
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
