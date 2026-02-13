# Tran Chrome Extension - Progress Tracker

**Last Updated:** 2026-02-13 09:45
**Current Status:** Core Implementation Complete (Tasks 1-8) | Ready for Manual Testing (Tasks 9-10)

---

## Project Overview

**Tran** is a Chrome MV3 extension that translates text in web input fields using OpenAI-compatible LLM APIs with streaming output. Triggered by keyboard shortcut (Alt+T on Windows/Linux, Ctrl+Shift+T on macOS).

**Key Documents:**
- Design Spec: `docs/plans/2026-02-12-tran-chrome-extension-design.md`
- Implementation Plan: `docs/plans/2026-02-12-tran-implementation-plan.md`
- Project Guidance: `CLAUDE.md`

---

## Completed Tasks ✅

### Task 1: Project Scaffolding
**Status:** ✅ Complete
**Commit:** `5a5a12f` - "chore: project scaffolding with vite-plugin-web-extension"

**What was done:**
- Initialized npm project
- Installed dependencies: typescript, vite, vite-plugin-web-extension, webextension-polyfill, vitest, jsdom
- Created `tsconfig.json`, `manifest.json`, `vite.config.ts`
- Created placeholder source files
- Verified build works (`npx vite build` succeeds)
- Git initialized with `.gitignore`

**Files created:**
- `package.json`, `tsconfig.json`, `manifest.json`, `vite.config.ts`, `.gitignore`
- `src/background/service-worker.ts` (placeholder)
- `src/content/index.ts` (placeholder)
- `src/options/options.html`, `options.ts`, `options.css` (placeholders)

---

### Task 2: Shared Types, Constants, and Storage
**Status:** ✅ Complete
**Commit:** `211ed8c` - "feat: shared types, constants, and storage layer"
**Tests:** 10/10 passing

**What was done:**
- Created `src/shared/types.ts` with all TypeScript interfaces:
  - `TranConfig` (API config, translation settings)
  - `PromptStyle` type
  - Port message types: `TranslateRequest`, `TranslateChunk`, `TranslateComplete`, `TranslateError`, `PortMessage`
- Created `src/shared/constants.ts` with:
  - `PROMPT_TEMPLATES` (formal/concise/casual)
  - `DEFAULT_CONFIG` (English target, concise style, 500 max chars)
  - `TARGET_LANGUAGES` array
  - `THROTTLE_MS = 80`, `TOAST_DURATION_MS = 3000`, `PORT_NAME = "tran-translate"`
- Created `src/shared/storage.ts` with:
  - `loadConfig()` - loads from `chrome.storage.local`, merges with defaults
  - `saveConfig()` - saves partial config, merges with current
  - `normalizeBaseUrl()` - removes trailing slashes and `/v1`
- Created `tests/shared/storage.test.ts` with 10 tests (all passing)

**Key decisions:**
- Uses `chrome.storage.local` (not sync) for privacy
- Storage key: `"tran_config"`
- `saveConfig()` accepts partial config and merges

---

### Task 3: Service Worker — Streaming API Client
**Status:** ✅ Complete
**Commit:** `ef27d3a` - "feat: service worker with streaming API client and command routing"
**Tests:** 6/6 passing

**What was done:**
- Created `src/background/api-client.ts` with:
  - `parseSSEChunk()` - extracts content from SSE data lines
  - `buildRequestBody()` - builds OpenAI-compatible request with template substitution
  - `streamTranslation()` - async generator that yields accumulated translation chunks
- Created `tests/background/api-client.test.ts` with 6 tests (all passing)
- Rewrote `src/background/service-worker.ts` with:
  - `onInstalled` listener - opens options page on first install (FTUE)
  - `onCommand` listener - forwards `trigger-translate` command to active tab
  - `onMessage` listener - handles `open-options` message (Task 7)
  - `onConnect` listener - handles streaming translation via port connections
  - Error handling: no_api_key, invalid_api_key, network errors
  - AbortController for cancellation

