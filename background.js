"use strict";
(() => {
  // src/messages.ts
  var TOGGLE_HELLO_DOCK = "TOGGLE_HELLO_DOCK";
  var OPEN_HELLO_DOCK = "OPEN_HELLO_DOCK";
  var CLOSE_HELLO_DOCK = "CLOSE_HELLO_DOCK";

  // src/background.ts
  var ALLOWED_PROTOCOLS = ["http:", "https:"];
  function isSupportedUrl(url) {
    try {
      const parsed = new URL(url);
      return ALLOWED_PROTOCOLS.includes(parsed.protocol);
    } catch {
      return false;
    }
  }
  async function openDockOnTab(tab) {
    if (!tab?.id || !tab.url || !isSupportedUrl(tab.url)) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: TOGGLE_HELLO_DOCK });
      return;
    } catch {
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await chrome.tabs.sendMessage(tab.id, { type: OPEN_HELLO_DOCK });
    } catch {
    }
  }
  chrome.action.onClicked.addListener(async (tab) => {
    await openDockOnTab(tab);
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== CLOSE_HELLO_DOCK) return;
    void (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const id = tabs[0]?.id;
      if (!id) return;
      await chrome.tabs.sendMessage(id, { type: CLOSE_HELLO_DOCK }).catch(() => void 0);
    })();
  });
})();
