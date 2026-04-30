/**
 * content script、background service worker、panel 之間的 runtime 訊息字串（單一來源）。
 */

export const TOGGLE_HELLO_DOCK = 'TOGGLE_HELLO_DOCK';
export const OPEN_HELLO_DOCK = 'OPEN_HELLO_DOCK';
export const CLOSE_HELLO_DOCK = 'CLOSE_HELLO_DOCK';
export const SHOW_HELLO_BANNER = 'SHOW_HELLO_BANNER';

export type DockRuntimeMessage =
  | { type: typeof TOGGLE_HELLO_DOCK }
  | { type: typeof OPEN_HELLO_DOCK }
  | { type: typeof CLOSE_HELLO_DOCK }
  | { type: typeof SHOW_HELLO_BANNER; payload?: string };

/** panel iframe →宿主頁（content script）`postMessage` 的 source 欄，用於拖曳／縮小等 */
export const PANEL_TO_HOST_SOURCE = 'personalExtDockPanel' as const;

export type PanelToHostDockMessage =
  | {
      source: typeof PANEL_TO_HOST_SOURCE;
      kind: 'dock-drag-start';
      /** 滑鼠在 iframe 內的 clientX／clientY（等同 panel 內 MouseEvent）；宿主用 iframe.getBoundingClientRect() 換算成頁面座標 */
      iframeClientX: number;
      iframeClientY: number;
    }
  | { source: typeof PANEL_TO_HOST_SOURCE; kind: 'dock-drag-reset-dblclick' }
  | { source: typeof PANEL_TO_HOST_SOURCE; kind: 'dock-minimize' };
