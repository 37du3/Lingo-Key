import { TOAST_DURATION_MS } from "../shared/constants";

export function showToast(
  message: string,
  options?: { clickable?: boolean; onClick?: () => void }
): void {
  const toast = document.createElement("div");
  toast.textContent = message;
  const clickable = options?.clickable ?? false;
  toast.setAttribute("style", `
    position: fixed; bottom: 20px; right: 20px;
    z-index: 2147483647;
    padding: 10px 16px; border-radius: 8px;
    background: #dc3545; color: #fff;
    font-size: 14px; font-family: system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    cursor: ${clickable ? "pointer" : "default"};
    transition: opacity 0.3s;
  `);
  if (clickable && options?.onClick) {
    toast.style.pointerEvents = "auto";
    toast.addEventListener("click", () => {
      options.onClick!();
      toast.remove();
    });
  }
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, TOAST_DURATION_MS);
}
