export {};

import {
  type DockRuntimeMessage,
  CLOSE_HELLO_DOCK,
  OPEN_HELLO_DOCK,
  PANEL_TO_HOST_SOURCE,
  type PanelToHostDockMessage,
  SHOW_HELLO_BANNER,
  TOGGLE_HELLO_DOCK,
} from './messages';

const DOCK_SHELL_ID = 'personal-extension-dock-shell';
const DOCK_RESIZE_LEFT_ID = 'personal-extension-resize-left';
const DOCK_RESIZE_RIGHT_ID = 'personal-extension-resize-right';
const DOCK_RESIZE_CORNER_ID = 'personal-extension-resize-se';
const DOCK_HOST_CSS_ID = 'personal-extension-dock-host-css';
const DOCK_WIDTH_KEY = 'personalExtDockWidth';
const DOCK_HEIGHT_KEY = 'personalExtDockHeight';
const DOCK_POS_KEY = 'personalExtDockPos';
const DOCK_MIN_WIDTH = 280;
const DOCK_MAX_WIDTH = 860;
const DOCK_MIN_HEIGHT = 200;
const DOCK_DEFAULT_WIDTH = 360;
const DOCK_FLOAT_MAX_HEIGHT_PX = 880;
const DOCK_FLOAT_HEIGHT_VH = 0.88;

const INLINE_STYLE_KEYS = {
  htmlPaddingRight: 'data-personalExtHtmlPaddingRight',
  htmlWidth: 'data-personalExtHtmlWidth',
  htmlBoxSizing: 'data-personalExtHtmlBoxSizing',
  htmlOverflowX: 'data-personalExtHtmlOverflowX',
  bodyPaddingRight: 'data-personalExtBodyPaddingRight',
  bodyWidth: 'data-personalExtBodyWidth',
  bodyBoxSizing: 'data-personalExtBodyBoxSizing',
} as const;

const DOCK_OPEN_CLASS = 'personal-extension-dock-open';

const extensionChrome = (
  globalThis as {
    chrome?: {
      runtime: {
        getURL: (path: string) => string;
        onMessage: { addListener: (cb: (message: DockRuntimeMessage) => void) => void };
      };
    };
  }
).chrome;

function getSavedWidth(): number {
  const raw = sessionStorage.getItem(DOCK_WIDTH_KEY);
  const n = Number(raw);
  if (Number.isFinite(n) && n >= DOCK_MIN_WIDTH && n <= DOCK_MAX_WIDTH) {
    return n;
  }
  return DOCK_DEFAULT_WIDTH;
}

function maxDockHeightPx(): number {
  return Math.min(1200, Math.max(DOCK_MIN_HEIGHT, window.innerHeight - 16));
}

function floatShellDefaultHeightPx(): number {
  return Math.min(window.innerHeight * DOCK_FLOAT_HEIGHT_VH, DOCK_FLOAT_MAX_HEIGHT_PX);
}

function getSavedHeight(): number {
  const raw = sessionStorage.getItem(DOCK_HEIGHT_KEY);
  const n = Number(raw);
  const maxH = maxDockHeightPx();
  if (Number.isFinite(n) && n >= DOCK_MIN_HEIGHT && n <= maxH) {
    return n;
  }
  return Math.min(floatShellDefaultHeightPx(), maxH);
}

function saveShellHeight(h: number): void {
  try {
    sessionStorage.setItem(DOCK_HEIGHT_KEY, String(h));
  } catch {
    void 0;
  }
}

function getSavedShellPosition(width: number, height: number): { left: number; top: number } {
  const h = height;
  try {
    const raw = sessionStorage.getItem(DOCK_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { left?: unknown; top?: unknown };
      if (typeof p.left === 'number' && typeof p.top === 'number' && Number.isFinite(p.left) && Number.isFinite(p.top)) {
        return {
          left: Math.max(0, Math.min(p.left, window.innerWidth - width)),
          top: Math.max(0, Math.min(p.top, window.innerHeight - h)),
        };
      }
    }
  } catch {
    void 0;
  }
  return {
    left: Math.max(8, window.innerWidth - width - 12),
    top: Math.max(8, Math.round((window.innerHeight - h) / 2)),
  };
}

