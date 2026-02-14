import { describe, it, expect } from "vitest";
import { sanitizeForLog } from "../../src/shared/logger";

describe("sanitizeForLog", () => {
  it("redacts sensitive keys", () => {
    const sanitized = sanitizeForLog({
      apiKey: "sk-secret-123456",
      text: "这是原文",
      nested: {
        content: "translated content",
      },
      model: "gpt-4o",
    }) as Record<string, unknown>;

    expect(sanitized.apiKey).toContain("[redacted");
    expect(sanitized.text).toContain("[redacted");
    expect((sanitized.nested as Record<string, unknown>).content).toContain("[redacted");
    expect(sanitized.model).toBe("gpt-4o");
  });
});
