"use strict";

// Web Storage belongs to the host page when it is used from a content script.
// Keep short-lived learning state in extension-owned storage instead, partitioned
// by tab and available to content scripts only through this validated broker.
const STORAGE_KEY_PREFIX = "ma-glass-tab-state:";
const TASK_TIMER_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TOPIC_STATE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_TOPIC_STATES = 32;
const MAX_COURSE_KEY_LENGTH = 180;
const MAX_TASK_ID_LENGTH = 96;
const MAX_COUNTER_VALUE = 1_000_000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const tabQueues = new Map();
const closingTabs = new Set();

function getStorageKey(tabId) {
  return `${STORAGE_KEY_PREFIX}${tabId}`;
}

function isMathAcademyUrl(value) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "mathacademy.com" || url.hostname.endsWith(".mathacademy.com"))
    );
  } catch (_error) {
    return false;
  }
}

function getTrustedTabId(sender) {
  if (
    sender?.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !Number.isInteger(sender.tab?.id) ||
    !isMathAcademyUrl(sender.url)
  ) {
    return null;
  }

  return sender.tab.id;
}

function isSafeIntegerInRange(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isValidCourseKey(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_COURSE_KEY_LENGTH &&
    !BLOCKED_OBJECT_KEYS.has(value)
  );
}

function normalizeTaskTimer(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const taskId = value.taskId;
  const startedAt = value.startedAt;
  const finishedAt = value.finishedAt;

  if (
    (taskId !== null &&
      (typeof taskId !== "string" ||
        taskId.length === 0 ||
        taskId.length > MAX_TASK_ID_LENGTH)) ||
    !isSafeIntegerInRange(startedAt, 1, now + CLOCK_SKEW_TOLERANCE_MS) ||
    now - startedAt > TASK_TIMER_MAX_AGE_MS ||
    (finishedAt !== null &&
      (!isSafeIntegerInRange(finishedAt, startedAt, now + CLOCK_SKEW_TOLERANCE_MS)))
  ) {
    return null;
  }

  return { taskId, startedAt, finishedAt };
}

function normalizeTopicState(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const courseKey = value.courseKey;
  const integerFields = [
    "total",
    "barCompleted",
    "displayCompleted",
    "loadedLessonCount",
    "todayLessonCount"
  ];

  if (
    !isValidCourseKey(courseKey) ||
    typeof value.dayKey !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.dayKey) ||
    !isSafeIntegerInRange(value.updatedAt, 1, now + CLOCK_SKEW_TOLERANCE_MS) ||
    now - value.updatedAt > TOPIC_STATE_MAX_AGE_MS ||
    integerFields.some(
      (field) => !isSafeIntegerInRange(value[field], 0, MAX_COUNTER_VALUE)
    ) ||
    value.total < 1 ||
    value.barCompleted > value.total ||
    value.displayCompleted > value.total ||
    value.loadedLessonCount > value.total ||
    value.todayLessonCount > value.loadedLessonCount
  ) {
    return null;
  }

  return {
    courseKey,
    total: value.total,
    barCompleted: value.barCompleted,
    displayCompleted: value.displayCompleted,
    loadedLessonCount: value.loadedLessonCount,
    todayLessonCount: value.todayLessonCount,
    dayKey: value.dayKey,
    updatedAt: value.updatedAt
  };
}

function normalizeTabState(value, now = Date.now()) {
  const taskTimer = normalizeTaskTimer(value?.taskTimer, now);
  const newestTopicStateByCourse = new Map();

  if (value?.topicStates && typeof value.topicStates === "object") {
    for (const candidate of Object.values(value.topicStates)) {
      const normalized = normalizeTopicState(candidate, now);
      if (!normalized) continue;

      const existing = newestTopicStateByCourse.get(normalized.courseKey);
      if (!existing || normalized.updatedAt > existing.updatedAt) {
        newestTopicStateByCourse.set(normalized.courseKey, normalized);
      }
    }
  }

  const topicStates = [...newestTopicStateByCourse.values()];
  topicStates.sort((left, right) => right.updatedAt - left.updatedAt);

  const topics = Object.create(null);
  for (const topicState of topicStates.slice(0, MAX_TOPIC_STATES)) {
    topics[topicState.courseKey] = topicState;
  }

  return { taskTimer, topicStates: topics };
}

async function readTabState(tabId) {
  const key = getStorageKey(tabId);
  const result = await chrome.storage.session.get(key);
  const storedState = result[key];
  const state = normalizeTabState(storedState);

  // Persist the normalized form so expired or malformed values cannot linger.
  if (storedState !== undefined && JSON.stringify(storedState) !== JSON.stringify(state)) {
    await chrome.storage.session.set({ [key]: state });
  }
  return state;
}

async function writeTabState(tabId, update) {
  const key = getStorageKey(tabId);
  const current = await readTabState(tabId);
  const next = normalizeTabState(update(current));
  await chrome.storage.session.set({ [key]: next });
  return next;
}

function enqueueTabOperation(tabId, operation) {
  const previous = tabQueues.get(tabId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  tabQueues.set(tabId, current);

  const release = () => {
    if (tabQueues.get(tabId) === current) tabQueues.delete(tabId);
  };
  current.then(release, release);

  return current;
}

async function handleMessage(message, tabId) {
  switch (message?.type) {
    case "ma-glass:tab-state:load":
      return { ok: true, state: await readTabState(tabId) };

    case "ma-glass:tab-state:set-task": {
      const timer = normalizeTaskTimer(message.timer);
      if (!timer) return { ok: false };
      await writeTabState(tabId, (state) => ({ ...state, taskTimer: timer }));
      return { ok: true };
    }

    case "ma-glass:tab-state:clear-task":
      await writeTabState(tabId, (state) => ({ ...state, taskTimer: null }));
      return { ok: true };

    case "ma-glass:tab-state:set-topic": {
      const topicState = normalizeTopicState(message.topicState);
      if (!topicState) return { ok: false };
      await writeTabState(tabId, (state) => ({
        ...state,
        topicStates: {
          ...state.topicStates,
          [topicState.courseKey]: topicState
        }
      }));
      return { ok: true };
    }

    case "ma-glass:tab-state:remove-topic": {
      const courseKey = message.courseKey;
      if (!isValidCourseKey(courseKey)) {
        return { ok: false };
      }

      await writeTabState(tabId, (state) => {
        const topicStates = { ...state.topicStates };
        delete topicStates[courseKey];
        return { ...state, topicStates };
      });
      return { ok: true };
    }

    default:
      return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = getTrustedTabId(sender);
  if (tabId === null) return false;
  if (closingTabs.has(tabId)) {
    sendResponse({ ok: false });
    return false;
  }

  enqueueTabOperation(tabId, () => handleMessage(message, tabId))
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false }));
  return true;
});

function removeTabStateAfterPendingWrites(tabId) {
  // Reject messages as soon as Chrome reports the tab closed, then serialize
  // removal behind every write that was already accepted for that tab.
  closingTabs.add(tabId);
  void enqueueTabOperation(tabId, async () => {
    try {
      await chrome.storage.session.remove(getStorageKey(tabId));
    } catch (_error) {
      // Session storage is cleared by Chrome at browser/extension shutdown.
      // Keeping the tombstone prevents a failed cleanup from being recreated.
    }
  });
}

chrome.tabs.onRemoved.addListener(removeTabStateAfterPendingWrites);

chrome.tabs.onReplaced.addListener((_addedTabId, removedTabId) => {
  removeTabStateAfterPendingWrites(removedTabId);
});
