/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { showOverlay, removeOverlay } from "../../src/content/overlay";

function findOverlay(): HTMLDivElement | null {
  return Array.from(document.querySelectorAll("div")).find(
    (el) => el.textContent === "✨ Translating..."
  ) as HTMLDivElement | null;
}

describe("overlay positioning", () => {
  afterEach(() => {
    removeOverlay();
    document.body.innerHTML = "";
  });

  it("repositions when viewport moves", () => {
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);

    let rect = {
      top: 120,
      bottom: 140,
      left: 100,
      right: 320,
      width: 220,
      height: 20,
      x: 100,
      y: 120,
      toJSON: () => ({}),
    } as DOMRect;

    Object.defineProperty(anchor, "getBoundingClientRect", {
      value: () => rect,
    });

    showOverlay(anchor);
    const overlay = findOverlay();
    expect(overlay).not.toBeNull();
    const oldTop = overlay!.style.top;

    rect = {
      ...rect,
      top: 260,
      bottom: 280,
      y: 260,
    } as DOMRect;
    window.dispatchEvent(new Event("scroll"));

    expect(overlay!.style.top).not.toBe(oldTop);
  });
});
