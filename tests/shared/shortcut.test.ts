/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  getDefaultTriggerShortcut,
  shortcutFromKeyboardEvent,
  keyboardEventMatchesShortcut,
  getConfiguredShortcut,
} from "../../src/shared/shortcut";

describe("shortcut helpers", () => {
  it("returns platform defaults", () => {
    expect(getDefaultTriggerShortcut("MacIntel")).toBe("Ctrl+Shift+T");
    expect(getDefaultTriggerShortcut("Win32")).toBe("Alt+T");
  });

  it("formats shortcut from keyboard event", () => {
    const shortcut = shortcutFromKeyboardEvent({
      key: "t",
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: true,
    });
    expect(shortcut).toBe("Ctrl+Shift+T");
  });

  it("matches keyboard events against configured shortcut", () => {
    const event = new KeyboardEvent("keydown", { key: "T", ctrlKey: true, shiftKey: true });
    expect(keyboardEventMatchesShortcut(event, "Ctrl+Shift+T")).toBe(true);
    expect(keyboardEventMatchesShortcut(event, "Alt+T")).toBe(false);
  });

  it("falls back to platform default when config is empty", () => {
    const config = {
      apiBaseUrl: "",
      apiKey: "",
      model: "",
      shortcut: "",
      targetLanguage: "English",
      promptStyle: "concise" as const,
      customPrompt: "",
      maxChars: 500,
    };
    expect(getConfiguredShortcut(config, "MacIntel")).toBe("Ctrl+Shift+T");
  });
});
