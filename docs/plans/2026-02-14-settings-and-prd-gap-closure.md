# Settings And PRD Gap Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Put all user-facing settings into one tabbed Options page and close remaining PRD checklist gaps found in review.

**Architecture:** Keep MV3 split (Options UI + Content Script + Service Worker), but add a small settings-view layer for tab state and command display. Close runtime gaps with targeted fixes: URL normalization contract, log redaction, overlay follow behavior, and contenteditable interrupt handling policy.

**Tech Stack:** TypeScript, Vite, webextension-polyfill, Vitest (jsdom)

**Execution Rules:** Follow @superpowers:test-driven-development per task. Keep commits small and isolated.

---

### Task 1: Freeze PRD Checklist As Executable Acceptance List

**Files:**
- Create: `/Users/yangming/code/tran/docs/prd-checklist.md`
- Modify: `/Users/yangming/code/tran/docs/plans/2026-02-12-tran-chrome-extension-design.md`

**Step 1: Write checklist document skeleton**

```md
# PRD Checklist

## P0 Must-Have
- [ ] Tabbed settings page includes API / Translation / Shortcut
- [ ] Missing API key toast can open options
- [ ] ...
```

**Step 2: Add explicit status mapping from PRD to code paths**

```md
| Requirement | File | Status | Notes |
|---|---|---|---|
| Log redaction | src/background/service-worker.ts | TODO | remove apiKey/raw text logs |
```

**Step 3: Link checklist from design doc**

Add one line near acceptance section:

```md
实施验收以 `docs/prd-checklist.md` 为单一核对源。
```

**Step 4: Commit**

```bash
git add docs/prd-checklist.md docs/plans/2026-02-12-tran-chrome-extension-design.md
git commit -m "docs: add executable PRD checklist and linkage"
```

---

### Task 2: Refactor Options Page To Tabbed Single-Page Settings

**Files:**
- Modify: `/Users/yangming/code/tran/src/options/options.html`
- Modify: `/Users/yangming/code/tran/src/options/options.css`
- Modify: `/Users/yangming/code/tran/src/options/options.ts`
- Test: `/Users/yangming/code/tran/tests/options/options-tabs.test.ts`

**Step 1: Write failing tab behavior tests**

```ts
it("shows API tab by default and hides others", async () => {
  // mount options DOM
  // assert [data-tab="api"] active and translation/shortcut panels hidden
});
```

**Step 2: Run test to verify failure**

Run: `npx vitest run tests/options/options-tabs.test.ts`  
Expected: FAIL (tab controls/panels not found)

**Step 3: Implement tab navigation markup and state**

```html
<nav class="tabs">
  <button data-tab="api">API</button>
  <button data-tab="translation">Translation</button>
  <button data-tab="shortcut">Shortcut</button>
</nav>
```

```ts
function activateTab(name: string) { /* toggle aria-selected + panel hidden */ }
```

**Step 4: Run tests**

Run: `npx vitest run tests/options/options-tabs.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/options/options.html src/options/options.css src/options/options.ts tests/options/options-tabs.test.ts
git commit -m "feat: convert options page to tabbed single-page settings"
```

---

### Task 3: Complete Translation/Prompt/Shortcut Settings UX

**Files:**
- Modify: `/Users/yangming/code/tran/src/options/options.html`
- Modify: `/Users/yangming/code/tran/src/options/options.ts`
- Modify: `/Users/yangming/code/tran/src/shared/constants.ts`
- Test: `/Users/yangming/code/tran/tests/options/options-settings.test.ts`

**Step 1: Write failing tests for settings presence and persistence**

```ts
it("renders target language, prompt style, custom prompt and max chars controls", () => {});
it("persists prompt style change and template replacement", async () => {});
it("shows current command shortcut via browser.commands.getAll", async () => {});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/options/options-settings.test.ts`  
Expected: FAIL (missing command lookup and/or fields)

**Step 3: Implement complete settings wiring**

```ts
const commands = await browser.commands.getAll();
const trigger = commands.find(c => c.name === "trigger-translate");
shortcutText.textContent = trigger?.shortcut || "Not set";
```

Also ensure:
- Prompt preset updates `customPrompt`
- `customPrompt` manual edits keep `promptStyle` selectable without data loss
- Shortcut tab includes link to `chrome://extensions/shortcuts`

**Step 4: Run tests**