function saveShellPosition(left: number, top: number): void {
  try {
    sessionStorage.setItem(DOCK_POS_KEY, JSON.stringify({ left, top }));
  } catch {
    void 0;
  }
}

function readRememberedInlineStyle(key: string): string {
  return document.documentElement.getAttribute(key) ?? '';
}

function applyHostDockLayoutCss(): void {
  if (document.getElementById(DOCK_HOST_CSS_ID)) return;
  const style = document.createElement('style');
  style.id = DOCK_HOST_CSS_ID;
  style.textContent = `html.personal-extension-dock-open .MatContainer {
  min-width: 0 !important;
}`;
  (document.head ?? document.documentElement).appendChild(style);
}

function removeHostDockLayoutCss(): void {
  document.getElementById(DOCK_HOST_CSS_ID)?.remove();
}

function restoreCompactionStyles(): void {
  removeHostDockLayoutCss();

  const html = document.documentElement;
  const body = document.body;

  html.classList.remove(DOCK_OPEN_CLASS);
  html.style.paddingRight = readRememberedInlineStyle(INLINE_STYLE_KEYS.htmlPaddingRight);
  html.style.width = readRememberedInlineStyle(INLINE_STYLE_KEYS.htmlWidth);
  html.style.boxSizing = readRememberedInlineStyle(INLINE_STYLE_KEYS.htmlBoxSizing);
  html.style.overflowX = readRememberedInlineStyle(INLINE_STYLE_KEYS.htmlOverflowX);

  if (!body) return;
  body.style.paddingRight = readRememberedInlineStyle(INLINE_STYLE_KEYS.bodyPaddingRight);
  body.style.width = readRememberedInlineStyle(INLINE_STYLE_KEYS.bodyWidth);
  body.style.boxSizing = readRememberedInlineStyle(INLINE_STYLE_KEYS.bodyBoxSizing);
}

function clampShellInViewport(shell: HTMLElement): void {
  const r = shell.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  let left = r.left;
  let top = r.top;
  left = Math.max(0, Math.min(left, window.innerWidth - w));
  top = Math.max(0, Math.min(top, window.innerHeight - h));
  shell.style.left = `${left}px`;
  shell.style.top = `${top}px`;
}

function isPanelDockMessage(data: unknown): data is PanelToHostDockMessage {
  if (typeof data !== 'object' || data === null) return false;
  const o = data as Record<string, unknown>;
  return o.source === PANEL_TO_HOST_SOURCE && typeof o.kind === 'string';
}

function removeDock(): void {
  const shell = document.getElementById(DOCK_SHELL_ID);
  if (shell) {
    const ext = shell as HTMLElement & { personalExtCleanup?: () => void };
    ext.personalExtCleanup?.();
    shell.remove();
  }
  restoreCompactionStyles();
}

