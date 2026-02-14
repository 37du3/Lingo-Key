import browser from "webextension-polyfill";
import { loadConfig } from "../shared/storage";
import { PORT_NAME, THROTTLE_MS } from "../shared/constants";
import { getConfiguredShortcut, getDefaultTriggerShortcut, keyboardEventMatchesShortcut } from "../shared/shortcut";
import {
  getTextRange, replaceInputText,
  getContentEditableText,
  attemptContentEditableReplacement,
  type TextRange,
} from "./replacer";
import { showOverlay, removeOverlay } from "./overlay";
import { showToast } from "./toast";
import type { TranslateRequest } from "../shared/types";

let isTranslating = false;
let activePort: browser.Runtime.Port | null = null;
let snapshot: { element: HTMLElement; text: string; range: any } | null = null;
let isComposing = false;
let isApplyingReplacement = false;
let configuredShortcut = getDefaultTriggerShortcut();

// Track composition events globally
document.addEventListener("compositionstart", () => { isComposing = true; });
document.addEventListener("compositionend", () => { isComposing = false; });

console.log("[Tran] Content script loaded on:", window.location.href);

void loadConfig().then((config) => {
  configuredShortcut = getConfiguredShortcut(config);
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!changes.tran_config) return;
  void loadConfig().then((config) => {
    configuredShortcut = getConfiguredShortcut(config);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.isComposing || event.repeat) return;
  if (!keyboardEventMatchesShortcut(event, configuredShortcut)) return;
  event.preventDefault();
  void handleTranslate();
});

// Listen for translate command from service worker
browser.runtime.onMessage.addListener((msg: any) => {
  console.log("[Tran] Message received:", msg);
  if (msg.type === "trigger-translate") handleTranslate();
});

async function handleTranslate(): Promise<void> {
  console.log("[Tran] handleTranslate called");

  // If already translating, abort and rollback
  if (isTranslating) {
    console.log("[Tran] Already translating, aborting");
    abortAndRollback();
    return;
  }

  const el = document.activeElement as HTMLElement;
  if (!el) {
    console.log("[Tran] No active element");
    return;
  }

  // Check: is it a supported input element?
  const isInput = el instanceof HTMLInputElement && el.type !== "password";
  const isTextarea = el instanceof HTMLTextAreaElement;
  const isEditable = el.isContentEditable;
  console.log("[Tran] Element check:", { isInput, isTextarea, isEditable, tagName: el.tagName });
  if (!isInput && !isTextarea && !isEditable) {
    console.log("[Tran] Not a supported input element");
    return;
  }

  const config = await loadConfig();
  console.log("[Tran] Config loaded:", { hasApiKey: !!config.apiKey, apiBaseUrl: config.apiBaseUrl });
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
    if (!result) {
      console.log("[Tran] Failed to get contenteditable text");
      return;
    }
    text = result.text;
    range = result.range;
    snapshot = { element: el, text: el.innerHTML, range: result.range };
  }

  console.log("[Tran] Extracted text length:", text.length);
  if (!text.trim()) {
    console.log("[Tran] Empty text, aborting");
    return;
  }

  // Start translation
  isTranslating = true;
  console.log("[Tran] Starting translation, isEditable:", isEditable);
  showOverlay(el);

  setupInputInterruptListener(el);

  activePort = browser.runtime.connect({ name: PORT_NAME });
  console.log("[Tran] Port connected");
  let lastUpdate = 0;
  let pendingContent = "";

  activePort.onMessage.addListener((msg: any) => {
    console.log("[Tran] Received message:", msg.type);
    if (msg.type === "chunk") {
      pendingContent = msg.content;
      // For contenteditable, skip streaming — apply only on complete
      if (!isEditable) {
        const now = Date.now();
        if (pendingContent && now - lastUpdate >= THROTTLE_MS) {
          applyInputReplacement(el, range, pendingContent);
          lastUpdate = now;
        }
      }
    } else if (msg.type === "complete") {
      console.log("[Tran] Translation complete");
      if (pendingContent) {
        if (isEditable) {
          isApplyingReplacement = true;
          const result = attemptContentEditableReplacement(el, range as Range, pendingContent);
          setTimeout(() => { isApplyingReplacement = false; }, 0);
          if (!result.success) {
            console.log("[Tran] Contenteditable replacement unavailable:", result.reason);
            showCopyFallback(pendingContent, el, range as Range, result.reason);
          }
        } else {
          applyInputReplacement(el, range, pendingContent);
        }
      }
      cleanup();
    } else if (msg.type === "error") {
      console.error("[Tran] Translation error:", msg.message, msg.code);
      if (!isEditable) rollback();
      showToast(msg.message, {
        clickable: msg.code === "no_api_key",
        onClick: msg.code === "no_api_key"
          ? () => browser.runtime.sendMessage({ type: "open-options" })
          : undefined,
      });
      cleanup();
    }
  });

  activePort.onDisconnect.addListener(() => {
    console.log("[Tran] Port disconnected");
    cleanup();
  });

  const request: TranslateRequest = { type: "translate", text, config };
  console.log("[Tran] Sending translate request");
  try {
    activePort.postMessage(request);
  } catch (err) {
    console.warn("[Tran] Failed to send translate request:", err);
    cleanup();
  }
}

