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
