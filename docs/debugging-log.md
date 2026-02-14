# Debugging Log

This document records bugs encountered during development and testing, along with their root causes and solutions.

## Bug #1: "Could not establish connection. Receiving end does not exist"

**Date**: 2026-02-14

**Symptom**:
- Error appears in extension details page
- Occurs when using keyboard shortcut on certain pages

**Root Cause**:
Service worker attempts to send messages to content scripts on pages where content scripts cannot run:
- `chrome://` pages (e.g., `chrome://extensions/`)
- Chrome Web Store pages
- `about:` pages
- PDF viewer pages

**Solution**:
Added try-catch error handling in `src/background/service-worker.ts`:

```typescript
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "trigger-translate") return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
    } catch (err) {
      // Content script not loaded or page doesn't support content scripts
      console.warn("Failed to send message to content script:", err);
    }
  }
});
```

**Commit**: `fix: handle message sending errors for unsupported pages`

---

## Bug #2: Slate Editor Crash - "Cannot resolve a Slate node from DOM node"

**Date**: 2026-02-14

**Symptom**:
- Console error: `Uncaught Error: Cannot resolve a Slate node from DOM node: [object HTMLSpanElement]`
- Occurs when testing on pages with Slate rich text editors (e.g., DeepSeek chat)

**Root Cause**:
Slate (and similar frameworks like Draft.js, ProseMirror, Quill) maintain internal state synchronized with DOM. Direct DOM manipulation via `document.execCommand('insertText')` breaks this synchronization, causing the framework to throw errors.

**Solution**:
Added rich text editor detection in `src/content/replacer.ts`:

```typescript
export function replaceContentEditableText(
  range: Range,
  newText: string
): void {
  // Check if this is a Slate editor or similar framework
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE
    ? container as Element
    : container.parentElement;

  if (element) {
    // Check for Slate, Draft.js, ProseMirror, Quill, etc.
    const editorRoot = element.closest('[data-slate-editor], [data-slate-node], .DraftEditor-root, .ProseMirror, .ql-editor');
    if (editorRoot) {
      throw new Error("Rich text editor detected - use copy fallback");
    }
  }

  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertText", false, newText);
}
```

When a rich text editor is detected, the error is caught in `src/content/index.ts` and triggers the copy-to-clipboard fallback panel.

**Commit**: `fix: detect rich text editors and use copy fallback`

---

## Bug #3: Translation Immediately Aborts - Overlay Flashes and Disappears

**Date**: 2026-02-14

**Symptom**:
- "✨ Translating..." overlay appears briefly then disappears
- Translation never completes
- API successfully returns translation chunks
- Console shows: `[Tran] Applying replacement` followed by immediate abort

**Root Cause**:
The interrupt detection mechanism was too aggressive:

1. `replaceInputText()` uses `document.execCommand('insertText')` to replace text
2. `execCommand('insertText')` triggers an `input` event (by design, for undo stack)
3. The interrupt listener catches this `input` event
4. Listener mistakes our own replacement for user input
5. Calls `abortAndRollback()`, terminating the translation

This created a false positive: our own text replacement was detected as user interruption.

**Solution**:
Added `isApplyingReplacement` flag to distinguish between our replacements and actual user input:

In `src/content/index.ts`:

```typescript
let isApplyingReplacement = false; // Flag to prevent interrupt during replacement

function applyReplacement(
  el: HTMLElement, range: any, newText: string, isEditable: boolean
): void {
  isApplyingReplacement = true;
  try {
    if (isEditable) {
      replaceContentEditableText(range as Range, newText);
    } else {
      const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
      replaceInputText(inputEl, range as TextRange, newText);
      range.end = range.start + newText.length;
    }
  } finally {
    // Use setTimeout to ensure the flag is cleared after the input event fires
    setTimeout(() => {
      isApplyingReplacement = false;
    }, 0);
  }
}

function setupInputInterruptListener(el: HTMLElement): void {
  const handler = () => {
    if (isComposing || isApplyingReplacement) {
      return; // Ignore composition events and our own replacements
    }
    abortAndRollback();
  };
  el.addEventListener("input", handler);
  inputListener = () => el.removeEventListener("input", handler);
}
```

The `setTimeout(..., 0)` ensures the flag is cleared after the current event loop, allowing the `input` event to fire and be properly ignored.

**Commit**: `fix: prevent false positive interrupts during text replacement`

---

## Bug #4: Content Script Not Injected on Some Pages

**Date**: 2026-02-14

**Symptom**:
- Keyboard shortcut has no effect on certain pages (e.g., Perplexity)
- Service Worker logs: `Active tab: <id> undefined` (tab URL is undefined)
- Error: `Could not establish connection. Receiving end does not exist.`
- Page console has no `[Tran]` logs at all

**Root Cause**:
Two issues combined:
1. Missing `host_permissions` in manifest — Chrome MV3 requires explicit host permissions for content script injection on some sites
2. Pages opened before extension reload don't have content scripts injected — Chrome only injects content scripts on new page loads

**Solution**:
1. Added `"host_permissions": ["<all_urls>"]` and `"scripting"` permission to `manifest.json`
2. Added dynamic content script injection fallback in `src/background/service-worker.ts`:

