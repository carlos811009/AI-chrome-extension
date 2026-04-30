import { CLOSE_HELLO_DOCK, OPEN_HELLO_DOCK, TOGGLE_HELLO_DOCK } from './messages';

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

function isSupportedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function openDockOnTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id || !tab.url || !isSupportedUrl(tab.url)) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: TOGGLE_HELLO_DOCK });
    return;
  } catch {
    // content script may not be ready yet.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: OPEN_HELLO_DOCK });
  } catch {
    // e.g. chrome:// pages or restricted urls cannot be injected.
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  await openDockOnTab(tab);
});

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message?.type !== CLOSE_HELLO_DOCK) return;
  void (async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const id = tabs[0]?.id;
    if (!id) return;
    await chrome.tabs.sendMessage(id, { type: CLOSE_HELLO_DOCK }).catch(() => undefined);
  })();
});
