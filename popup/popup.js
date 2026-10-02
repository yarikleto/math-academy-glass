(() => {
  "use strict";

  const DEFAULTS = Object.freeze({ enabled: true, theme: "system" });
  const STORAGE_OPERATION_TIMEOUT = 1500;
  const validThemes = new Set(["light", "system", "dark"]);
  const labels = Object.freeze({ light: "Light", system: "System", dark: "Dark" });
  const hints = Object.freeze({
    light: "Uses a bright, translucent workspace.",
    system: "Matches your Mac or Windows appearance.",
    dark: "Uses a deep, low-glare workspace."
  });

  const query = new URLSearchParams(globalThis.location?.search || "");
  const requestedTheme = query.get("theme");
  const previewTheme = requestedTheme === "light" || requestedTheme === "dark"
    ? requestedTheme
    : null;
  const popupWindow = document.querySelector(".window");
  const appearanceControls = document.getElementById("appearance-controls");
  const enabledInput = document.getElementById("enabled");
  const modeLabel = document.getElementById("mode-label");
  const themeHint = document.getElementById("theme-hint");
  const statusText = document.getElementById("status-text");
  const segments = [...document.querySelectorAll("[data-theme]")];
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const syncedStorage = globalThis.chrome?.storage?.sync;

  let phase = "loading";
  let confirmedSettings = { ...DEFAULTS };
  let draftSettings = { ...DEFAULTS };
  let bufferedStorageChanges = [];
  let activeOperation = null;
  let operationToken = 0;
  let focusedControl = null;

  function resolveTheme(theme) {
    if (theme === "dark" || theme === "light") return theme;
    return systemThemeQuery.matches ? "dark" : "light";
  }

  function setPopupTheme(theme) {
    document.documentElement.dataset.maGlassPopupTheme =
      previewTheme || resolveTheme(theme);
  }

  function normalizeSettings(settings) {
    return {
      enabled:
        typeof settings?.enabled === "boolean"
          ? settings.enabled
          : DEFAULTS.enabled,
      theme: validThemes.has(settings?.theme) ? settings.theme : DEFAULTS.theme
    };
  }

  function normalizeUserPatch(update) {
    const patch = {};
    if (Object.hasOwn(update, "enabled") && typeof update.enabled === "boolean") {
      patch.enabled = update.enabled;
    }
    if (Object.hasOwn(update, "theme") && validThemes.has(update.theme)) {
      patch.theme = update.theme;
    }
    return patch;
  }

  function getStoragePatch(changes) {
    const patch = {};
    if (changes.enabled) {
      patch.enabled = typeof changes.enabled.newValue === "boolean"
        ? changes.enabled.newValue
        : DEFAULTS.enabled;
    }
    if (changes.theme) {
      patch.theme = validThemes.has(changes.theme.newValue)
        ? changes.theme.newValue
        : DEFAULTS.theme;
    }
    return patch;
  }

  function mergeSettings(settings, patch) {
    return normalizeSettings({ ...settings, ...patch });
  }

  function hasRuntimeError() {
    try {
      return Boolean(globalThis.chrome?.runtime?.lastError);
    } catch (_error) {
      return true;
    }
  }

  function renderSettings(settings) {
    const nextSettings = normalizeSettings(settings);
    if (previewTheme) nextSettings.theme = previewTheme;
    draftSettings = nextSettings;
    setPopupTheme(nextSettings.theme);
    enabledInput.checked = nextSettings.enabled;
    modeLabel.textContent = labels[nextSettings.theme] ?? labels.system;
    themeHint.textContent = hints[nextSettings.theme] ?? hints.system;
    document.body.classList.toggle("is-paused", !nextSettings.enabled);

    for (const segment of segments) {
      const selected = segment.dataset.theme === nextSettings.theme;
      segment.classList.toggle("selected", selected);
      segment.setAttribute("aria-checked", String(selected));
      segment.tabIndex = selected ? 0 : -1;
    }
  }

  function setInteractive(interactive) {
    enabledInput.disabled = !interactive;
    for (const segment of segments) segment.disabled = !interactive;
    appearanceControls.classList.toggle("disabled", !interactive);
  }

  function setBusy(busy) {
    popupWindow.setAttribute("aria-busy", String(busy));
  }

  function setStatus(message, state = "ready") {
    statusText.textContent = message;
    document.body.classList.toggle("is-saving", state === "saving");
    document.body.classList.toggle("is-error", state === "error");
  }

  function getSettingsStatus(settings = draftSettings) {
    return settings.enabled ? "Theme and tools active" : "Extension is paused";
  }

  function enterPhase(nextPhase, message = null) {
    phase = nextPhase;
    const busy = nextPhase === "loading" || nextPhase === "saving";
    const interactive = nextPhase === "ready" || nextPhase === "save-error";
    setBusy(busy);
    setInteractive(interactive);

    if (message) {
      const statusState = nextPhase === "saving"
        ? "saving"
        : nextPhase.endsWith("error")
          ? "error"
          : "ready";
      setStatus(message, statusState);
    } else {
      setStatus(getSettingsStatus());
    }
  }

  function rememberFocusedControl() {
    focusedControl = appearanceControls.contains(document.activeElement)
      ? document.activeElement
      : null;
  }

  function restoreFocusedControl() {
    const target = focusedControl;
    focusedControl = null;
    window.setTimeout(() => {
      if (target?.isConnected && !target.disabled) target.focus();
    }, 0);
  }

  function beginOperation(kind, onTimeout) {
    operationToken += 1;
    const token = operationToken;
    const timeoutId = window.setTimeout(() => {
      if (!claimOperation(token)) return;
      onTimeout();
    }, STORAGE_OPERATION_TIMEOUT);
    activeOperation = { kind, timeoutId, token };
    return token;
  }

  function claimOperation(token) {
    if (activeOperation?.token !== token) return false;
    window.clearTimeout(activeOperation.timeoutId);
    activeOperation = null;
    return true;
  }

  function replayBufferedChanges(baseSettings) {
    let nextSettings = baseSettings;
    for (const patch of bufferedStorageChanges) {
      nextSettings = mergeSettings(nextSettings, patch);
    }
    bufferedStorageChanges = [];
    return nextSettings;
  }

  function finishLoad(token, storedSettings, failed) {
    if (!claimOperation(token)) return;
    if (failed) {
      bufferedStorageChanges = [];
      renderSettings(DEFAULTS);
      enterPhase("load-error", "Couldn’t load settings. Reopen to retry.");
      return;
    }

    confirmedSettings = replayBufferedChanges(normalizeSettings(storedSettings));
    renderSettings(confirmedSettings);
    enterPhase("ready");
  }

  function loadSettings() {
    if (!syncedStorage) {
      renderSettings(DEFAULTS);
      enterPhase("load-error", "Settings are unavailable.");
      return;
    }

    const token = beginOperation("load", () => {
      bufferedStorageChanges = [];
      renderSettings(DEFAULTS);
      enterPhase("load-error", "Couldn’t load settings. Reopen to retry.");
    });

    try {
      syncedStorage.get(DEFAULTS, (storedSettings) => {
        finishLoad(token, storedSettings, hasRuntimeError());
      });
    } catch (_error) {
      finishLoad(token, null, true);
    }
  }

  function finishSave(token, patch, failed) {
    if (!claimOperation(token)) return;

    if (failed) {
      confirmedSettings = replayBufferedChanges(confirmedSettings);
      renderSettings(confirmedSettings);
      enterPhase("save-error", "Couldn’t save settings. Try again.");
      restoreFocusedControl();
      return;
    }

    confirmedSettings = replayBufferedChanges(
      mergeSettings(confirmedSettings, patch)
    );
    renderSettings(confirmedSettings);
    enterPhase("ready");
    restoreFocusedControl();
  }

  function saveSetting(update) {
    if (phase !== "ready" && phase !== "save-error") return;
    const patch = normalizeUserPatch(update);
    if (Object.keys(patch).length !== 1) return;

    if (previewTheme) {
      confirmedSettings = mergeSettings(confirmedSettings, patch);
      renderSettings(confirmedSettings);
      enterPhase("ready");
      return;
    }

    rememberFocusedControl();
    renderSettings(mergeSettings(confirmedSettings, patch));
    enterPhase("saving", "Saving settings…");
    const token = beginOperation("save", () => {
      confirmedSettings = replayBufferedChanges(confirmedSettings);
      renderSettings(confirmedSettings);
      enterPhase("save-error", "Couldn’t confirm saved settings. Try again.");
      restoreFocusedControl();
    });

    try {
      // Persist only the field changed by this gesture. This cannot overwrite
      // a concurrent pause/theme change made by another popup or the shortcut.
      syncedStorage.set(patch, () => {
        finishSave(token, patch, hasRuntimeError());
      });
    } catch (_error) {
      finishSave(token, patch, true);
    }
  }

  function handleStorageChange(changes, areaName) {
    if (previewTheme || areaName !== "sync") return;
    const patch = getStoragePatch(changes);
    if (Object.keys(patch).length === 0) return;

    if (phase === "loading" || phase === "saving") {
      bufferedStorageChanges.push(patch);
      return;
    }

    confirmedSettings = mergeSettings(confirmedSettings, patch);
    renderSettings(confirmedSettings);
    if (phase === "ready") setStatus(getSettingsStatus());
  }

  enabledInput.addEventListener("change", () => {
    saveSetting({ enabled: enabledInput.checked });
  });

  for (const segment of segments) {
    segment.addEventListener("click", () => {
      saveSetting({ theme: segment.dataset.theme });
    });

    segment.addEventListener("keydown", (event) => {
      const currentIndex = segments.indexOf(segment);
      let nextIndex = null;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % segments.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + segments.length) % segments.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = segments.length - 1;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      segments[nextIndex].focus();
      segments[nextIndex].click();
    });
  }

  systemThemeQuery.addEventListener("change", () => {
    if (!previewTheme && draftSettings.theme === "system") {
      setPopupTheme(draftSettings.theme);
    }
  });

  setPopupTheme(DEFAULTS.theme);
  renderSettings(DEFAULTS);
  enterPhase("loading", "Loading settings…");

  if (previewTheme) {
    confirmedSettings = normalizeSettings({ ...DEFAULTS, theme: previewTheme });
    renderSettings(confirmedSettings);
    enterPhase("ready");
  } else {
    try {
      globalThis.chrome?.storage?.onChanged?.addListener(handleStorageChange);
    } catch (_error) {
      renderSettings(DEFAULTS);
      enterPhase("load-error", "Settings are unavailable.");
    }
    if (phase === "loading") loadSettings();
  }
})();
