(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("taskTimer")) return;

  const appearance = namespace.require("appearance");
  const context = namespace.require("context");
  const extensionState = namespace.require("extensionState");
  const TASK_DURATION_ID = "ma-task-elapsed-time";
  const TASK_LIVE_TIMER_ID = "ma-task-live-timer";
  const TASK_TIMER_MAX_AGE = 12 * 60 * 60 * 1000;
  let liveTaskTimerInterval;

  function getCurrentTaskId() {
    return location.pathname.match(/^\/tasks\/(\d+)(?:\/|$)/)?.[1] || null;
  }

  function clearStoredTaskTimer() {
    stopLiveTaskTimer();
    extensionState.clearStoredTaskTimerState();
  }

  function readStoredTaskTimer() {
    const timer = extensionState.getStoredTaskTimer();
    if (!timer) return null;

    const startedAt = Number(timer?.startedAt);
    const finishedAt = timer?.finishedAt === null || timer?.finishedAt === undefined
      ? null
      : Number(timer.finishedAt);
    const end = finishedAt ?? Date.now();
    const isValid = Number.isSafeInteger(startedAt) &&
      (finishedAt === null || Number.isSafeInteger(finishedAt)) &&
      startedAt <= end &&
      Date.now() - startedAt <= TASK_TIMER_MAX_AGE;

    if (!isValid) {
      clearStoredTaskTimer();
      return null;
    }
    const taskId = typeof timer.taskId === "string" ? timer.taskId : null;
    return { taskId, startedAt, finishedAt };
  }

  function writeStoredTaskTimer(timer) {
    extensionState.setStoredTaskTimer(timer);
  }

  function startTaskTimer(restart = false) {
    if (!appearance.isEnabled() || !extensionState.isTabStateLoaded()) return null;
    const existing = readStoredTaskTimer();
    if (!restart && existing && existing.finishedAt === null) return existing;

    const timer = {
      taskId: getCurrentTaskId(),
      startedAt: Date.now(),
      finishedAt: null
    };
    writeStoredTaskTimer(timer);
    return timer;
  }

  function finishTaskTimer() {
    const timer = readStoredTaskTimer();
    if (!timer) return null;
    const currentTaskId = getCurrentTaskId();
    if (timer.taskId && currentTaskId && timer.taskId !== currentTaskId) {
      clearStoredTaskTimer();
      return null;
    }
    if (timer.finishedAt === null) {
      timer.finishedAt = Date.now();
      writeStoredTaskTimer(timer);
    }
    stopLiveTaskTimer();
    return timer;
  }

  function formatTaskDuration(elapsedMs) {
    const totalSeconds = Math.max(1, Math.round(elapsedMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours} hr${minutes > 0 ? ` ${minutes} min` : ""}`;
    }
    if (minutes > 0) return `${minutes} min ${seconds} sec`;
    return `${seconds} sec`;
  }

  function formatLiveTaskDuration(elapsedMs) {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");

    return hours > 0
      ? `${hours}:${paddedMinutes}:${paddedSeconds}`
      : `${paddedMinutes}:${paddedSeconds}`;
  }

  function stopLiveTaskTimer() {
    if (liveTaskTimerInterval !== undefined) {
      window.clearInterval(liveTaskTimerInterval);
      liveTaskTimerInterval = undefined;
    }
    document.getElementById(TASK_LIVE_TIMER_ID)?.remove();
  }

  function createLiveTaskTimer() {
    const liveTimer = document.createElement("span");
    liveTimer.id = TASK_LIVE_TIMER_ID;
    liveTimer.setAttribute("role", "timer");
    liveTimer.hidden = !appearance.isEnabled();

    const icon = document.createElement("span");
    icon.className = "ma-task-live-timer-icon";
    icon.setAttribute("aria-hidden", "true");
    const value = document.createElement("span");
    value.className = "ma-task-live-timer-value";
    value.textContent = "00:00";
    liveTimer.append(icon, value);
    return liveTimer;
  }

  function updateLiveTaskTimer(timer = readStoredTaskTimer()) {
    const progressBar = document.getElementById("progressBar");
    const header = progressBar?.closest("#header");
    const finalScreen = document.getElementById("finalScreen");
    const currentTaskId = getCurrentTaskId();
    const isDifferentTask = Boolean(
      timer?.taskId && currentTaskId && timer.taskId !== currentTaskId
    );

    if (
      !timer ||
      timer.finishedAt !== null ||
      !progressBar ||
      !header ||
      isDifferentTask ||
      (finalScreen && context.isVisibleControl(finalScreen))
    ) {
      stopLiveTaskTimer();
      return null;
    }

    let liveTimer = document.getElementById(TASK_LIVE_TIMER_ID);
    if (!liveTimer || liveTimer.parentElement !== header) {
      liveTimer?.remove();
      liveTimer = createLiveTaskTimer();
      header.insertBefore(liveTimer, progressBar);
    }

    const formattedDuration = formatLiveTaskDuration(Date.now() - timer.startedAt);
    const value = liveTimer.querySelector(".ma-task-live-timer-value");
    if (value.textContent !== formattedDuration) {
      if (value.firstChild) {
        value.firstChild.nodeValue = formattedDuration;
      } else {
        value.textContent = formattedDuration;
      }
    }
    liveTimer.hidden = !appearance.isEnabled();
    liveTimer.setAttribute("aria-label", `Elapsed time ${formattedDuration}`);

    if (liveTaskTimerInterval === undefined) {
      liveTaskTimerInterval = window.setInterval(updateLiveTaskTimer, 1000);
    }
    return liveTimer;
  }

  function createTaskDurationElement() {
    const duration = document.createElement("span");
    duration.id = TASK_DURATION_ID;
    duration.dataset.maTaskCompletionRole = "duration";
    duration.hidden = !appearance.isEnabled();

    const icon = document.createElement("span");
    icon.className = "ma-task-duration-icon";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "ma-task-duration-label";
    label.textContent = "Time";
    const value = document.createElement("strong");
    value.className = "ma-task-duration-value";
    duration.append(icon, label, value);
    return duration;
  }

  function updateTaskDuration(summary) {
    const timer = finishTaskTimer();
    let duration = document.getElementById(TASK_DURATION_ID);
    if (!timer) {
      duration?.remove();
      return null;
    }

    if (!duration || duration.parentElement !== summary) {
      duration?.remove();
      duration = createTaskDurationElement();
      summary.append(duration);
    }

    const elapsedMs = Math.max(0, timer.finishedAt - timer.startedAt);
    const formattedDuration = formatTaskDuration(elapsedMs);
    const value = duration.querySelector(".ma-task-duration-value");
    if (value.textContent !== formattedDuration) value.textContent = formattedDuration;
    duration.hidden = !appearance.isEnabled();
    duration.setAttribute("aria-label", `Task completed in ${formattedDuration}`);
    return duration;
  }
  function syncTaskTimer() {
    if (!context.isLearnPage() || !document.body) return;

    const finalScreen = document.getElementById("finalScreen");
    if (finalScreen && context.isVisibleControl(finalScreen)) {
      stopLiveTaskTimer();
      return;
    }

    const startButton = document.getElementById("startButton");
    const isWaitingToStart = Boolean(startButton && context.isVisibleControl(startButton));
    const currentTaskId = getCurrentTaskId();
    const hasActiveTask = !isWaitingToStart && Boolean(
      currentTaskId || document.querySelector(
        "#steps > .step, .questionWidget, #progressBar"
      )
    );
    const timer = readStoredTaskTimer();
    const isDifferentTask = Boolean(
      timer?.taskId && currentTaskId && timer.taskId !== currentTaskId
    );

    if (hasActiveTask) {
      let activeTimer = timer;
      if (!timer || timer.finishedAt !== null || isDifferentTask) {
        activeTimer = startTaskTimer(true);
      }
      updateLiveTaskTimer(activeTimer);
      return;
    }

    if (document.readyState === "complete" && !isWaitingToStart && timer) {
      clearStoredTaskTimer();
    } else {
      stopLiveTaskTimer();
    }
  }

  function setEnabled(enabled) {
    const duration = document.getElementById(TASK_DURATION_ID);
    if (duration) duration.hidden = !enabled;
    const liveTimer = document.getElementById(TASK_LIVE_TIMER_ID);
    if (liveTimer) liveTimer.hidden = !enabled;
    if (!enabled) stopLiveTaskTimer();
  }

  namespace.register("taskTimer", {
    clearStoredTaskTimer,
    finishTaskTimer,
    readStoredTaskTimer,
    setEnabled,
    startTaskTimer,
    stopLiveTaskTimer,
    syncTaskTimer,
    updateTaskDuration,
    updateLiveTaskTimer,
    writeStoredTaskTimer
  });
})();

