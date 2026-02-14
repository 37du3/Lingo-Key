export interface TextRange {
  start: number;
  end: number;
  text: string;
}

export interface ContentEditableReplacementResult {
  success: boolean;
  reason: string;
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

// Domains known to use framework-managed editors where DOM replacement is unreliable.
const KNOWN_COMPLEX_EDITOR_DOMAINS = [
  "perplexity.ai",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
  "moonshot.cn",
  "kimi.com",
];

const COMPLEX_EDITOR_SELECTOR = [
  "[data-slate-editor]",
  "[data-slate-node]",
  ".DraftEditor-root",
  ".ProseMirror",
  ".ql-editor",
  ".tiptap",
  "[data-lexical-editor]",
  ".cm-content",
].join(", ");

function isEditableElement(element: HTMLElement): boolean {
  if (element.isContentEditable) return true;
  const contenteditable = element.getAttribute("contenteditable");
  return contenteditable === "" || contenteditable === "true" || contenteditable === "plaintext-only";
}

function getEditingHost(element: Element | null): HTMLElement | null {
  if (!(element instanceof HTMLElement)) return null;
  let current: HTMLElement | null = element;
  let host: HTMLElement | null = null;
  while (current) {
    if (isEditableElement(current)) host = current;
    current = current.parentElement;
  }
  return host;
}

export function isKnownComplexContentEditableDomain(
  hostname: string = window.location.hostname
): boolean {
  return KNOWN_COMPLEX_EDITOR_DOMAINS.some((domain) => hostname.includes(domain));
}

export function shouldUseCopyFallback(element: Element | null): boolean {
  const host = getEditingHost(element);
  if (!host) return false;

  if (isKnownComplexContentEditableDomain()) {
    return true;
  }

  return host.matches(COMPLEX_EDITOR_SELECTOR) || !!host.querySelector(COMPLEX_EDITOR_SELECTOR);
}

function isSingleTextNodeHost(host: HTMLElement, node: Text): boolean {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  return textNodes.length === 1 && textNodes[0] === node;
}

export function attemptContentEditableReplacement(
  activeElement: HTMLElement,
  range: Range,
  newText: string
): ContentEditableReplacementResult {
  const host = getEditingHost(activeElement);
  if (!host) {
    return { success: false, reason: "No contenteditable host" };
  }

  if (shouldUseCopyFallback(host)) {
    return { success: false, reason: "Complex editor host" };
  }

  if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
    return { success: false, reason: "Range spans multiple nodes" };
  }

  const textNode = range.startContainer as Text;
  if (!textNode.isConnected || !host.contains(textNode)) {
    return { success: false, reason: "Range node detached from host" };
  }

  if (host.children.length > 0 || !isSingleTextNodeHost(host, textNode)) {
    return { success: false, reason: "Host is not a simple text-only editor" };
  }

  const beforeText = textNode.data;
  const start = range.startOffset;
  const end = range.endOffset;
  if (start < 0 || end < start || end > beforeText.length) {
    return { success: false, reason: "Invalid range offsets" };
  }

  const expected = beforeText.slice(0, start) + newText + beforeText.slice(end);
  const sel = window.getSelection();
  if (!sel) {
    return { success: false, reason: "Selection unavailable" };
  }

  const replaceRange = range.cloneRange();
  sel.removeAllRanges();
  sel.addRange(replaceRange);
  const commandOk = document.execCommand("insertText", false, newText);
  const actual = host.textContent ?? "";

  if (!commandOk || actual !== expected) {
    // Safe best-effort rollback: only done for text-only hosts.
    host.textContent = beforeText;
    return {
      success: false,
      reason: commandOk ? "Post-replacement verification failed" : "execCommand failed",
    };
  }

  return { success: true, reason: "" };
}

export function replaceContentEditableText(range: Range, newText: string): void {
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) throw new Error("No active element");
  const result = attemptContentEditableReplacement(activeElement, range, newText);
  if (!result.success) throw new Error(result.reason);
}
