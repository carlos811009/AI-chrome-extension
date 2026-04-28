const ALLOWED_PROTOCOLS = ["http:", "https:"];

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
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_HELLO_DOCK" });
    return;
  } catch {
    // content script may not be ready yet.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "OPEN_HELLO_DOCK" });
  } catch {
    // e.g. chrome:// pages or restricted urls cannot be injected.
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  await openDockOnTab(tab);
});