**Key implementation details:**
- SSE parsing handles `[DONE]` signal and malformed JSON
- Accumulates translation chunks (not deltas)
- HTTP 401 → "API Key 无效", 429 → "请求过于频繁"
- Port disconnection aborts fetch request

---

### Task 4: Content Script — Text Replacer
**Status:** ✅ Complete
**Commit:** `1274227` - "feat: text extraction and replacement logic"
**Tests:** 3/3 passing (jsdom environment)

**What was done:**
- Created `src/content/replacer.ts` with:
  - `TextRange` interface (start, end, text)
  - `getTextRange()` - extracts text from input/textarea (selection or cursor-back N chars)
  - `replaceInputText()` - uses `execCommand('insertText')` for undo support
  - `getContentEditableText()` - extracts text from contenteditable elements
  - `replaceContentEditableText()` - replaces text in contenteditable
- Created `tests/content/replacer.test.ts` with 3 tests (all passing)
- Installed `jsdom` for DOM testing

**Key implementation details:**
- If text selected → translate selection only
- If no selection → get last N chars before cursor (N = maxChars config)
- Uses deprecated `execCommand('insertText')` - only way to preserve browser undo stack
- contenteditable handling uses Range API

---

### Task 7: Service Worker — open-options handler
**Status:** ✅ Complete (merged into Task 3)
**Commit:** `ef27d3a` (same as Task 3)

**What was done:**
- Added `browser.runtime.onMessage` listener in service-worker.ts
- Handles `{ type: "open-options" }` message from content script
- Calls `browser.runtime.openOptionsPage()`

### Task 5: Content Script — Overlay & Toast
**Status:** ✅ Complete
**Commit:** `8b2dd26` - "feat: overlay and toast UI components"

**What was done:**
- Created `src/content/overlay.ts` with:
  - `showOverlay()` - displays floating "✨ Translating..." indicator
  - `removeOverlay()` - removes overlay
  - `positionOverlay()` - anchors overlay to input element with viewport collision detection
- Created `src/content/toast.ts` with:
  - `showToast()` - displays error toast with optional click handler
  - Auto-dismiss after 3 seconds
  - Clickable for "no API key" errors to navigate to options page

