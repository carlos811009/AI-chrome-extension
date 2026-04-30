export const TOGGLE_HELLO_DOCK = 'TOGGLE_HELLO_DOCK';
export const OPEN_HELLO_DOCK = 'OPEN_HELLO_DOCK';
export const CLOSE_HELLO_DOCK = 'CLOSE_HELLO_DOCK';
export const SHOW_HELLO_BANNER = 'SHOW_HELLO_BANNER';

export type DockRuntimeMessage =
  | { type: typeof TOGGLE_HELLO_DOCK }
  | { type: typeof OPEN_HELLO_DOCK }
  | { type: typeof CLOSE_HELLO_DOCK }
  | { type: typeof SHOW_HELLO_BANNER; payload?: string };

export const PANEL_TO_HOST_SOURCE = 'personalExtDockPanel' as const;

export type PanelToHostDockMessage =
  | {
      source: typeof PANEL_TO_HOST_SOURCE;
      kind: 'dock-drag-start';
      iframeClientX: number;
      iframeClientY: number;
    }
  | { source: typeof PANEL_TO_HOST_SOURCE; kind: 'dock-drag-reset-dblclick' }
  | { source: typeof PANEL_TO_HOST_SOURCE; kind: 'dock-minimize' };
