export {};

type ContentMessage = {
  type?: string;
  payload?: string;
};

const DOCK_SHELL_ID = "personal-extension-dock-shell";
const DOCK_RESIZE_ID = "personal-extension-resize-handle";
const DOCK_WIDTH_KEY = "personalExtDockWidth";
const DOCK_MIN_WIDTH = 280;
const DOCK_MAX_WIDTH = 860;
const DOCK_DEFAULT_WIDTH = 620;

function getSavedWidth(): number {
  const raw = sessionStorage.getItem(DOCK_WIDTH_KEY);
  const n = Number(raw);
  if (Number.isFinite(n) && n >= DOCK_MIN_WIDTH && n <= DOCK_MAX_WIDTH) {
    return Math.max(n, DOCK_DEFAULT_WIDTH);
  }
  return DOCK_DEFAULT_WIDTH;
}
const INLINE_STYLE_KEYS = {
  htmlPaddingRight: "data-personalExtHtmlPaddingRight",
  htmlWidth: "data-personalExtHtmlWidth",
  htmlBoxSizing: "data-personalExtHtmlBoxSizing",
  bodyPaddingRight: "data-personalExtBodyPaddingRight",
  bodyWidth: "data-personalExtBodyWidth",
  bodyBoxSizing: "data-personalExtBodyBoxSizing",
} as const;

const extensionChrome = (
  globalThis as {
    chrome?: {
      runtime: {
        getURL: (path: string) => string;
        onMessage: { addListener: (cb: (message: ContentMessage) => void) => void };
      };
    };
  }
).chrome;

function removeDock(): void {
  const shell = document.getElementById(DOCK_SHELL_ID);
  if (shell) shell.remove();
  restoreCompactionStyles();
}

function rememberInlineStyle(key: string, value: string | null): void {
  document.documentElement.setAttribute(key, value ?? "");
}

function readRememberedInlineStyle(key: string): string {
  return document.documentElement.getAttribute(key) ?? "";
}

function applyCompactionStyles(width: number): void {
  const html = document.documentElement;
  const body = document.body;

  rememberInlineStyle(INLINE_STYLE_KEYS.htmlPaddingRight, html.style.paddingRight);
  rememberInlineStyle(INLINE_STYLE_KEYS.htmlWidth, html.style.width);
  rememberInlineStyle(INLINE_STYLE_KEYS.htmlBoxSizing, html.style.boxSizing);

  html.style.paddingRight = `${width}px`;
  html.style.boxSizing = "border-box";
  html.style.width = "100%";

  if (!body) return;
  rememberInlineStyle(INLINE_STYLE_KEYS.bodyPaddingRight, body.style.paddingRight);
  rememberInlineStyle(INLINE_STYLE_KEYS.bodyWidth, body.style.width);
  rememberInlineStyle(INLINE_STYLE_KEYS.bodyBoxSizing, body.style.boxSizing);

  body.style.boxSizing = "border-box";
}

function updateCompactionWidth(width: number): void {
  document.documentElement.style.paddingRight = `${width}px`;
}

function restoreCompactionStyles(): void {
  const html = document.documentElement;
  const body = document.body;

  html.style.paddingRight = readRememberedInlineStyle(INLINE_STYLE_KEYS.htmlPaddingRight);
  html.style.width = readRememberedInlineStyle(INLINE_STYLE_KEYS.htmlWidth);
  html.style.boxSizing = readRememberedInlineStyle(INLINE_STYLE_KEYS.htmlBoxSizing);

  if (!body) return;
  body.style.paddingRight = readRememberedInlineStyle(INLINE_STYLE_KEYS.bodyPaddingRight);
  body.style.width = readRememberedInlineStyle(INLINE_STYLE_KEYS.bodyWidth);
  body.style.boxSizing = readRememberedInlineStyle(INLINE_STYLE_KEYS.bodyBoxSizing);
}

