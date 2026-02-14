let overlayEl: HTMLDivElement | null = null;
let anchorEl: HTMLElement | null = null;
let unbindPositionListeners: (() => void) | null = null;

export function showOverlay(anchor: HTMLElement): void {
  removeOverlay();
  anchorEl = anchor;
  overlayEl = document.createElement("div");
  overlayEl.textContent = "✨ Translating...";
  overlayEl.setAttribute("style", `
    position: fixed; z-index: 2147483647;
    padding: 4px 10px; border-radius: 6px;
    background: #1a1a2e; color: #e0e0e0;
    font-size: 13px; font-family: system-ui, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    pointer-events: none; white-space: nowrap;
  `);
  document.body.appendChild(overlayEl);
  positionOverlay(anchor);
  bindPositionListeners();
}

export function removeOverlay(): void {
  overlayEl?.remove();
  overlayEl = null;
  anchorEl = null;
  if (unbindPositionListeners) {
    unbindPositionListeners();
    unbindPositionListeners = null;
  }
}

function positionOverlay(anchor: HTMLElement): void {
  if (!overlayEl) return;
  const rect = anchor.getBoundingClientRect();
  let top = rect.top - 30;
  let left = rect.right - overlayEl.offsetWidth;

  // Viewport collision detection
  if (top < 4) top = rect.bottom + 4;
  if (left < 4) left = rect.left;
  if (left + overlayEl.offsetWidth > window.innerWidth - 4) {
    left = window.innerWidth - overlayEl.offsetWidth - 4;
  }

  overlayEl.style.top = `${top}px`;
  overlayEl.style.left = `${left}px`;
}

function bindPositionListeners(): void {
  const onMove = () => {
    if (!overlayEl || !anchorEl) return;
    if (!anchorEl.isConnected) {
      removeOverlay();
      return;
    }
    positionOverlay(anchorEl);
  };
  window.addEventListener("scroll", onMove, true);
  window.addEventListener("resize", onMove);
  unbindPositionListeners = () => {
    window.removeEventListener("scroll", onMove, true);
    window.removeEventListener("resize", onMove);
  };
}
