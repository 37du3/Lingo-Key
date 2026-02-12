import { describe, it, expect } from "vitest";
import { parseSSEChunk, buildRequestBody } from "../../src/background/api-client";
import { DEFAULT_CONFIG, PROMPT_TEMPLATES } from "../../src/shared/constants";

describe("parseSSEChunk", () => {
  it("extracts content from a valid SSE data line", () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
    expect(parseSSEChunk(line)).toBe("Hello");
  });

  it("returns null for [DONE] signal", () => {
    expect(parseSSEChunk("data: [DONE]")).toBeNull();
  });

  it("returns null for empty lines", () => {
    expect(parseSSEChunk("")).toBeNull();
  });

  it("returns null for lines without delta content", () => {
    const line = 'data: {"choices":[{"delta":{}}]}';
    expect(parseSSEChunk(line)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSSEChunk("data: {invalid}")).toBeNull();
  });
});

describe("buildRequestBody", () => {
  it("builds correct request body with template substitution", () => {
    const config = { ...DEFAULT_CONFIG, model: "gpt-4o", targetLanguage: "Japanese" };
    const body = buildRequestBody("Hello", config) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o");
    expect(body.stream).toBe(true);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain("Japanese");
    expect(messages[1].content).toBe("Hello");
  });
});