function applyInputReplacement(
  el: HTMLElement, range: any, newText: string
): void {
  console.log("[Tran] Applying input replacement:", { textLength: newText.length });
  isApplyingReplacement = true;
  try {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
    replaceInputText(inputEl, range as TextRange, newText);
    range.end = range.start + newText.length;
  } finally {
    setTimeout(() => { isApplyingReplacement = false; }, 0);
  }
}

function getPasteShortcut(): string {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "Cmd+V" : "Ctrl+V";
}

async function tryCopyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn("[Tran] Clipboard write failed:", err);
    return false;
  }
}

function prepareContentEditableForPaste(
  targetEl: HTMLElement,
  originalRange: Range
): boolean {
  if (!targetEl.isContentEditable) return false;
  targetEl.focus();
  const sel = window.getSelection();
  if (!sel) return false;

  const candidate = originalRange.cloneRange();
  const start = candidate.startContainer;
  const end = candidate.endContainer;
  const hasValidRange = start.isConnected && end.isConnected
    && targetEl.contains(start) && targetEl.contains(end);

  sel.removeAllRanges();
  if (hasValidRange) {
    sel.addRange(candidate);
    return true;
  }

  const fullRange = document.createRange();
  fullRange.selectNodeContents(targetEl);
  sel.addRange(fullRange);
  return true;
}

function showCopyFallback(
  text: string,
  targetEl: HTMLElement,
  originalRange: Range,
  reason?: string
): void {
  removeOverlay();
  const pasteShortcut = getPasteShortcut();
  const selected = prepareContentEditableForPaste(targetEl, originalRange);
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

  const guidance = document.createElement("div");
  guidance.style.cssText = "margin: 0 0 10px 0; color: #666;";
  guidance.textContent = selected
    ? `已选中原文。建议直接按 ${pasteShortcut} 覆盖。`
    : `请先选中原文，再按 ${pasteShortcut} 粘贴译文。`;

  if (reason) {
    const note = document.createElement("div");
    note.textContent = `当前编辑器不支持安全自动替换（${reason}）。`;
    note.style.cssText = "margin: 0 0 10px 0; color: #666;";
    panel.appendChild(note);
  }

  panel.append(guidance);
  const btn = document.createElement("button");
  btn.textContent = "复制并重新选中";
  btn.style.cssText = "padding: 6px 14px; border: none; border-radius: 4px; background: #4CAF50; color: #fff; cursor: pointer;";
  btn.onclick = async () => {
    const copied = await tryCopyText(text);
    const reselectionOk = prepareContentEditableForPaste(targetEl, originalRange);
    guidance.textContent = copied
      ? `已复制并${reselectionOk ? "选中原文" : "聚焦输入框"}，按 ${pasteShortcut} 覆盖。`
      : `复制失败，请手动复制后按 ${pasteShortcut}。`;
    if (copied) panel.remove();
  };
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "关闭";
  closeBtn.style.cssText = "padding: 6px 14px; border: none; border-radius: 4px; background: #ccc; color: #333; cursor: pointer; margin-left: 8px;";
  closeBtn.onclick = () => panel.remove();
  panel.append(pre, btn, closeBtn);
  document.body.appendChild(panel);

  void tryCopyText(text).then((copied) => {
    if (!copied) return;
    guidance.textContent = selected
      ? `已自动复制并选中原文，直接按 ${pasteShortcut} 覆盖。`
      : `已自动复制。请先选中原文，再按 ${pasteShortcut} 覆盖。`;
  });
}

let inputListener: (() => void) | null = null;

function setupInputInterruptListener(el: HTMLElement): void {
  const handler = () => {
    if (isComposing || isApplyingReplacement) return;
    console.log("[Tran] User input detected, aborting translation");
    abortAndRollback();
  };
  el.addEventListener("input", handler);
  inputListener = () => el.removeEventListener("input", handler);
}

function abortAndRollback(): void {
  activePort?.disconnect();
  if (inputListener) {
    inputListener();
    inputListener = null;
  }
  rollback();
  cleanup();
}

function rollback(): void {
  if (!snapshot) return;
  const { element, text } = snapshot;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // No rollback for contenteditable — we use copy fallback instead
}

function cleanup(): void {
  isTranslating = false;
  activePort = null;
  snapshot = null;
  removeOverlay();
  if (inputListener) { inputListener(); inputListener = null; }
}