```typescript
try {
  await browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
} catch (err) {
  // Content script not loaded, try to inject it
  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/index.js"]
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    await browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
  } catch (injectErr) {
    console.error("Failed to inject content script:", injectErr);
  }
}
```

---

## Bug #5: bfcache Port Disconnection Error

**Date**: 2026-02-14

**Symptom**:
- Extension details page shows: `Unchecked runtime.lastError: The page keeping the extension port is moved into back/forward cache, so the message channel is closed.`

**Root Cause**:
When a user navigates away from a page and the browser puts it into the back/forward cache (bfcache), any open port connections are closed. If the service worker tries to `port.postMessage()` after this, it throws an unchecked error.

**Solution**:
Wrapped all `port.postMessage()` calls in the service worker with try-catch:

```typescript
try {
  port.postMessage(chunk);
} catch (err) {
  // Port disconnected (page in bfcache or closed)
  abortController?.abort();
  return;
}
```

---

## Bug #6: ContentEditable Streaming Replacement Produces Duplicated Text

**Date**: 2026-02-14

**Symptom**:
- On contenteditable elements (Kimi, Perplexity, etc.), translation produces duplicated/concatenated text
- Example: Input "这是一个测试文本" → Output "This is a test text.This is a test textThis"
- Each streaming chunk appends instead of replacing

**Root Cause**:
`document.execCommand('insertText')` behaves differently in contenteditable vs input/textarea:

1. For `input`/`textarea`: `setSelectionRange()` reliably selects the range, then `insertText` replaces it
2. For `contenteditable`: After the first `insertText`, the DOM structure changes. The original `Range` object becomes stale — its node references and offsets no longer point to the correct location. Subsequent `sel.addRange(range)` + `insertText` calls insert at wrong positions or append instead of replacing.

Multiple approaches were attempted:
- `range.deleteContents()` + `range.insertNode(textNode)` → Text disappeared entirely (DOM nodes removed but new nodes not visible in framework-managed editors)
- `execCommand('delete')` + `execCommand('insertText')` → Still produced duplicates
- Updating range after each insertion → Range references became invalid after DOM mutation

**Core issue**: Modern web apps (Kimi, Perplexity, ChatGPT, etc.) use complex contenteditable implementations with virtual DOM layers (React, Vue) or rich text frameworks (Slate, ProseMirror, Tiptap). These frameworks intercept and re-render DOM changes, making direct DOM manipulation unreliable.

**Current Workaround**:
For all contenteditable elements, skip in-place text replacement and show a copy-to-clipboard fallback panel instead:

```typescript
// In message handler:
if (msg.type === "chunk") {
  pendingContent = msg.content;
  // For contenteditable, skip streaming — apply only on complete
  if (!isEditable) {
    // ... normal input/textarea streaming replacement
  }
} else if (msg.type === "complete") {
  if (isEditable) {
    showCopyFallback(pendingContent); // Show copy panel
  } else {
    applyInputReplacement(el, range, pendingContent);
  }
}
```

**Limitations**:
- User must manually copy and paste the translation
- No streaming visual feedback for contenteditable
- Affects all AI chat interfaces (Kimi, Perplexity, ChatGPT, Claude, Gemini, etc.)

**Potential Future Solutions**:
1. Use `Clipboard API` to write translation directly to clipboard, then programmatically trigger paste (`Ctrl+V`) — may work with framework-managed editors since paste is a native event they handle
2. Use `InputEvent` with `inputType: 'insertText'` and `data` property — some frameworks listen for this instead of `execCommand`
3. Detect specific editor frameworks and use their APIs (e.g., Slate's `Transforms.insertText()`)
4. Use browser automation approach: simulate keyboard events to select all text and type the replacement

---

## Debugging Techniques Used

### 1. Console Logging
Added comprehensive logging with `[Tran]` and `[Service Worker]` prefixes to trace execution flow:
- Content script: tracks element detection, text extraction, port communication
- Service worker: tracks API requests, streaming chunks, error handling

### 2. Dual Console Monitoring
- **Page console** (F12): Content script logs
- **Service Worker console** (`chrome://extensions/` → "Service Worker" link): Background logs

This revealed that the API was working correctly but content script was aborting prematurely.

### 3. Event Flow Analysis
Traced the sequence:
1. `applyReplacement()` called
2. `execCommand('insertText')` executed
3. `input` event fired
4. Interrupt handler triggered
5. `abortAndRollback()` called

This identified the false positive in interrupt detection.

---

## Testing Recommendations

### Supported Pages
- Regular websites (Google, GitHub, etc.)
- Standard HTML input fields and textareas
- Simple contenteditable elements

### Unsupported Pages (Expected Behavior: No Response)
- `chrome://` internal pages
- Chrome Web Store
- PDF viewer
- New Tab page

### Rich Text Editors (Expected Behavior: Copy Fallback)
- Slate-based editors (DeepSeek, Notion-like apps)
- Draft.js editors
- ProseMirror editors
- Quill editors

### Test Procedure
1. Navigate to test page
2. Click into input field
3. Type test text (e.g., "hello world")
4. Press keyboard shortcut (`Alt+T` or `Ctrl+Shift+T` on Mac)
5. Verify "✨ Translating..." overlay appears and persists
6. Verify text is replaced with translation
7. Check console for errors
