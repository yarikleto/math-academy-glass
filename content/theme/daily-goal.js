(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("dailyGoal")) return;

  const DAILY_GOAL_MESSAGES = Object.freeze({
    ready: "Your first XP starts the momentum",
    start: "Momentum is building",
    building: "Nice pace — keep it going",
    halfway: "Halfway there — stay in the flow",
    final: "Final push — the goal is close",
    goal: "Daily goal complete — amazing work"
  });
  let dailyGoalObserver;
  let observedDailyGoalFrame;

  function getDailyGoalPercent(frame) {
    if (!frame) return null;

    const points = frame.querySelector("#dailyGoalPoints")?.textContent
      .replaceAll(",", "")
      .match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (points) {
      const earned = Number(points[1]);
      const goal = Number(points[2]);
      if (Number.isFinite(earned) && Number.isFinite(goal) && goal > 0) {
        return (earned / goal) * 100;
      }
    }

    const bar = frame.querySelector(
      "#dailyGoalProgressBar, #dailyGoalProgressBarExceeded"
    );
    if (!bar) return null;
    if (bar.id === "dailyGoalProgressBarExceeded") return 100;

    const inlineWidth = bar.style.width.trim();
    if (inlineWidth.endsWith("%")) {
      const percent = Number.parseFloat(inlineWidth);
      if (Number.isFinite(percent)) return percent;
    }

    const track = frame.querySelector("#dailyGoalProgressBarFrame");
    const trackWidth = track?.getBoundingClientRect().width || 0;
    if (trackWidth > 0) {
      return (bar.getBoundingClientRect().width / trackWidth) * 100;
    }

    return null;
  }

  function annotateDailyGoal(frame = observedDailyGoalFrame) {
    if (!frame) return;
    const percent = getDailyGoalPercent(frame);
    if (!Number.isFinite(percent)) {
      delete frame.dataset.maDailyGoalStage;
      delete frame.dataset.maDailyGoalMessage;
      delete frame.dataset.maDailyGoalProgress;
      return;
    }

    const stage = percent >= 100
      ? "goal"
      : percent >= 75
        ? "final"
        : percent >= 50
          ? "halfway"
          : percent >= 25
            ? "building"
            : percent > 0
              ? "start"
              : "ready";
    const roundedPercent = Math.min(999, Math.max(0, Math.round(percent)));

    frame.dataset.maDailyGoalStage = stage;
    frame.dataset.maDailyGoalMessage = DAILY_GOAL_MESSAGES[stage];
    frame.dataset.maDailyGoalProgress = stage === "goal"
      ? `${roundedPercent}%`
      : `${roundedPercent}% complete`;
  }

  function watchDailyGoal(frame) {
    if (frame === observedDailyGoalFrame) return;
    dailyGoalObserver?.disconnect();
    observedDailyGoalFrame = frame || undefined;
    if (!observedDailyGoalFrame) return;

    if (!dailyGoalObserver) {
      dailyGoalObserver = new MutationObserver(() => annotateDailyGoal());
    }
    dailyGoalObserver.observe(observedDailyGoalFrame, {
      attributes: true,
      attributeFilter: ["style"],
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  namespace.register("dailyGoal", {
    annotateDailyGoal,
    getDailyGoalPercent,
    watchDailyGoal
  });
})();

