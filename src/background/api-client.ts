import type { TranConfig } from "../shared/types";

export function parseSSEChunk(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

export function buildRequestBody(text: string, config: TranConfig): object {
  const systemPrompt = config.customPrompt.replace(
    /\{\{target_language\}\}/g,
    config.targetLanguage
  );
  return {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    stream: true,
  };
}

export async function* streamTranslation(
  text: string,
  config: TranConfig,
  signal: AbortSignal
): AsyncGenerator<string> {
  const url = `${config.apiBaseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildRequestBody(text, config)),
    signal,
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error("API Key 无效，请检查设置");
    if (status === 429) throw new Error("请求过于频繁，请稍后再试");
    throw new Error(`API 请求失败 (${status})`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      const content = parseSSEChunk(line);
      if (content !== null) {
        accumulated += content;
        yield accumulated;
      }
    }
  }
}
