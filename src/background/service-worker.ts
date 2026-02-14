import browser from "webextension-polyfill";
import { streamTranslation } from "./api-client";
import { PORT_NAME } from "../shared/constants";
import type { TranslateRequest, PortMessage } from "../shared/types";
import { logDebug } from "../shared/logger";

// Open options page on install (FTUE)
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
});

// Handle open-options request from content script
browser.runtime.onMessage.addListener((msg: unknown) => {
  if (typeof msg === "object" && msg !== null && (msg as { type?: string }).type === "open-options") {
    browser.runtime.openOptionsPage();
  }
});

// Handle streaming translation via port connections
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  let abortController: AbortController | null = null;
  const safePostMessage = (message: PortMessage): boolean => {
    try {
      port.postMessage(message);
      return true;
    } catch {
      return false;
    }
  };

  port.onMessage.addListener(async (rawMsg: unknown) => {
    if (typeof rawMsg !== "object" || rawMsg === null || (rawMsg as { type?: string }).type !== "translate") {
      return;
    }

    const msg = rawMsg as TranslateRequest;

    abortController = new AbortController();

    try {
      const config = msg.config;
      logDebug("[Service Worker] Received translate request", {
        textLength: msg.text.length,
        config,
      });
      if (!config || !config.apiKey) {
        const errorMsg: PortMessage = {
          type: "error",
          message: "请先配置 API Key",
          code: "no_api_key",
        };
        safePostMessage(errorMsg);
        return;
      }

      let chunkCount = 0;
      for await (const accumulated of streamTranslation(
        msg.text,
        config,
        abortController.signal
      )) {
        chunkCount++;
        console.log("[Service Worker] Chunk", chunkCount, "length:", accumulated.length);
        const chunk: PortMessage = { type: "chunk", content: accumulated };
        if (!safePostMessage(chunk)) {
          // Port disconnected (page in bfcache or closed)
          console.log("[Service Worker] Port disconnected during streaming");
          abortController?.abort();
          return;
        }
      }

      console.log("[Service Worker] Translation complete, total chunks:", chunkCount);
      const complete: PortMessage = { type: "complete" };
      if (!safePostMessage(complete)) {
        // Port already disconnected
        console.log("[Service Worker] Port disconnected before sending complete");
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("[Service Worker] Translation error:", err);
      const errorMsg: PortMessage = {
        type: "error",
        message: err.message || "翻译失败",
        code: err.message?.includes("API Key") ? "invalid_api_key" : "unknown",
      };
      if (!safePostMessage(errorMsg)) {
        // Port already disconnected
        console.log("[Service Worker] Port disconnected before sending error");
      }
    }
  });

  port.onDisconnect.addListener(() => {
    console.log("[Service Worker] Port disconnected");
    abortController?.abort();
    abortController = null;
  });
});
