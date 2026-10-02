(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("extensionState")) return;

  const context = namespace.require("context");
  const root = context.getRoot();
  const LEGACY_TASK_TIMER_KEY = "ma-glass-task-timer-v1";
  const LEGACY_TOPIC_STATS_PREFIX = "ma-glass-topic-progress-v1:";
  let extensionContextInvalidated = false;
  let tabStateLoaded = false;
  let storedTaskTimer = null;
  const courseTopicStatsByCourse = new Map();

  function markExtensionContextInvalidated() {
    if (extensionContextInvalidated) return;
    extensionContextInvalidated = true;
  }

  function runExtensionOperation(operation) {
    if (extensionContextInvalidated) {
      return { ok: false, value: undefined };
    }
    try {
      return { ok: true, value: operation() };
    } catch (_error) {
      markExtensionContextInvalidated();
      return { ok: false, value: undefined };
    }
  }

  function readRuntimeLastError() {
    const result = runExtensionOperation(() => chrome.runtime.lastError);
    return result.ok
      ? result.value
      : { message: "Extension context invalidated." };
  }

  function sendTabStateMessage(message, onResponse = () => {}) {
    let settled = false;
    const settle = (response) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      onResponse(response);
    };
    const timeoutId = window.setTimeout(
      () => settle(null),
      context.extensionRequestTimeout
    );
    const result = runExtensionOperation(() => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = readRuntimeLastError();
        settle(error ? null : response);
      });
    });

    if (!result.ok) settle(null);
    return result.ok;
  }

  function persistTabStateMessage(message) {
    sendTabStateMessage(message, (response) => {
      root.dataset.maGlassSessionPersistence = response?.ok
        ? "available"
        : "memory-only";
    });
  }

  function hydrateTabState(value) {
    storedTaskTimer = value?.taskTimer && typeof value.taskTimer === "object"
      ? { ...value.taskTimer }
      : null;
    courseTopicStatsByCourse.clear();

    if (!value?.topicStates || typeof value.topicStates !== "object") return;
    for (const candidate of Object.values(value.topicStates)) {
      if (typeof candidate?.courseKey !== "string") continue;
      courseTopicStatsByCourse.set(candidate.courseKey, { ...candidate });
    }
  }

  function loadTabState(onLoaded = () => {}) {
    sendTabStateMessage({ type: "ma-glass:tab-state:load" }, (response) => {
      if (response?.ok) hydrateTabState(response.state);
      root.dataset.maGlassSessionPersistence = response?.ok
        ? "available"
        : "memory-only";
      tabStateLoaded = true;
      onLoaded();
    });
  }

  // Version 2.0.3 used the host page's Web Storage. Remove only the exact
  // legacy namespaces without reading their values. Delete this migration in
  // the next major release after active 2.0.3 tabs have had an upgrade cycle.
  function clearLegacyHostSessionData() {
    try {
      const storage = window.sessionStorage;
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (
          key === LEGACY_TASK_TIMER_KEY ||
          key?.startsWith(LEGACY_TOPIC_STATS_PREFIX)
        ) {
          storage.removeItem(key);
        }
      }
    } catch (_error) {
      // Storage can be unavailable under restrictive site/browser policies.
    }
  }

  function getStoredTaskTimer() {
    return storedTaskTimer ? { ...storedTaskTimer } : null;
  }

  function setStoredTaskTimer(timer) {
    storedTaskTimer = { ...timer };
    persistTabStateMessage({
      type: "ma-glass:tab-state:set-task",
      timer: storedTaskTimer
    });
  }

  function clearStoredTaskTimerState() {
    storedTaskTimer = null;
    persistTabStateMessage({ type: "ma-glass:tab-state:clear-task" });
  }

  function getCourseTopicStatsState(courseKey) {
    const state = courseTopicStatsByCourse.get(courseKey);
    return state ? { ...state } : null;
  }

  function setCourseTopicStatsState(state) {
    courseTopicStatsByCourse.set(state.courseKey, { ...state });
    persistTabStateMessage({
      type: "ma-glass:tab-state:set-topic",
      topicState: { ...state }
    });
  }

  function removeCourseTopicStatsState(courseKey) {
    courseTopicStatsByCourse.delete(courseKey);
    persistTabStateMessage({
      type: "ma-glass:tab-state:remove-topic",
      courseKey
    });
  }

  namespace.register("extensionState", {
    clearLegacyHostSessionData,
    clearStoredTaskTimerState,
    getCourseTopicStatsState,
    getStoredTaskTimer,
    isTabStateLoaded: () => tabStateLoaded,
    loadTabState,
    persistTabStateMessage,
    readRuntimeLastError,
    removeCourseTopicStatsState,
    runExtensionOperation,
    sendTabStateMessage,
    setCourseTopicStatsState,
    setStoredTaskTimer
  });
})();
