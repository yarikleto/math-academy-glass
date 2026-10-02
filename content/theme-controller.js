(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("controller")) return;

  const appearance = namespace.require("appearance");
  const cardExport = namespace.require("cardExport");
  const context = namespace.require("context");
  const courseProgress = namespace.require("courseProgress");
  const dailyGoal = namespace.require("dailyGoal");
  const dashboard = namespace.require("dashboard");
  const extensionState = namespace.require("extensionState");
  const mathEditor = namespace.require("mathEditor");
  const taskCompletion = namespace.require("taskCompletion");
  const taskTimer = namespace.require("taskTimer");
  const root = context.getRoot();
  let preferencesLoaded = false;
  let pendingPreferenceChanges = {};

  root.dataset.maGlassController = "1.24";
  namespace.register("controller", { version: "1.24" });

  function handleAppearanceLifecycle({ enabled, wasEnabled }) {
    cardExport.setEnabled(enabled);
    taskCompletion.setEnabled(enabled);
    courseProgress.setEnabled(enabled);
    taskTimer.setEnabled(enabled);

    if (!enabled) {
      dailyGoal.watchDailyGoal(null);
      mathEditor.scheduleMathToolboxPosition();
    } else if (!wasEnabled && document.body) {
      dashboard.scheduleDashboardScan();
    }
  }

  function handleTabStateLoaded() {
    if (appearance.isLoaded() && appearance.isEnabled() && document.body) {
      dashboard.scheduleDashboardScan();
    }
  }

  function finishLoading() {
    if (!preferencesLoaded) return;
    appearance.finishLoading();
  }

  function loadPreferences() {
    let settled = false;
    const settle = (stored) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      // A popup change can arrive while the initial read is in flight. Replay
      // those newer fields over the read snapshot, including removed settings.
      appearance.applySettings({
        ...(stored || appearance.getSettings()),
        ...pendingPreferenceChanges
      });
      pendingPreferenceChanges = {};
      preferencesLoaded = true;
      finishLoading();
    };
    const timeoutId = window.setTimeout(
      () => settle(null),
      context.extensionRequestTimeout
    );
    const result = extensionState.runExtensionOperation(() => {
      chrome.storage.sync.get(appearance.getDefaults(), (stored) => {
        const error = extensionState.readRuntimeLastError();
        settle(error ? null : stored);
      });
    });
    if (!result.ok) settle(null);
  }

  function isEditingShortcutTarget(event) {
    return event.composedPath().some((target) => (
      target instanceof Element &&
      (target.isContentEditable ||
        target.matches("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
    ));
  }

  appearance.setLifecycleHandler(handleAppearanceLifecycle);
  courseProgress.setDayRolloverHandler(dashboard.scheduleDashboardScan);

  // Resolve appearance immediately, then enable it as soon as synced settings
  // have loaded.
  appearance.registerIconResources();
  appearance.applySettings(appearance.getDefaults());
  mathEditor.startMathEditorEnhancer();
  extensionState.clearLegacyHostSessionData();
  extensionState.loadTabState(handleTabStateLoaded);

  // This release intentionally keeps no data in extension-local storage.
  // Clear values left by earlier versions while preserving synced appearance
  // preferences and extension-owned, tab-scoped session data.
  extensionState.runExtensionOperation(() => {
    chrome.storage.local.clear(() => {
      extensionState.readRuntimeLastError();
    });
  });

  appearance.startRootStateObserver();

  extensionState.runExtensionOperation(() => {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;
      if (!changes.enabled && !changes.theme) return;
      const patch = {
        ...(changes.enabled ? { enabled: changes.enabled.newValue } : null),
        ...(changes.theme ? { theme: changes.theme.newValue } : null)
      };
      if (!preferencesLoaded) {
        Object.assign(pendingPreferenceChanges, patch);
        return;
      }
      appearance.applySettings(
        {
          ...appearance.getSettings(),
          ...patch
        },
        appearance.isLoaded() && Boolean(changes.theme)
      );
    });
  });

  loadPreferences();
  appearance.startSystemThemeListener();

  // A quick in-page shortcut: Cmd/Ctrl + Shift + L toggles light and dark.
  document.addEventListener("keydown", (event) => {
    const hasSinglePrimaryModifier = event.metaKey !== event.ctrlKey;
    if (
      !event.isTrusted ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      !hasSinglePrimaryModifier ||
      !event.shiftKey ||
      event.code !== "KeyL" ||
      isEditingShortcutTarget(event)
    ) {
      return;
    }
    event.preventDefault();
    const settings = appearance.getSettings();
    const nextTheme = appearance.resolveTheme(settings.theme) === "dark"
      ? "light"
      : "dark";
    extensionState.runExtensionOperation(() => {
      chrome.storage.sync.set({ theme: nextTheme }, () => {
        extensionState.readRuntimeLastError();
      });
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.isTrusted || !appearance.isEnabled()) return;
    const target = event.target instanceof Element
      ? event.target.closest("#startButton")
      : null;
    if (!target || !context.isLearnPage()) return;
    taskTimer.startTaskTimer(true);
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      dashboard.startDashboardEnhancer,
      { once: true }
    );
  } else {
    dashboard.startDashboardEnhancer();
  }
})();