function createDock(): void {
  if (!extensionChrome?.runtime?.getURL) return;
  if (document.getElementById(DOCK_SHELL_ID)) return;

  let currentWidth = getSavedWidth();
  let currentHeight = getSavedHeight();
  const pos = getSavedShellPosition(currentWidth, currentHeight);

  const shell = document.createElement('div');
  shell.id = DOCK_SHELL_ID;
  Object.assign(shell.style, {
    position: 'fixed',
    left: `${pos.left}px`,
    top: `${pos.top}px`,
    width: `${currentWidth}px`,
    height: `${currentHeight}px`,
    zIndex: '2147483646',
    background: '#f4f5f8',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(148, 163, 184, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '14px',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    userSelect: 'none',
    boxSizing: 'border-box',
  });

  const contentWrap = document.createElement('div');
  Object.assign(contentWrap.style, {
    position: 'relative',
    flex: '1',
    minHeight: '0',
    display: 'flex',
    flexDirection: 'column',
  });

  const resizeLeft = document.createElement('div');
  resizeLeft.id = DOCK_RESIZE_LEFT_ID;
  Object.assign(resizeLeft.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '6px',
    height: '100%',
    cursor: 'ew-resize',
    zIndex: '7',
    background: 'transparent',
    touchAction: 'none',
  });

  const resizeRight = document.createElement('div');
  resizeRight.id = DOCK_RESIZE_RIGHT_ID;
  Object.assign(resizeRight.style, {
    position: 'absolute',
    top: '0',
    right: '0',
    width: '6px',
    height: 'calc(100% - 22px)',
    cursor: 'ew-resize',
    zIndex: '7',
    background: 'transparent',
    touchAction: 'none',
  });

  const resizeCorner = document.createElement('div');
  resizeCorner.id = DOCK_RESIZE_CORNER_ID;
  resizeCorner.setAttribute('role', 'presentation');
  resizeCorner.title = '右下角拖曳：同時調整寬與高。左／右邊緣可單獨調整寬度。';
  Object.assign(resizeCorner.style, {
    position: 'absolute',
    right: '0',
    bottom: '0',
    width: '20px',
    height: '20px',
    zIndex: '8',
    cursor: 'nwse-resize',
    boxSizing: 'border-box',
    borderBottomRightRadius: '12px',
    background: `
      linear-gradient(135deg, transparent 52%, rgba(148, 163, 184, 0.35) 52%),
      linear-gradient(135deg, transparent 62%, rgba(148, 163, 184, 0.55) 62%),
      linear-gradient(135deg, transparent 72%, rgba(100, 116, 139, 0.65) 72%)
    `
      .replace(/\s+/g, ' ')
      .trim(),
    touchAction: 'none',
  });

  const setEdgeHover = (el: HTMLElement, on: boolean): void => {
    el.style.background = on ? 'rgba(99, 102, 241, 0.28)' : 'transparent';
  };

  const setCornerGripHover = (on: boolean): void => {
    resizeCorner.style.background = on
      ? `
      linear-gradient(135deg, transparent 50%, rgba(99, 102, 241, 0.45) 50%),
      linear-gradient(135deg, transparent 60%, rgba(99, 102, 241, 0.55) 60%),
      linear-gradient(135deg, transparent 70%, rgba(79, 70, 229, 0.65) 70%)
    `
          .replace(/\s+/g, ' ')
          .trim()
      : `
      linear-gradient(135deg, transparent 52%, rgba(148, 163, 184, 0.35) 52%),
      linear-gradient(135deg, transparent 62%, rgba(148, 163, 184, 0.55) 62%),
      linear-gradient(135deg, transparent 72%, rgba(100, 116, 139, 0.65) 72%)
    `
          .replace(/\s+/g, ' ')
          .trim();
  };

  resizeLeft.addEventListener('mouseenter', () => {
    if (!resizeEdge) setEdgeHover(resizeLeft, true);
  });
  resizeLeft.addEventListener('mouseleave', () => {
    if (!resizeEdge) setEdgeHover(resizeLeft, false);
  });
  resizeRight.addEventListener('mouseenter', () => {
    if (!resizeEdge) setEdgeHover(resizeRight, true);
  });
  resizeRight.addEventListener('mouseleave', () => {
    if (!resizeEdge) setEdgeHover(resizeRight, false);
  });

  resizeCorner.addEventListener('mouseenter', () => {
    if (!resizeEdge) setCornerGripHover(true);
  });
  resizeCorner.addEventListener('mouseleave', () => {
    if (!resizeEdge) setCornerGripHover(false);
  });

  let resizeEdge: null | 'left' | 'right' | 'corner-se' = null;
  let resizeStartClientX = 0;
  let resizeStartClientY = 0;
  let resizeStartW = 0;
  let resizeStartH = 0;

  const iframe = document.createElement('iframe');
  iframe.title = 'Personal Workflow Assistant';
  iframe.src = extensionChrome.runtime.getURL('panel.html');
  Object.assign(iframe.style, {
    flex: '1',
    width: '100%',
    border: '0',
    minHeight: '0',
  });

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'personal-extension-dock-expand';
  expandBtn.textContent = '▢';
  expandBtn.title = '展開面板';
  Object.assign(expandBtn.style, {
    display: 'none',
    position: 'absolute',
    inset: '0',
    zIndex: '25',
    margin: '0',
    border: '0',
    borderRadius: '12px',
    background: 'linear-gradient(135deg,#6366f1,#7c3aed)',
    color: '#fff',
    fontSize: '22px',
    lineHeight: '1',
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'center',
  });

  let posDrag = false;
  let dragStartAnchorClientX = 0;
  let dragStartAnchorClientY = 0;
  let shellStartLeft = 0;
  let shellStartTop = 0;

  let minimized = false;
  let preMini: { left: number; top: number; width: number; height: number } | null = null;

  const applyNormalShellChrome = (): void => {
    shell.style.borderRadius = '14px';
    // 必須維持 flex：若設為 '' 會回到預設 block，iframe 的 flex:1 失效而高度塌陷（縮小後放大只看到灰底）
    contentWrap.style.display = 'flex';
    contentWrap.style.flexDirection = 'column';
    resizeLeft.style.display = 'block';
    resizeRight.style.display = 'block';
    resizeCorner.style.display = 'block';
    expandBtn.style.display = 'none';
  };

  const setMinimized = (m: boolean): void => {
    if (m && !minimized) {
      const r = shell.getBoundingClientRect();
      preMini = { left: r.left, top: r.top, width: r.width, height: r.height };
      minimized = true;
      shell.style.left = '8px';
      shell.style.top = '8px';
      shell.style.width = '52px';
      shell.style.height = '52px';
      shell.style.borderRadius = '12px';
      contentWrap.style.display = 'none';
      resizeLeft.style.display = 'none';
      resizeRight.style.display = 'none';
      resizeCorner.style.display = 'none';
      expandBtn.style.display = 'flex';
    } else if (!m && minimized) {
      minimized = false;
      if (preMini) {
        shell.style.left = `${preMini.left}px`;
        shell.style.top = `${preMini.top}px`;
        shell.style.width = `${Math.round(preMini.width)}px`;
        shell.style.height = `${Math.round(preMini.height)}px`;
        currentWidth = Math.round(preMini.width);
        currentHeight = Math.round(preMini.height);
        sessionStorage.setItem(DOCK_WIDTH_KEY, String(currentWidth));
        saveShellHeight(currentHeight);
        saveShellPosition(preMini.left, preMini.top);
      } else {
        const w = getSavedWidth();
        const h = getSavedHeight();
        const p = getSavedShellPosition(w, h);
        shell.style.width = `${w}px`;
        shell.style.height = `${h}px`;
        shell.style.left = `${p.left}px`;
        shell.style.top = `${p.top}px`;
        currentWidth = w;
        currentHeight = h;
        sessionStorage.setItem(DOCK_WIDTH_KEY, String(w));
        saveShellHeight(h);
        saveShellPosition(p.left, p.top);
      }
      applyNormalShellChrome();
      preMini = null;
      clampShellInViewport(shell);
    }
  };

  expandBtn.addEventListener('click', () => {
    setMinimized(false);
  });

  const onCornerDown = (e: MouseEvent): void => {
    if (e.button !== 0 || minimized) return;
    e.preventDefault();
    resizeEdge = 'corner-se';
    const r = shell.getBoundingClientRect();
    resizeStartClientX = e.clientX;
    resizeStartClientY = e.clientY;
    resizeStartW = r.width;
    resizeStartH = r.height;
    document.body.style.cursor = 'nwse-resize';
    iframe.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';
    setEdgeHover(resizeLeft, false);
    setEdgeHover(resizeRight, false);
  };

  resizeCorner.addEventListener('mousedown', onCornerDown);

  const onSideDown =
    (edge: 'left' | 'right') =>
    (e: MouseEvent): void => {
      if (e.button !== 0 || minimized) return;
      e.preventDefault();
      resizeEdge = edge;
      document.body.style.cursor = 'ew-resize';
      iframe.style.pointerEvents = 'none';
      document.body.style.userSelect = 'none';
      setCornerGripHover(false);
    };

  resizeLeft.addEventListener('mousedown', onSideDown('left'));
  resizeRight.addEventListener('mousedown', onSideDown('right'));

  const onDocMouseMove = (e: MouseEvent): void => {
    if (resizeEdge === 'left') {
      const rect = shell.getBoundingClientRect();
      const right = rect.right;
      let newWidth = Math.round(right - e.clientX);
      newWidth = Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, newWidth));
      shell.style.left = `${right - newWidth}px`;
      shell.style.width = `${newWidth}px`;
      currentWidth = newWidth;
      sessionStorage.setItem(DOCK_WIDTH_KEY, String(newWidth));
      clampShellInViewport(shell);
      return;
    }
    if (resizeEdge === 'right') {
      const rect = shell.getBoundingClientRect();
      let newWidth = Math.round(e.clientX - rect.left);
      newWidth = Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, newWidth));
      shell.style.width = `${newWidth}px`;
      currentWidth = newWidth;
      sessionStorage.setItem(DOCK_WIDTH_KEY, String(newWidth));
      clampShellInViewport(shell);
      return;
    }
    if (resizeEdge === 'corner-se') {
      const maxH = maxDockHeightPx();
      let newW = Math.round(resizeStartW + (e.clientX - resizeStartClientX));
      let newH = Math.round(resizeStartH + (e.clientY - resizeStartClientY));
      newW = Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, newW));
      newH = Math.min(maxH, Math.max(DOCK_MIN_HEIGHT, newH));
      shell.style.width = `${newW}px`;
      shell.style.height = `${newH}px`;
      currentWidth = newW;
      currentHeight = newH;
      sessionStorage.setItem(DOCK_WIDTH_KEY, String(newW));
      saveShellHeight(newH);
      clampShellInViewport(shell);
      return;
    }
    if (posDrag) {
      let left = shellStartLeft + (e.clientX - dragStartAnchorClientX);
      let top = shellStartTop + (e.clientY - dragStartAnchorClientY);
      const r = shell.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      left = Math.max(0, Math.min(left, window.innerWidth - w));
      top = Math.max(0, Math.min(top, window.innerHeight - h));
      shell.style.left = `${left}px`;
      shell.style.top = `${top}px`;
    }
  };

  const clearResizeHover = (): void => {
    setCornerGripHover(false);
    setEdgeHover(resizeLeft, false);
    setEdgeHover(resizeRight, false);
  };

  const onDocMouseUp = (): void => {
    if (resizeEdge) {
      resizeEdge = null;
      document.body.style.cursor = '';
      iframe.style.pointerEvents = '';
      document.body.style.userSelect = '';
      clearResizeHover();
      clampShellInViewport(shell);
      const r = shell.getBoundingClientRect();
      sessionStorage.setItem(DOCK_WIDTH_KEY, String(Math.round(r.width)));
      saveShellHeight(Math.round(r.height));
    }
    if (posDrag) {
      posDrag = false;
      iframe.style.pointerEvents = '';
      document.body.style.userSelect = '';
      const r = shell.getBoundingClientRect();
      saveShellPosition(r.left, r.top);
    }
  };

  const onWinResize = (): void => {
    if (!document.getElementById(DOCK_SHELL_ID) || minimized) return;
    clampShellInViewport(shell);
    const maxH = maxDockHeightPx();
    let h = shell.getBoundingClientRect().height;
    if (h > maxH) {
      h = maxH;
      shell.style.height = `${h}px`;
      currentHeight = h;
      saveShellHeight(h);
    }
    const w = shell.getBoundingClientRect().width;
    if (w > window.innerWidth - 8) {
      const nw = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, window.innerWidth - 16));
      shell.style.width = `${nw}px`;
      currentWidth = nw;
      sessionStorage.setItem(DOCK_WIDTH_KEY, String(nw));
    }
  };

  const onWindowMessage = (ev: MessageEvent): void => {
    if (ev.source !== iframe.contentWindow) return;
    if (!isPanelDockMessage(ev.data)) return;
    const d = ev.data;
    if (d.kind === 'dock-drag-start' && !minimized) {
      if (typeof d.iframeClientX !== 'number' || typeof d.iframeClientY !== 'number') return;
      const ir = iframe.getBoundingClientRect();
      posDrag = true;
      dragStartAnchorClientX = ir.left + d.iframeClientX;
      dragStartAnchorClientY = ir.top + d.iframeClientY;
      const r = shell.getBoundingClientRect();
      shellStartLeft = r.left;
      shellStartTop = r.top;
      iframe.style.pointerEvents = 'none';
      document.body.style.userSelect = 'none';
    } else if (d.kind === 'dock-drag-reset-dblclick' && !minimized) {
      sessionStorage.removeItem(DOCK_POS_KEY);
      const w = shell.getBoundingClientRect().width;
      const h = shell.getBoundingClientRect().height;
      const def = getSavedShellPosition(w, h);
      shell.style.left = `${def.left}px`;
      shell.style.top = `${def.top}px`;
      saveShellPosition(def.left, def.top);
    } else if (d.kind === 'dock-minimize') {
      setMinimized(true);
    }
  };

  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp);
  window.addEventListener('resize', onWinResize);
  window.addEventListener('message', onWindowMessage);

  (shell as HTMLElement & { personalExtCleanup?: () => void }).personalExtCleanup = () => {
    document.removeEventListener('mousemove', onDocMouseMove);
    document.removeEventListener('mouseup', onDocMouseUp);
    window.removeEventListener('resize', onWinResize);
    window.removeEventListener('message', onWindowMessage);
  };

  contentWrap.appendChild(iframe);
  shell.appendChild(contentWrap);
  shell.appendChild(resizeLeft);
  shell.appendChild(resizeRight);
  shell.appendChild(resizeCorner);
  shell.appendChild(expandBtn);

  document.documentElement.appendChild(shell);

  document.documentElement.classList.add(DOCK_OPEN_CLASS);
  applyHostDockLayoutCss();
  clampShellInViewport(shell);
}

function isDockOpen(): boolean {
  return Boolean(document.getElementById(DOCK_SHELL_ID));
}

function openDockIfClosed(): void {
  if (isDockOpen()) return;
  createDock();
}

function toggleDock(): void {
  if (isDockOpen()) {
    removeDock();
    return;
  }
  createDock();
}

extensionChrome?.runtime?.onMessage?.addListener((message: DockRuntimeMessage) => {
  if (message?.type === CLOSE_HELLO_DOCK) {
    if (isDockOpen()) removeDock();
    return;
  }

  if (message?.type === TOGGLE_HELLO_DOCK) {
    toggleDock();
    return;
  }

  if (message?.type === OPEN_HELLO_DOCK) {
    openDockIfClosed();
    return;
  }

  if (message?.type !== SHOW_HELLO_BANNER) return;

  const old = document.getElementById('personal-extension-banner');
  if (old) old.remove();

  const banner = document.createElement('div');
  banner.id = 'personal-extension-banner';
  const content = message?.payload || 'Hello from Extension';
  banner.textContent = content;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    zIndex: '2147483647',
    background: '#111',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    lineHeight: '1.4',
    maxWidth: '420px',
    maxHeight: '70vh',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  });

  document.body.appendChild(banner);
});
