/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { getTextRange } from "../../src/content/replacer";

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