**Key implementation details:**
- Overlay: fixed position, z-index 2147483647, dark theme (#1a1a2e)
- Toast: bottom-right corner, red background (#dc3545), smooth fade-out transition
- Viewport collision detection prevents overlay from going off-screen

---

### Task 6: Content Script — Main Orchestration
**Status:** ✅ Complete
**Commit:** `df185aa` - "feat: content script orchestration with interrupt and rollback"

**What was done:**
- Rewrote `src/content/index.ts` with full orchestration:
  - Listens for `trigger-translate` message from service worker
  - Detects active input element (input/textarea/contenteditable, excludes password fields)
  - Loads config and checks API key (shows clickable toast if missing)
  - Extracts text using `getTextRange()` or `getContentEditableText()`
  - Creates snapshot for rollback
  - Shows overlay during translation
  - Connects port to service worker
  - Handles streaming chunks with 80ms throttle
  - Applies replacement using `replaceInputText()` or `replaceContentEditableText()`
  - Handles errors with toast notifications and rollback
  - Handles interrupts (shortcut pressed again, user input during translation)
  - Tracks composition events (Chinese IME) to avoid false interrupts
  - Fallback: shows copy-to-clipboard panel if contenteditable replacement fails

**Key implementation details:**
- Global state: `isTranslating`, `activePort`, `snapshot`, `isComposing`
- Composition event tracking prevents false interrupts during IME input
- Throttled DOM updates (80ms) prevent UI freezing
- Rollback restores original text on error or interrupt
- Copy fallback panel for complex contenteditable elements

---

### Task 8: Options Page
**Status:** ✅ Complete
**Commit:** `b2b0f63` - "feat: options page with API config, translation settings, and quick start"

**What was done:**
- Rewrote `src/options/options.html` with full UI:
  - Quick Start card with links to OpenAI/DeepSeek and privacy note
  - API Configuration section (base URL, API key with show/hide toggle, model, test connection button)
  - Translation section (target language dropdown, prompt style dropdown, custom prompt textarea, max chars input)
  - Shortcut section with link to chrome://extensions/shortcuts
- Rewrote `src/options/options.ts` with:
  - Loads config on init and populates form fields
  - Auto-save on change (no save button needed)
  - Prompt style preset switching
  - API key visibility toggle
  - Test connection button (sends test request to API)
  - Hides quick start card if API key already configured
- Rewrote `src/options/options.css` with full styling:
  - Clean card-based layout
  - Responsive design
  - Color-coded feedback (green for success, red for errors)

**Key features:**
- Auto-save with visual feedback ("✓ Saved" → "Settings auto-saved")
- Test connection validates API key and shows status
- URL normalization on save (removes trailing slashes, adds /v1)
- Privacy note: "Your data is sent directly to the API you configure. No intermediate servers."

---

## Remaining Tasks 📋

### Task 9: E2E Manual Testing
**Status:** ⏳ Pending (ready to start)

**What needs to be done:**
- Build extension: `npx vite build`
- Load unpacked in Chrome from `dist/` folder
- Verify FTUE (options page opens on install)
- Configure API and test connection
- Test translation on textarea (GitHub issue comment)
- Test interrupt via shortcut (press Alt+T again during translation)
- Test interrupt via user input (type during translation)
- Test Ctrl+Z undo
- Test error handling (invalid API key)
- Test password field protection (nothing happens)

---

### Task 10: Compatibility Testing
**Status:** ⏳ Pending (blocked by Task 9)

**Sites to test:**
- GitHub (issue comment - textarea)
- GitHub (PR review - contenteditable)
- Stack Overflow (answer - textarea)
- Gmail (compose - contenteditable)
- Outlook Web (compose - contenteditable)
- Slack Web (message - contenteditable)

**For each site:**
- Trigger translation
- Verify streaming replacement
- Verify undo (Ctrl+Z)
- Verify interrupt
- If contenteditable fails → verify copy-fallback panel appears

---

### Task 9: E2E Manual Testing
**Status:** ⏳ Pending (blocked by Tasks 6, 8)

**What needs to be done:**
- Build extension: `npx vite build`
- Load unpacked in Chrome from `dist/` folder
- Verify FTUE (options page opens on install)
- Configure API and test connection
- Test translation on textarea (GitHub issue comment)
- Test interrupt via shortcut (press Alt+T again during translation)
- Test interrupt via user input (type during translation)
- Test Ctrl+Z undo
- Test error handling (invalid API key)
- Test password field protection (nothing happens)

---

### Task 10: Compatibility Testing
**Status:** ⏳ Pending (blocked by Task 9)

**Sites to test:**
- GitHub (issue comment - textarea)
- GitHub (PR review - contenteditable)
- Stack Overflow (answer - textarea)
- Gmail (compose - contenteditable)
- Outlook Web (compose - contenteditable)
- Slack Web (message - contenteditable)

**For each site:**
- Trigger translation
- Verify streaming replacement
- Verify undo (Ctrl+Z)
- Verify interrupt
- If contenteditable fails → verify copy-fallback panel appears

---

## Current File Structure

```
/Users/yangming/code/tran/
├── docs/
│   ├── plans/
│   │   ├── 2026-02-12-tran-chrome-extension-design.md
│   │   ├── 2026-02-12-tran-implementation-plan.md
│   │   └── progress_tracker.md (this file)
│   └── CLAUDE.md
├── src/
│   ├── background/
│   │   ├── api-client.ts ✅
│   │   └── service-worker.ts ✅
│   ├── content/
│   │   ├── index.ts ✅
│   │   ├── replacer.ts ✅
│   │   ├── overlay.ts ✅
│   │   └── toast.ts ✅
│   ├── options/
│   │   ├── options.html ✅
│   │   ├── options.ts ✅
│   │   └── options.css ✅
│   └── shared/
│       ├── types.ts ✅
│       ├── constants.ts ✅
│       └── storage.ts ✅
├── tests/
│   ├── background/
│   │   └── api-client.test.ts ✅ (6 tests)
│   ├── content/
│   │   └── replacer.test.ts ✅ (3 tests)
│   └── shared/
│       └── storage.test.ts ✅ (10 tests)
├── package.json
├── tsconfig.json
├── manifest.json
├── vite.config.ts
└── .gitignore
```

---

## Test Status

**Total Tests:** 19/19 passing ✅

- `tests/shared/storage.test.ts`: 10/10 ✅
- `tests/background/api-client.test.ts`: 6/6 ✅
- `tests/content/replacer.test.ts`: 3/3 ✅ (jsdom environment)

**Run all tests:**
```bash
npx vitest run
```

**Build verification:**
```bash
npx vite build  # All builds succeed ✅
```

---

## Git History

```
b2b0f63 feat: options page with API config, translation settings, and quick start (Task 8)
df185aa feat: content script orchestration with interrupt and rollback (Task 6)
8b2dd26 feat: overlay and toast UI components (Task 5)
1274227 feat: text extraction and replacement logic (Task 4)
ef27d3a feat: service worker with streaming API client and command routing (Tasks 3+7)
211ed8c feat: shared types, constants, and storage layer (Task 2)
5a5a12f chore: project scaffolding with vite-plugin-web-extension (Task 1)
```

---

## Next Steps for Manual Testing

**Immediate next task:** Task 9 - E2E Manual Testing

1. Build the extension: `npx vite build`
2. Load unpacked in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` folder
3. Options page should open automatically (first-time setup)
4. Configure API settings and test connection
5. Test translation on various websites and input elements
6. Verify interrupt handling and rollback
7. Test undo (Ctrl+Z / Cmd+Z)

**To resume development:**
```bash
cd /Users/yangming/code/tran
git log --oneline  # Check current state
npx vitest run     # Verify all tests still pass
npx vite build     # Verify build works
```

**Reference the implementation plan:**
- Full task details: `docs/plans/2026-02-12-tran-implementation-plan.md`
- Each task has step-by-step instructions with complete code

---

## Key Technical Decisions

1. **Storage:** `chrome.storage.local` only (not sync) for privacy
2. **Undo support:** Uses deprecated `execCommand('insertText')` - only way to preserve browser undo stack
3. **Streaming throttle:** 80ms to prevent UI freezing in React/Vue controlled components
4. **Shortcuts:** Platform-specific defaults (macOS: Ctrl+Shift+T, others: Alt+T)
5. **Composition events:** Track `compositionstart`/`compositionend` to avoid false interrupts during Chinese IME input
6. **contenteditable fallback:** Show copy-to-clipboard panel when DOM replacement fails
7. **Password fields:** Excluded from translation (security)
8. **API compatibility:** OpenAI-compatible `/chat/completions` with SSE streaming only

---

## Dependencies

```json
{
  "devDependencies": {
    "@types/webextension-polyfill": "^0.12.1",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.3",
    "vite": "^7.3.1",
    "vite-plugin-web-extension": "^4.2.1",
    "vitest": "^4.0.18",
    "webextension-polyfill": "^0.12.0"
  }
}
```

---

## Notes

- All code follows TDD approach where applicable (shared, background, content replacer)
- UI components (overlay, toast, options page) don't have unit tests (manual testing in Tasks 9-10)
- Build uses `vite-plugin-web-extension` (not `@crxjs/vite-plugin`) for better Vite 5+ support
- Extension manifest is MV3 compliant
- No external dependencies in production code (only webextension-polyfill)
