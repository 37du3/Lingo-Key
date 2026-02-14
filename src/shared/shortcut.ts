import type { TranConfig } from "./types";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

export function isMacPlatform(platform: string = navigator.platform): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function getDefaultTriggerShortcut(platform?: string): string {
  return isMacPlatform(platform) ? "Ctrl+Shift+T" : "Alt+T";
}

export function getConfiguredShortcut(config: TranConfig, platform?: string): string {
  return config.shortcut.trim() || getDefaultTriggerShortcut(platform);
}

function normalizeKey(key: string): string {
  if (!key) return "";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  if (key === "Esc") return "Escape";
  return key[0].toUpperCase() + key.slice(1);
}

export function shortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">,
  platform?: string
): string | null {
  const normalizedKey = normalizeKey(event.key);
  if (!normalizedKey || MODIFIER_KEYS.has(normalizedKey) || normalizedKey === "Dead") return null;
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) return null;

  const tokens: string[] = [];
  if (event.ctrlKey) tokens.push("Ctrl");
  if (event.metaKey) tokens.push(isMacPlatform(platform) ? "Cmd" : "Meta");
  if (event.altKey) tokens.push("Alt");
  if (event.shiftKey) tokens.push("Shift");
  tokens.push(normalizedKey);
  return tokens.join("+");
}

interface ParsedShortcut {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
}

function parseShortcut(shortcut: string): ParsedShortcut | null {
  const pieces = shortcut.split("+").map((part) => part.trim()).filter(Boolean);
  if (pieces.length < 2) return null;

  const flags = { ctrl: false, alt: false, meta: false, shift: false };
  let key = "";

  for (const piece of pieces) {
    const normalized = piece.toLowerCase();
    if (normalized === "ctrl" || normalized === "control") {
      flags.ctrl = true;
      continue;
    }
    if (normalized === "alt" || normalized === "option") {
      flags.alt = true;
      continue;
    }
    if (normalized === "shift") {
      flags.shift = true;
      continue;
    }
    if (normalized === "cmd" || normalized === "command" || normalized === "meta") {
      flags.meta = true;
      continue;
    }
    key = normalizeKey(piece);
  }

  if (!key) return null;
  return { ...flags, key };
}

export function keyboardEventMatchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  const eventKey = normalizeKey(event.key);
  return (
    eventKey === parsed.key &&
    event.ctrlKey === parsed.ctrl &&
    event.altKey === parsed.alt &&
    event.metaKey === parsed.meta &&
    event.shiftKey === parsed.shift
  );
}
