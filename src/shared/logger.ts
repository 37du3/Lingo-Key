type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const SENSITIVE_KEY_PATTERN = /(api.?key|authorization|token|secret|text|content|prompt)/i;

function sanitizeString(value: string): string {
  return value.length <= 6 ? "[redacted]" : `[redacted:${value.length}]`;
}

export function sanitizeForLog(value: unknown, key = ""): JsonValue {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return SENSITIVE_KEY_PATTERN.test(key) ? sanitizeString(value) : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, key));
  }

  if (typeof value === "object") {
    const record: { [key: string]: JsonValue } = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        record[k] = typeof v === "string" ? sanitizeString(v) : "[redacted]";
      } else {
        record[k] = sanitizeForLog(v, k);
      }
    });
    return record;
  }

  return String(value);
}

export function logDebug(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(message);
    return;
  }
  console.log(message, sanitizeForLog(payload));
}
