/**
 * content script、background service worker、panel 之間的 runtime 訊息字串（單一來源）。
 */

export const TOGGLE_HELLO_DOCK = "TOGGLE_HELLO_DOCK";
export const OPEN_HELLO_DOCK = "OPEN_HELLO_DOCK";
export const CLOSE_HELLO_DOCK = "CLOSE_HELLO_DOCK";
export const SHOW_HELLO_BANNER = "SHOW_HELLO_BANNER";

export type DockRuntimeMessage =
  | { type: typeof TOGGLE_HELLO_DOCK }
  | { type: typeof OPEN_HELLO_DOCK }
  | { type: typeof CLOSE_HELLO_DOCK }
  | { type: typeof SHOW_HELLO_BANNER; payload?: string };
