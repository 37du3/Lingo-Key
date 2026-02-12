# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tran is a Chrome MV3 extension that translates text in web input fields (`input`, `textarea`, `contenteditable`) using OpenAI-compatible LLM APIs with streaming output. Triggered by keyboard shortcut (default: `Alt+T` on Windows/Linux, `Ctrl+Shift+T` on macOS).

## Build & Dev Commands

```bash
npm install              # install dependencies
npx vite build           # production build → dist/
npx vite dev             # dev mode with HMR
npx vitest run           # run all tests once
npx vitest run tests/shared/storage.test.ts  # run single test file
```

Load the extension: Chrome → `chrome://extensions/` → Developer Mode → Load unpacked → select `dist/`.

## Architecture

Three modules communicate via Chrome messaging APIs:

- **Content Script** (`src/content/`) — Injected into all pages. Listens for translate command via `browser.runtime.onMessage`. Detects active input element, extracts text, manages streaming replacement with throttle (80ms), handles interrupt/rollback. Uses `document.execCommand('insertText')` for undo-stack compatibility.
- **Service Worker** (`src/background/`) — Receives text via `chrome.runtime.connect` port. Calls `POST {base_url}/chat/completions` with SSE streaming. Parses `choices[0].delta.content` chunks and pushes back through port. Routes `chrome.commands` to active tab's content script.
- **Options Page** (`src/options/`) — Config UI. Reads/writes `chrome.storage.local`. No framework, plain HTML/CSS/TS.

Shared code in `src/shared/`: types (`types.ts`), defaults (`constants.ts`), storage wrapper (`storage.ts`).

## Key Design Decisions

- API calls happen in Service Worker (not Content Script) to avoid page CSP restrictions.
- `execCommand('insertText')` is used despite deprecation — only way to preserve browser undo stack. Isolated in `replacer.ts`.
- Streaming DOM updates are throttled to prevent UI freezing in React/Vue controlled components.
- Chinese IME composition events (`compositionstart`/`compositionend`) must be handled to avoid false interrupt triggers.
- Password fields (`input[type=password]`) are excluded from translation.
- On `contenteditable` DOM replacement failure, falls back to a copy-to-clipboard panel.

## Design Documents

Located in `docs/plans/`:
- `2026-02-12-tran-chrome-extension-design.md` — Full design spec (source of truth)
- `2026-02-12-tran-implementation-plan.md` — Task-by-task implementation plan
