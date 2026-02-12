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
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, { type: "trigger-translate" });
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
      if (!config.apiKey) {
        const errorMsg: PortMessage = {
          type: "error",
          message: "请先配置 API Key",
          code: "no_api_key",
        };
        port.postMessage(errorMsg);
        return;
      }

      for await (const accumulated of streamTranslation(
        msg.text,
        config,
        abortController.signal
      )) {
        const chunk: PortMessage = { type: "chunk", content: accumulated };
        port.postMessage(chunk);
      }

      const complete: PortMessage = { type: "complete" };
      port.postMessage(complete);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const errorMsg: PortMessage = {
        type: "error",
        message: err.message || "翻译失败",
        code: err.message?.includes("API Key") ? "invalid_api_key" : "unknown",
      };
      port.postMessage(errorMsg);
    }
  });

  port.onDisconnect.addListener(() => {
    abortController?.abort();
    abortController = null;
  });
});