Run: `npx vitest run tests/options/options-settings.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/options/options.html src/options/options.ts src/shared/constants.ts tests/options/options-settings.test.ts
git commit -m "feat: complete prompt and shortcut settings in options page"
```

---

### Task 4: Fix Base URL Contract And API Compatibility

**Files:**
- Modify: `/Users/yangming/code/tran/src/shared/storage.ts`
- Modify: `/Users/yangming/code/tran/src/background/api-client.ts`
- Test: `/Users/yangming/code/tran/tests/shared/storage.test.ts`
- Test: `/Users/yangming/code/tran/tests/background/api-client.test.ts`

**Step 1: Write failing tests for `/v1` normalization contract**

```ts
it("normalizes base URL to include /v1 once", () => {
  expect(normalizeBaseUrl("https://api.openai.com")).toBe("https://api.openai.com/v1");
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/shared/storage.test.ts tests/background/api-client.test.ts`  
Expected: FAIL on normalization assertions

**Step 3: Implement normalization and safe join**

```ts
// normalize: trim, remove trailing slash, append /v1 if absent
```

```ts
const url = `${config.apiBaseUrl.replace(/\/+$/, "")}/chat/completions`;
```

**Step 4: Run tests**

Run: `npx vitest run tests/shared/storage.test.ts tests/background/api-client.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/storage.ts src/background/api-client.ts tests/shared/storage.test.ts tests/background/api-client.test.ts
git commit -m "fix: enforce /v1 base URL contract for chat completions"
```

---

### Task 5: Close Runtime Gaps (Log Redaction + Overlay Follow + Contenteditable Interrupt Policy)

**Files:**
- Modify: `/Users/yangming/code/tran/src/background/service-worker.ts`
- Modify: `/Users/yangming/code/tran/src/content/index.ts`
- Modify: `/Users/yangming/code/tran/src/content/overlay.ts`
- Create: `/Users/yangming/code/tran/src/shared/logger.ts`
- Test: `/Users/yangming/code/tran/tests/content/overlay.test.ts`
- Test: `/Users/yangming/code/tran/tests/shared/logger.test.ts`

**Step 1: Write failing tests**

```ts
it("repositions overlay on scroll/resize", () => {});
it("logger redacts apiKey and long text fields", () => {});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/content/overlay.test.ts tests/shared/logger.test.ts`  
Expected: FAIL

**Step 3: Implement minimal runtime fixes**

- Replace raw `console.log` payloads with redacted logger:

```ts
safeLog("translate_request", { textLength: msg.text.length, hasApiKey: !!config.apiKey });
```

- Overlay follow:

```ts
window.addEventListener("scroll", onMove, true);
window.addEventListener("resize", onMove);
```

- Contenteditable interrupt policy:
  - keep current no-stream replacement
  - add optional input listener for editable target during translating
  - on user input: abort translation and close overlay/panel; do not force DOM rollback in complex editors

**Step 4: Run tests**

Run: `npx vitest run tests/content/overlay.test.ts tests/shared/logger.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/background/service-worker.ts src/content/index.ts src/content/overlay.ts src/shared/logger.ts tests/content/overlay.test.ts tests/shared/logger.test.ts
git commit -m "fix: redact logs and improve overlay/runtime interrupt behavior"
```

---

### Task 6: Final Verification And Documentation

**Files:**
- Modify: `/Users/yangming/code/tran/docs/debugging-log.md`
- Modify: `/Users/yangming/code/tran/docs/prd-checklist.md`

**Step 1: Run full test suite**

Run: `npx vitest run`  
Expected: PASS all tests

**Step 2: Build extension**

Run: `npx vite build`  
Expected: build success with updated `dist/src/content/index.js` and `dist/src/options/options.js`

**Step 3: Manual matrix smoke (record in checklist)**

- Kimi / Perplexity: fallback panel + auto-copy guidance works
- Qwen / DeepSeek / Gemini: normal replacement works
- API key missing: clickable toast opens options
- Shortcut display: options shows actual `trigger-translate` key

**Step 4: Update checklist statuses**

Mark each item in `docs/prd-checklist.md` as DONE/PARTIAL/TODO with evidence links.

**Step 5: Commit**

```bash
git add docs/debugging-log.md docs/prd-checklist.md
git commit -m "docs: finalize PRD checklist and verification evidence"
```