function createDock(): void {
  if (!extensionChrome?.runtime?.getURL) return;
  if (document.getElementById(DOCK_SHELL_ID)) return;

  let currentWidth = getSavedWidth();

  const shell = document.createElement("div");
  shell.id = DOCK_SHELL_ID;
  Object.assign(shell.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: `${currentWidth}px`,
    height: "100vh",
    zIndex: "2147483646",
    background: "#fff",
    boxShadow: "-2px 0 12px rgba(0,0,0,0.18)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    userSelect: "none",
  });

  // ── Resize handle (left edge) ──
  const resizeHandle = document.createElement("div");
  resizeHandle.id = DOCK_RESIZE_ID;
  Object.assign(resizeHandle.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "5px",
    height: "100%",
    cursor: "ew-resize",
    zIndex: "1",
    background: "transparent",
  });
  resizeHandle.addEventListener("mouseenter", () => {
    resizeHandle.style.background = "rgba(99,102,241,0.25)";
  });
  resizeHandle.addEventListener("mouseleave", () => {
    resizeHandle.style.background = "transparent";
  });

  let dragging = false;
  resizeHandle.addEventListener("mousedown", (e: MouseEvent) => {
    e.preventDefault();
    dragging = true;
    document.body.style.cursor = "ew-resize";
    // Prevent iframe from swallowing mouse events during drag
    iframe.style.pointerEvents = "none";
  });
  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;
    const newWidth = Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, window.innerWidth - e.clientX));
    currentWidth = newWidth;
    shell.style.width = `${newWidth}px`;
    updateCompactionWidth(newWidth);
    sessionStorage.setItem(DOCK_WIDTH_KEY, String(newWidth));
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    iframe.style.pointerEvents = "";
  });

  // ── Header ──
  const header = document.createElement("div");
  Object.assign(header.style, {
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "10px 12px 10px 16px",
    borderBottom: "1px solid #e0e0e0",
    background: "#fafafa",
    fontSize: "14px",
    fontWeight: "600",
    color: "#202124",
  });

  const title = document.createElement("span");
  title.textContent = "Internal API Helper";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "關閉面板");
  closeBtn.textContent = "×";
  Object.assign(closeBtn.style, {
    border: "0",
    background: "transparent",
    fontSize: "22px",
    lineHeight: "1",
    cursor: "pointer",
    color: "#5f6368",
    padding: "4px 8px",
    borderRadius: "6px",
  });
  closeBtn.addEventListener("mouseenter", () => { closeBtn.style.background = "#e8eaed"; });
  closeBtn.addEventListener("mouseleave", () => { closeBtn.style.background = "transparent"; });
  closeBtn.addEventListener("click", () => { removeDock(); });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // ── iframe ──
  const iframe = document.createElement("iframe");
  iframe.title = "Internal API Helper";
  iframe.src = extensionChrome.runtime.getURL("panel.html");
  Object.assign(iframe.style, {
    flex: "1",
    width: "100%",
    border: "0",
    minHeight: "0",
  });

  shell.appendChild(resizeHandle);
  shell.appendChild(header);
  shell.appendChild(iframe);
  document.documentElement.appendChild(shell);

  applyCompactionStyles(currentWidth);
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

extensionChrome?.runtime?.onMessage?.addListener((message: ContentMessage) => {
  if (message?.type === "TOGGLE_HELLO_DOCK") {
    toggleDock();
    return;
  }

  if (message?.type === "OPEN_HELLO_DOCK") {
    openDockIfClosed();
    return;
  }

  if (message?.type !== "SHOW_HELLO_BANNER") return;

  const old = document.getElementById("personal-extension-banner");
  if (old) old.remove();

  const banner = document.createElement("div");
  banner.id = "personal-extension-banner";
  const content = message?.payload || "Hello from Extension";
  banner.textContent = content;
  Object.assign(banner.style, {
    position: "fixed",
    top: "12px",
    right: `${getSavedWidth() + 12}px`,
    zIndex: "2147483647",
    background: "#111",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    lineHeight: "1.4",
    maxWidth: "420px",
    maxHeight: "70vh",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  });

  document.body.appendChild(banner);
});
