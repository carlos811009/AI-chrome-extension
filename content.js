"use strict";
(() => {
  // src/messages.ts
  var TOGGLE_HELLO_DOCK = "TOGGLE_HELLO_DOCK";
  var OPEN_HELLO_DOCK = "OPEN_HELLO_DOCK";
  var CLOSE_HELLO_DOCK = "CLOSE_HELLO_DOCK";
  var SHOW_HELLO_BANNER = "SHOW_HELLO_BANNER";

  // src/content.ts
  var DOCK_SHELL_ID = "personal-extension-dock-shell";
  var DOCK_RESIZE_ID = "personal-extension-resize-handle";
  var DOCK_HOST_CSS_ID = "personal-extension-dock-host-css";
  var DOCK_WIDTH_KEY = "personalExtDockWidth";
  var DOCK_MIN_WIDTH = 280;
  var DOCK_MAX_WIDTH = 860;
  var DOCK_DEFAULT_WIDTH = 360;
  function getSavedWidth() {
    const raw = sessionStorage.getItem(DOCK_WIDTH_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= DOCK_MIN_WIDTH && n <= DOCK_MAX_WIDTH) {
      return n;
    }
    return DOCK_DEFAULT_WIDTH;
  }
  var INLINE_STYLE_KEYS = {
    htmlPaddingRight: "data-personalExtHtmlPaddingRight",
    htmlWidth: "data-personalExtHtmlWidth",
    htmlBoxSizing: "data-personalExtHtmlBoxSizing",
    htmlOverflowX: "data-personalExtHtmlOverflowX",
    bodyPaddingRight: "data-personalExtBodyPaddingRight",
    bodyWidth: "data-personalExtBodyWidth",
    bodyBoxSizing: "data-personalExtBodyBoxSizing"
  };
  var DOCK_OPEN_CLASS = "personal-extension-dock-open";
  var extensionChrome = globalThis.chrome;
  function removeDock() {
    const shell = document.getElementById(DOCK_SHELL_ID);
    if (shell) shell.remove();
    restoreCompactionStyles();
  }
  function rememberInlineStyle(key, value) {
    document.documentElement.setAttribute(key, value ?? "");
  }
  function readRememberedInlineStyle(key) {
    return document.documentElement.getAttribute(key) ?? "";
  }
  function applyHostDockLayoutCss() {
    if (document.getElementById(DOCK_HOST_CSS_ID)) return;
    const style = document.createElement("style");
    style.id = DOCK_HOST_CSS_ID;
    style.textContent = `html.personal-extension-dock-open .MatContainer {
  min-width: 0 !important;
}`;
    (document.head ?? document.documentElement).appendChild(style);
  }
  function removeHostDockLayoutCss() {
    document.getElementById(DOCK_HOST_CSS_ID)?.remove();
  }
  function applyCompactionStyles(width) {
    const html = document.documentElement;
    const body = document.body;
    rememberInlineStyle(INLINE_STYLE_KEYS.htmlPaddingRight, html.style.paddingRight);
    rememberInlineStyle(INLINE_STYLE_KEYS.htmlWidth, html.style.width);
    rememberInlineStyle(INLINE_STYLE_KEYS.htmlBoxSizing, html.style.boxSizing);
    rememberInlineStyle(INLINE_STYLE_KEYS.htmlOverflowX, html.style.overflowX);
    html.classList.add(DOCK_OPEN_CLASS);
    html.style.paddingRight = `${width}px`;
    html.style.boxSizing = "border-box";
    html.style.width = "100%";
    html.style.overflowX = "hidden";
    applyHostDockLayoutCss();
    if (!body) return;
    rememberInlineStyle(INLINE_STYLE_KEYS.bodyPaddingRight, body.style.paddingRight);
    rememberInlineStyle(INLINE_STYLE_KEYS.bodyWidth, body.style.width);
    rememberInlineStyle(INLINE_STYLE_KEYS.bodyBoxSizing, body.style.boxSizing);
    body.style.boxSizing = "border-box";
    body.style.width = "100%";
  }
  function updateCompactionWidth(width) {
    document.documentElement.style.paddingRight = `${width}px`;
    if (document.body) document.body.style.paddingRight = `${width}px`;
  }
  function restoreCompactionStyles() {
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
  function createDock() {
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
      userSelect: "none"
    });
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
      background: "transparent"
    });
    resizeHandle.addEventListener("mouseenter", () => {
      resizeHandle.style.background = "rgba(99,102,241,0.25)";
    });
    resizeHandle.addEventListener("mouseleave", () => {
      resizeHandle.style.background = "transparent";
    });
    let dragging = false;
    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragging = true;
      document.body.style.cursor = "ew-resize";
      iframe.style.pointerEvents = "none";
    });
    document.addEventListener("mousemove", (e) => {
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
    const iframe = document.createElement("iframe");
    iframe.title = "Personal Workflow Assistant";
    iframe.src = extensionChrome.runtime.getURL("panel.html");
    Object.assign(iframe.style, {
      flex: "1",
      width: "100%",
      border: "0",
      minHeight: "0"
    });
    shell.appendChild(resizeHandle);
    shell.appendChild(iframe);
    document.documentElement.appendChild(shell);
    applyCompactionStyles(currentWidth);
  }
  function isDockOpen() {
    return Boolean(document.getElementById(DOCK_SHELL_ID));
  }
  function openDockIfClosed() {
    if (isDockOpen()) return;
    createDock();
  }
  function toggleDock() {
    if (isDockOpen()) {
      removeDock();
      return;
    }
    createDock();
  }
  extensionChrome?.runtime?.onMessage?.addListener((message) => {
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
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
    });
    document.body.appendChild(banner);
  });
})();
