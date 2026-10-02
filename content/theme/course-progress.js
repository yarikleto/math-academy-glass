(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("courseProgress")) return;

  const appearance = namespace.require("appearance");
  const context = namespace.require("context");
  const extensionState = namespace.require("extensionState");
  const COURSE_TOPIC_TOTAL_ID = "ma-course-topic-total";
  const TOPIC_STATS_ID = "ma-course-topic-stats";
  const TOPIC_STATS_MAX_AGE = 36 * 60 * 60 * 1000;
  let currentCourseUnitsId;
  let dayRolloverHandler = () => {};
  let dayRolloverTimer;

  function getSelectedCourseUnits() {
    if (currentCourseUnitsId) {
      const currentUnits = document.getElementById(currentCourseUnitsId);
      if (currentUnits) return currentUnits;
      currentCourseUnitsId = undefined;
    }

    const selectedTab = document.querySelector(
      "#sequenceTabs .sequenceCourseTabSelected"
    );
    const courseId = selectedTab?.id.match(/-(\d+)$/)?.[1];
    if (courseId) {
      const selectedUnits = document.getElementById(`sequenceCourseUnits-${courseId}`);
      if (selectedUnits) {
        if (document.readyState === "complete") currentCourseUnitsId = selectedUnits.id;
        return selectedUnits;
      }
    }

    const visibleUnits = [...document.querySelectorAll(".sequenceCourseUnits")].find(
      (frame) => getComputedStyle(frame).display !== "none"
    ) || null;
    if (visibleUnits && document.readyState === "complete") {
      currentCourseUnitsId = visibleUnits.id;
    }
    return visibleUnits;
  }

  function getCourseTopicTotal(courseUnits) {
    let total = 0;
    for (const unit of courseUnits.querySelectorAll(".courseUnit")) {
      const count = unit.textContent.match(/\(([\d,]+)\s+topics?\)/i)?.[1];
      if (count) total += Number(count.replaceAll(",", ""));
    }
    return total;
  }

  function hasCompletedTopicColor(cell) {
    const paintedElements = [cell, ...cell.querySelectorAll("*")];
    return paintedElements.some((element) => {
      const color = context.parseColor(getComputedStyle(element).backgroundColor);
      if (!color || color.a < 0.15) return false;

      // Math Academy paints each completed topic with one of several blue
      // shades. Empty cells are transparent or nearly neutral gray.
      return color.b >= 125 && color.b - color.r >= 20 && color.b - color.g >= 4;
    });
  }

  function getCourseTopicProgress(courseUnits, total) {
    const cells = [
      ...courseUnits.querySelectorAll("table.courseUnitProgressBar td")
    ];
    const cellCount = cells.reduce((sum, cell) => sum + (cell.colSpan || 1), 0);
    const completedCells = cells.reduce(
      (sum, cell) => sum + (hasCompletedTopicColor(cell) ? cell.colSpan || 1 : 0),
      0
    );

    if (total > 0 && cellCount === total) return completedCells;

    const percent = Number.parseFloat(
      document.getElementById("coursePercentComplete")?.textContent
    );
    if (!Number.isFinite(percent) || total < 1) return null;
    return Math.round(total * Math.min(100, Math.max(0, percent)) / 100);
  }

  function annotateCourseProgress() {
    const indicator = document.getElementById("coursePercentComplete");
    if (!indicator) return;

    const percent = Number.parseFloat(indicator.textContent.replaceAll(",", ""));
    if (!Number.isFinite(percent)) {
      delete indicator.dataset.maCourseProgress;
      indicator.style.removeProperty("--mag-course-progress-angle");
      return;
    }

    const clampedPercent = Math.min(100, Math.max(0, percent));
    indicator.dataset.maCourseProgress = String(Math.round(clampedPercent));
    indicator.style.setProperty(
      "--mag-course-progress-angle",
      `${clampedPercent * 3.6}deg`
    );
  }

  function isToday(value) {
    const label = context.normalizeLabel(value);
    if (!label) return false;
    if (/\btoday\b/.test(label)) return true;
    if (/\byesterday\b/.test(label)) return false;

    const normalizedDate = label.replace(/(\d)(st|nd|rd|th)\b/g, "$1");
    const parsed = new Date(normalizedDate);
    if (Number.isNaN(parsed.getTime())) return false;

    const now = new Date();
    return parsed.getFullYear() === now.getFullYear() &&
      parsed.getMonth() === now.getMonth() &&
      parsed.getDate() === now.getDate();
  }

  function getCompletedTaskDate(task) {
    const storedDate = task.querySelector(".taskCompletedDate")?.value;
    if (storedDate) return storedDate;

    let sibling = task.previousElementSibling;
    while (sibling) {
      if (sibling.classList.contains("completedTasksDate")) {
        return sibling.textContent;
      }
      sibling = sibling.previousElementSibling;
    }
    return "";
  }

  function getLessonTopicKey(task) {
    const topicPath = task.querySelector("a.taskTopicLink")?.getAttribute("href") || "";
    const topicId = topicPath.match(/\/topics\/(\d+)/)?.[1];
    return topicId ? `topic-${topicId}` : task.id || null;
  }

  function getCompletedLessonStats() {
    const currentCourse = context.normalizeLabel(
      document.getElementById("courseNameLink")?.textContent
    );
    const loadedTopics = new Set();
    const todayTopics = new Set();

    for (const task of document.querySelectorAll("#completedTasks .taskCompleted")) {
      const taskType = context.normalizeLabel(
        task.querySelector(".taskTypeLocked2, .taskTypeLocked")?.textContent
      );
      if (taskType !== "lesson") continue;

      const taskCourse = context.normalizeLabel(
        task.querySelector(".taskCourseNameUnlocked, .taskCourseNameLocked")?.textContent
      );
      if (currentCourse && taskCourse && taskCourse !== currentCourse) continue;

      const topicKey = getLessonTopicKey(task);
      if (!topicKey) continue;
      loadedTopics.add(topicKey);
      if (isToday(getCompletedTaskDate(task))) todayTopics.add(topicKey);
    }

    return {
      loaded: loadedTopics.size,
      today: todayTopics.size
    };
  }

  function getLocalDayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function readCourseTopicStatsState(courseKey, total) {
    const cached = extensionState.getCourseTopicStatsState(courseKey);

    const isFresh = Number.isFinite(cached?.updatedAt) &&
      Date.now() - cached.updatedAt < TOPIC_STATS_MAX_AGE;
    const isValid = cached?.total === total && isFresh &&
      Number.isFinite(cached?.barCompleted) &&
      Number.isFinite(cached?.displayCompleted) &&
      Number.isFinite(cached?.loadedLessonCount) &&
      Number.isFinite(cached?.todayLessonCount);

    if (isValid) return cached;

    if (cached) extensionState.removeCourseTopicStatsState(courseKey);
    return null;
  }

  function writeCourseTopicStatsState(state) {
    extensionState.setCourseTopicStatsState(state);
  }

  function syncCompletedTopicCount(courseUnits, total, barCompleted, lessonStats) {
    const courseKey = courseUnits.id || context.normalizeLabel(
      document.getElementById("courseNameLink")?.textContent
    );
    const dayKey = getLocalDayKey();
    const previous = readCourseTopicStatsState(courseKey, total);
    let displayCompleted;

    if (!previous) {
      displayCompleted = Math.max(barCompleted, lessonStats.loaded);
    } else {
      const previousToday = previous.dayKey === dayKey
        ? previous.todayLessonCount
        : 0;
      const newToday = Math.max(0, lessonStats.today - previousToday);
      displayCompleted = Math.max(
        previous.displayCompleted,
        barCompleted,
        lessonStats.loaded
      );
      const reflectedLessons = Math.max(
        0,
        displayCompleted - previous.displayCompleted
      );
      displayCompleted += Math.max(0, newToday - reflectedLessons);
    }

    displayCompleted = Math.min(total, Math.max(0, displayCompleted));
    writeCourseTopicStatsState({
      courseKey,
      total,
      dayKey,
      barCompleted,
      displayCompleted,
      loadedLessonCount: lessonStats.loaded,
      todayLessonCount: lessonStats.today,
      updatedAt: Date.now()
    });
    return displayCompleted;
  }

  function createCourseTopicStats() {
    const stats = document.createElement("div");
    stats.id = TOPIC_STATS_ID;
    stats.setAttribute("role", "group");

    const labels = [
      ["completed", "Completed"],
      ["remaining", "Remaining"],
      ["today", "Today"]
    ];
    for (const [kind, label] of labels) {
      const item = document.createElement("div");
      item.className = "ma-course-topic-stat";
      item.dataset.kind = kind;

      const value = document.createElement("strong");
      value.className = "ma-course-topic-value";
      const caption = document.createElement("span");
      caption.textContent = label;
      item.append(value, caption);
      stats.append(item);
    }

    return stats;
  }

  function updateCourseTopicStats() {
    const courseFrame = document.getElementById("courseFrame");
    const courseHeader = document.getElementById("courseHeader");
    const courseUnits = getSelectedCourseUnits();
    const total = courseUnits ? getCourseTopicTotal(courseUnits) : 0;
    const barCompleted = courseUnits
      ? getCourseTopicProgress(courseUnits, total)
      : null;
    let stats = document.getElementById(TOPIC_STATS_ID);

    if (!courseFrame || !courseHeader || total < 1 || !Number.isFinite(barCompleted)) {
      stats?.remove();
      return;
    }

    if (!stats) {
      stats = createCourseTopicStats();
      courseHeader.insertAdjacentElement("afterend", stats);
    }

    const lessonStats = getCompletedLessonStats();
    const completed = syncCompletedTopicCount(
      courseUnits,
      total,
      barCompleted,
      lessonStats
    );
    const values = {
      completed,
      remaining: Math.max(0, total - completed),
      today: lessonStats.today
    };
    for (const [kind, value] of Object.entries(values)) {
      const valueElement = stats.querySelector(
        `[data-kind="${kind}"] .ma-course-topic-value`
      );
      const nextValue = value.toLocaleString();
      if (valueElement.textContent !== nextValue) valueElement.textContent = nextValue;
      stats.dataset[kind] = String(value);
    }

    stats.dataset.total = String(total);
    stats.hidden = !appearance.isEnabled();
    stats.setAttribute(
      "aria-label",
      `${values.completed} of ${total} topics completed, ` +
      `${values.remaining} remaining, ${values.today} completed today`
    );
  }

  function scheduleDayRollover() {
    if (dayRolloverTimer !== undefined) return;
    const nextDay = new Date();
    nextDay.setHours(24, 0, 0, 250);
    dayRolloverTimer = window.setTimeout(() => {
      dayRolloverTimer = undefined;
      dayRolloverHandler();
      scheduleDayRollover();
    }, nextDay.getTime() - Date.now());
  }

  function updatePublicCourseTopicTotal() {
    const courseHeader = document.querySelector("#courseNameHeader > section");
    const countElements = [
      ...document.querySelectorAll(
        "#contentFrame > section > .unit > .unitHeader > .unitNumTopics"
      )
    ];
    const unitCounts = countElements
      .map((element) => {
        const count = element.textContent.match(/[\d,]+/)?.[0];
        if (!count) return null;
        const value = Number(count.replaceAll(",", ""));
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
      })
      .filter((value) => value !== null);
    let summary = document.getElementById(COURSE_TOPIC_TOTAL_ID);

    if (!courseHeader || unitCounts.length < 1) {
      summary?.remove();
      return;
    }

    const total = unitCounts.reduce((sum, count) => sum + count, 0);
    if (total < 1) {
      summary?.remove();
      return;
    }

    if (!summary) {
      summary = document.createElement("div");
      summary.id = COURSE_TOPIC_TOTAL_ID;

      const value = document.createElement("strong");
      value.className = "ma-course-topic-total-value";
      const label = document.createElement("span");
      label.className = "ma-course-topic-total-label";
      summary.append(value, label);
      courseHeader.append(summary);
    }

    const formattedTotal = total.toLocaleString();
    const value = summary.querySelector(".ma-course-topic-total-value");
    const label = summary.querySelector(".ma-course-topic-total-label");
    const labelText = total === 1 ? "topic total" : "topics total";
    if (value.textContent !== formattedTotal) value.textContent = formattedTotal;
    if (label.textContent !== labelText) label.textContent = labelText;

    summary.dataset.total = String(total);
    summary.dataset.units = String(unitCounts.length);
    summary.hidden = !appearance.isEnabled();
    summary.setAttribute(
      "aria-label",
      `${formattedTotal} ${total === 1 ? "topic" : "topics"} across ` +
      `${unitCounts.length} ${unitCounts.length === 1 ? "unit" : "units"}`
    );
  }

  function setDayRolloverHandler(handler) {
    dayRolloverHandler = typeof handler === "function" ? handler : () => {};
  }

  function setEnabled(enabled) {
    const topicStats = document.getElementById(TOPIC_STATS_ID);
    if (topicStats) topicStats.hidden = !enabled;
    const courseTopicTotal = document.getElementById(COURSE_TOPIC_TOTAL_ID);
    if (courseTopicTotal) courseTopicTotal.hidden = !enabled;
  }

  namespace.register("courseProgress", {
    annotateCourseProgress,
    scheduleDayRollover,
    setDayRolloverHandler,
    setEnabled,
    updateCourseTopicStats,
    updatePublicCourseTopicTotal
  });
})();

