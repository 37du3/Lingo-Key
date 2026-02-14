import browser from "webextension-polyfill";
import { streamTranslation } from "./api-client";
import { PORT_NAME } from "../shared/constants";
import type { TranslateRequest, PortMessage } from "../shared/types";

// Open options page on install (FTUE)
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
});

// Forward chrome.commands to the active tab's content script
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "trigger-translate") return;
  console.log("[Service Worker] Command received:", command);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  console.log("[Service Worker] Active tab:", tab?.id, tab?.url);
  if (tab?.id) {
    try {
      await browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
      console.log("[Service Worker] Message sent successfully");
    } catch (err) {
      // Content script not loaded, try to inject it
      console.warn("[Service Worker] Failed to send message, attempting to inject content script:", err);
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/content/index.js"]
        });
        console.log("[Service Worker] Content script injected, retrying message");
        // Wait a bit for script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        await browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
      } catch (injectErr) {
        console.error("[Service Worker] Failed to inject content script:", injectErr);
      }
    }
  }
});

// Handle open-options request from content script
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "open-options") {
    browser.runtime.openOptionsPage();
  }
});

// Handle streaming translation via port connections
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  let abortController: AbortController | null = null;

  port.onMessage.addListener(async (msg: TranslateRequest) => {
    if (msg.type !== "translate") return;

    abortController = new AbortController();

    try {
      const config = msg.config;
      console.log("[Service Worker] Received translate request:", { textLength: msg.text.length, config });
      if (!config || !config.apiKey) {
        const errorMsg: PortMessage = {
          type: "error",
          message: "请先配置 API Key",
          code: "no_api_key",
        };
        port.postMessage(errorMsg);
        return;
      }

      let chunkCount = 0;
      for await (const accumulated of streamTranslation(
        msg.text,
        config,
        abortController.signal
      )) {
        chunkCount++;
        console.log("[Service Worker] Chunk", chunkCount, "length:", accumulated.length, "content:", accumulated.substring(0, 50));
        try {
          const chunk: PortMessage = { type: "chunk", content: accumulated };
          port.postMessage(chunk);
        } catch (err) {
          // Port disconnected (page in bfcache or closed)
          console.log("[Service Worker] Port disconnected during streaming");
          abortController?.abort();
          return;
        }
      }

      console.log("[Service Worker] Translation complete, total chunks:", chunkCount);
      try {
        const complete: PortMessage = { type: "complete" };
        port.postMessage(complete);
      } catch (err) {
        // Port already disconnected
        console.log("[Service Worker] Port disconnected before sending complete");
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("[Service Worker] Translation error:", err);
      try {
        const errorMsg: PortMessage = {
          type: "error",
          message: err.message || "翻译失败",
          code: err.message?.includes("API Key") ? "invalid_api_key" : "unknown",
        };
        port.postMessage(errorMsg);
      } catch {
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
