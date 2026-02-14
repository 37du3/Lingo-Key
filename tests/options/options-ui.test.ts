/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  },
}));

import { activateTab, getShortcutLabel } from "../../src/options/options";

describe("options helpers", () => {
  it("returns fallback label for empty shortcut", () => {
    expect(getShortcutLabel("")).toBe("Not set");
    expect(getShortcutLabel(undefined)).toBe("Not set");
  });

  it("activates selected tab and hides other panels", () => {
    document.body.innerHTML = `
      <button class="tab" data-tab="api" aria-selected="false"></button>
      <button class="tab" data-tab="translation" aria-selected="false"></button>
      <button class="tab" data-tab="shortcut" aria-selected="false"></button>
      <section class="tab-panel" data-panel="api"></section>
      <section class="tab-panel" data-panel="translation"></section>
      <section class="tab-panel" data-panel="shortcut"></section>
    `;

    activateTab("translation");

    const apiPanel = document.querySelector<HTMLElement>('.tab-panel[data-panel="api"]');
    const transPanel = document.querySelector<HTMLElement>('.tab-panel[data-panel="translation"]');
    const shortcutPanel = document.querySelector<HTMLElement>('.tab-panel[data-panel="shortcut"]');
    const transTab = document.querySelector<HTMLElement>('.tab[data-tab="translation"]');

    expect(apiPanel?.hidden).toBe(true);
    expect(transPanel?.hidden).toBe(false);
    expect(shortcutPanel?.hidden).toBe(true);
    expect(transTab?.classList.contains("is-active")).toBe(true);
    expect(transTab?.getAttribute("aria-selected")).toBe("true");
  });
});
