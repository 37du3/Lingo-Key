import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeBaseUrl } from "../../src/shared/storage";
import { DEFAULT_CONFIG, PROMPT_TEMPLATES } from "../../src/shared/constants";

// Mock webextension-polyfill
const mockStorage: Record<string, unknown> = {};
vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          return key in mockStorage ? { [key]: mockStorage[key] } : {};
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
        }),
      },
    },
  },
}));

describe("normalizeBaseUrl", () => {
  it("removes trailing slash", () => {
    expect(normalizeBaseUrl("https://api.openai.com/")).toBe("https://api.openai.com");
  });

  it("removes trailing /v1", () => {
    expect(normalizeBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com");
  });

  it("removes trailing /v1/", () => {
    expect(normalizeBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com");
  });

  it("trims whitespace", () => {
    expect(normalizeBaseUrl("  https://api.openai.com  ")).toBe("https://api.openai.com");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeBaseUrl("")).toBe("");
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("returns default config when storage is empty", async () => {
    const { loadConfig } = await import("../../src/shared/storage");
    const config = await loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("merges stored config with defaults", async () => {
    mockStorage["tran_config"] = { apiKey: "sk-test", model: "gpt-4" };
    const { loadConfig } = await import("../../src/shared/storage");
    const config = await loadConfig();
    expect(config.apiKey).toBe("sk-test");
    expect(config.model).toBe("gpt-4");
    expect(config.maxChars).toBe(500);
  });
});

describe("saveConfig", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("saves partial config merged with current", async () => {
    const { saveConfig, loadConfig } = await import("../../src/shared/storage");
    await saveConfig({ apiKey: "sk-new", model: "gpt-4o" });
    const config = await loadConfig();
    expect(config.apiKey).toBe("sk-new");
    expect(config.model).toBe("gpt-4o");
    expect(config.targetLanguage).toBe("English");
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has expected defaults", () => {
    expect(DEFAULT_CONFIG.targetLanguage).toBe("English");
    expect(DEFAULT_CONFIG.promptStyle).toBe("concise");
    expect(DEFAULT_CONFIG.maxChars).toBe(500);
    expect(DEFAULT_CONFIG.apiBaseUrl).toBe("");
  });
});

describe("PROMPT_TEMPLATES", () => {
  it("has all three styles", () => {
    expect(PROMPT_TEMPLATES.formal).toContain("{{target_language}}");
    expect(PROMPT_TEMPLATES.concise).toContain("{{target_language}}");
    expect(PROMPT_TEMPLATES.casual).toContain("{{target_language}}");
  });
});
