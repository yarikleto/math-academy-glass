(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  if (globalThis[NAMESPACE_KEY]) return;

  const modules = new Map();
  const namespace = Object.freeze({
    has(name) {
      return modules.has(name);
    },
    register(name, api) {
      if (modules.has(name)) {
        throw new Error(`Math Academy Glass module already registered: ${name}`);
      }
      modules.set(name, Object.freeze(api));
    },
    require(name) {
      const api = modules.get(name);
      if (!api) {
        throw new Error(`Math Academy Glass module is unavailable: ${name}`);
      }
      return api;
    }
  });

  Object.defineProperty(globalThis, NAMESPACE_KEY, {
    configurable: false,
    enumerable: false,
    value: namespace,
    writable: false
  });

  const root = document.documentElement;
  const EXTENSION_REQUEST_TIMEOUT = 1500;

  function parseColor(value) {
    const match = value?.match(/rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,/\s]+(\d*\.?\d+))?\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4])
    };
  }

  function isPaleSurface(color) {
    return color && color.a > 0.55 && color.r >= 238 && color.g >= 238 && color.b >= 238;
  }

  function hasDirectText(element) {
    return [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
  }

  function isLearnPage() {
    return location.pathname === "/learn" ||
      location.pathname.startsWith("/learn/") ||
      location.pathname === "/tasks" ||
      location.pathname.startsWith("/tasks/") ||
      /^\/courses\/\d+\/progress\/?$/.test(location.pathname);
  }

  function pageKind() {
    if (isLearnPage()) return "learn";
    if (location.pathname === "/help" || location.pathname.startsWith("/help/")) {
      return "help";
    }
    if (location.pathname === "/how-it-works" || location.pathname.startsWith("/how-it-works/")) {
      return "how-it-works";
    }
    if (location.pathname === "/settings" || location.pathname.startsWith("/settings/")) {
      return "settings";
    }
    if (location.pathname === "/topics" || location.pathname.startsWith("/topics/")) {
      return "topic";
    }
    return "other";
  }

  function normalizeLabel(value) {
    return value?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  }

  function isVisibleControl(element) {
    if (!element.getClientRects().length) return false;
    let current = element;
    while (current) {
      const style = getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity) <= 0.01
      ) {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  }

  root.dataset.maGlassEnabled = "false";
  root.dataset.maGlassReady = "false";
  root.dataset.maGlassPage = pageKind();
  root.dataset.maGlassSessionPersistence = "pending";

  namespace.register("context", {
    extensionRequestTimeout: EXTENSION_REQUEST_TIMEOUT,
    getRoot: () => root,
    hasDirectText,
    isLearnPage,
    isPaleSurface,
    isVisibleControl,
    normalizeLabel,
    pageKind,
    parseColor
  });
})();
