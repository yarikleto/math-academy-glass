(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("appearance")) return;

  const context = namespace.require("context");
  const root = context.getRoot();
  const DEFAULTS = Object.freeze({
    enabled: true,
    theme: "system"
  });
  const LEAGUE_NAMES = Object.freeze([
    "diamond", "emerald", "ruby", "sapphire", "platinum",
    "gold", "silver", "bronze", "iron"
  ]);
  const MATH_TOOLBOX_ICONS = Object.freeze([
    ["frac", "fraction"], ["sqr", "square"], ["exp", "exponent"],
    ["sub", "subscript"], ["sqrt", "square-root"], ["cbrt", "cube-root"],
    ["nrt", "nth-root"], ["abs", "absolute"], ["gt", "greater-than"],
    ["lt", "less-than"], ["gte", "greater-than-or-equal"],
    ["lte", "less-than-or-equal"], ["ne", "not-equal"],
    ["pm", "plus-minus"], ["times", "times"], ["cdot", "dot"],
    ["div", "divide"], ["cup", "union"], ["cap", "intersection"],
    ["null", "empty-set"], ["infty", "infinity"],
    ["and", "logical-and"], ["or", "logical-or"], ["e", "e"],
    ["pi", "pi"], ["sin", "sin"], ["cos", "cos"], ["tan", "tan"],
    ["csc", "csc"], ["sec", "sec"], ["cot", "cot"],
    ["asin", "asin"], ["acos", "acos"], ["atan", "atan"],
    ["acsc", "acsc"], ["asec", "asec"], ["acot", "acot"],
    ["ln", "ln"], ["log", "log"], ["logb", "log-base"],
    ["alpha", "alpha"], ["beta", "beta"], ["gamma", "gamma"],
    ["theta", "theta"], ["phi", "phi"], ["lambda", "lambda"],
    ["sinh", "sinh"], ["cosh", "cosh"], ["tanh", "tanh"],
    ["csch", "csch"], ["sech", "sech"], ["coth", "coth"]
  ]);
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let settings = { ...DEFAULTS };
  let effectiveEnabled = false;
  let storageReady = false;
  let hasLoaded = false;
  let lifecycleHandler = () => {};
  let rootStateObserver;
  let systemThemeListenerStarted = false;

  function registerIconResources() {
    const siteLogoUrl = chrome.runtime.getURL("icons/icon.svg");
    const exitIconUrl = chrome.runtime.getURL("icons/exit.svg");
    const progressChevronIconUrl = chrome.runtime.getURL("icons/progress-chevron.svg");
    root.style.setProperty("--mag-site-logo-icon", `url("${siteLogoUrl}")`);
    root.style.setProperty("--mag-exit-icon", `url("${exitIconUrl}")`);
    root.style.setProperty(
      "--mag-progress-chevron-icon",
      `url("${progressChevronIconUrl}")`
    );
    for (const [iconClass, fileName] of MATH_TOOLBOX_ICONS) {
      const iconUrl = chrome.runtime.getURL(`icons/math-${fileName}.svg`);
      root.style.setProperty(`--mag-math-${iconClass}-icon`, `url("${iconUrl}")`);
    }

    for (const league of LEAGUE_NAMES) {
      const iconUrl = chrome.runtime.getURL(`icons/leagues/${league}.svg`);
      root.style.setProperty(`--mag-league-${league}-icon`, `url("${iconUrl}")`);
    }

    const completedCheckmarkUrl = chrome.runtime.getURL("icons/completed-checkmark.svg");
    root.style.setProperty(
      "--mag-completed-checkmark-icon",
      `url("${completedCheckmarkUrl}")`
    );

    const unlockedUrl = chrome.runtime.getURL("icons/unlocked.svg");
    root.style.setProperty("--mag-unlocked-icon", `url("${unlockedUrl}")`);

    const promotionArrowUrl = chrome.runtime.getURL("icons/promotion-arrow.svg");
    const demotionArrowUrl = chrome.runtime.getURL("icons/demotion-arrow.svg");
    root.style.setProperty("--mag-promotion-arrow-icon", `url("${promotionArrowUrl}")`);
    root.style.setProperty("--mag-demotion-arrow-icon", `url("${demotionArrowUrl}")`);
  }

  function resolveTheme(theme) {
    if (theme === "dark" || theme === "light") return theme;
    return systemTheme.matches ? "dark" : "light";
  }

  function normalizeSettings(value) {
    return {
      enabled:
        typeof value?.enabled === "boolean"
          ? value.enabled
          : DEFAULTS.enabled,
      theme:
        value?.theme === "light" ||
        value?.theme === "dark" ||
        value?.theme === "system"
          ? value.theme
          : DEFAULTS.theme
    };
  }

  function applySettings(nextSettings, announce = false) {
    settings = normalizeSettings(nextSettings);
    const resolvedTheme = resolveTheme(settings.theme);
    const wasEnabled = effectiveEnabled;
    effectiveEnabled = Boolean(storageReady && settings.enabled);

    root.dataset.maGlassEnabled = String(effectiveEnabled);
    root.dataset.maGlassMode = settings.theme;
    root.dataset.maGlassTheme = resolvedTheme;
    root.style.colorScheme = effectiveEnabled ? resolvedTheme : "";

    lifecycleHandler(Object.freeze({
      enabled: effectiveEnabled,
      resolvedTheme,
      wasEnabled
    }));

    if (announce && effectiveEnabled) {
      showThemeToast(resolvedTheme);
    }
  }

  function enforceRootState() {
    const expectedEnabled = String(effectiveEnabled);
    const expectedReady = String(hasLoaded);

    if (root.dataset.maGlassEnabled !== expectedEnabled) {
      root.dataset.maGlassEnabled = expectedEnabled;
    }
    if (root.dataset.maGlassReady !== expectedReady) {
      root.dataset.maGlassReady = expectedReady;
    }
  }

  function showThemeToast(theme) {
    if (!document.body) return;

    const existing = document.getElementById("ma-glass-toast-host");
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = "ma-glass-toast-host";
    host.setAttribute("aria-live", "polite");
    const shadow = host.attachShadow({ mode: "closed" });
    const toast = document.createElement("div");
    const icon = theme === "dark" ? "☾" : "☀";

    toast.textContent = `${icon} ${theme === "dark" ? "Dark" : "Light"} appearance`;
    toast.setAttribute("role", "status");
    toast.style.cssText = `
      position: fixed;
      right: max(18px, env(safe-area-inset-right, 0px));
      bottom: max(84px, calc(68px + env(safe-area-inset-bottom, 0px)));
      z-index: 2147483647;
      padding: 11px 15px;
      border: 1px solid ${theme === "dark" ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.88)"};
      border-radius: 14px;
      background: ${theme === "dark" ? "rgba(27,31,43,.78)" : "rgba(255,255,255,.76)"};
      color: ${theme === "dark" ? "#f5f7ff" : "#172036"};
      box-shadow: 0 16px 46px rgba(20,29,48,.2), inset 0 1px rgba(255,255,255,.34);
      backdrop-filter: blur(22px) saturate(150%);
      -webkit-backdrop-filter: blur(22px) saturate(150%);
      font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif;
      letter-spacing: -.01em;
      animation: maToastIn .2s ease-out both;
    `;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes maToastIn {
        from { opacity: 0; transform: translateY(8px) scale(.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        div { animation: none !important; }
      }
    `;

    shadow.append(style, toast);
    document.body.append(host);
    window.setTimeout(() => host.remove(), 1800);
  }

  function setLifecycleHandler(handler) {
    lifecycleHandler = typeof handler === "function" ? handler : () => {};
  }

  function finishLoading() {
    storageReady = true;
    applySettings(settings);
    hasLoaded = true;
    root.dataset.maGlassReady = "true";
  }

  function startRootStateObserver() {
    if (rootStateObserver) return;
    rootStateObserver = new MutationObserver(enforceRootState);
    rootStateObserver.observe(root, {
      attributes: true,
      attributeFilter: [
        "data-ma-glass-enabled",
        "data-ma-glass-ready"
      ]
    });
  }

  function startSystemThemeListener() {
    if (systemThemeListenerStarted) return;
    systemThemeListenerStarted = true;
    systemTheme.addEventListener("change", () => {
      if (settings.theme === "system") applySettings(settings, false);
    });
  }

  namespace.register("appearance", {
    applySettings,
    finishLoading,
    getDefaults: () => Object.freeze({ ...DEFAULTS }),
    getLeagueNames: () => LEAGUE_NAMES,
    getSettings: () => Object.freeze({ ...settings }),
    isEnabled: () => effectiveEnabled,
    isLoaded: () => hasLoaded,
    registerIconResources,
    resolveTheme,
    setLifecycleHandler,
    startRootStateObserver,
    startSystemThemeListener
  });
})();
