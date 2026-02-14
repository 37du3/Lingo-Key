/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { getTextRange, attemptContentEditableReplacement, isKnownComplexContentEditableDomain, shouldUseCopyFallback } from "../../src/content/replacer";

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

  it("returns all text when content is shorter than maxChars", () => {
    const el = document.createElement("textarea");
    el.value = "短文本";
    el.selectionStart = 3;
    el.selectionEnd = 3;
    const range = getTextRange(el, 500);
    expect(range).toEqual({ start: 0, end: 3, text: "短文本" });
  });
});

describe("contenteditable replacement strategy", () => {
  it("marks known AI chat domains as copy fallback", () => {
    expect(isKnownComplexContentEditableDomain("www.perplexity.ai")).toBe(true);
    expect(isKnownComplexContentEditableDomain("kimi.moonshot.cn")).toBe(true);
    expect(isKnownComplexContentEditableDomain("example.com")).toBe(false);
  });

  it("detects framework-managed editors via selector", () => {
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    host.className = "ProseMirror";
    document.body.appendChild(host);
    expect(shouldUseCopyFallback(host)).toBe(true);
  });

  it("replaces text once for simple text-only contenteditable", () => {
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    host.textContent = "hello world";
    document.body.appendChild(host);
    host.focus();

    document.execCommand = ((command: string, _showUI?: boolean, value?: string) => {
      if (command !== "insertText") return false;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(value ?? "");
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }) as typeof document.execCommand;

    const textNode = host.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);
    const result = attemptContentEditableReplacement(host, range, "translator");

    expect(result.success).toBe(true);
    expect(host.textContent).toBe("hello translator");
  });

  it("falls back when host is not text-only", () => {
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    const span = document.createElement("span");
    span.textContent = "hello";
    host.appendChild(span);
    document.body.appendChild(host);
    host.focus();

    const textNode = span.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const result = attemptContentEditableReplacement(host, range, "hi");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("simple");
  });
});
