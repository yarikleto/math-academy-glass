(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("taskCompletion")) return;

  const appearance = namespace.require("appearance");
  const context = namespace.require("context");
  const taskTimer = namespace.require("taskTimer");
  const root = context.getRoot();
  const TASK_DURATION_ID = "ma-task-elapsed-time";
  let taskCompletionElements = [];
  let taskCompletionFireworks;

  function getTaskCompletionCopy(element) {
    return [...element.childNodes]
      .filter((node) => !(node instanceof Element && node.id === TASK_DURATION_ID))
      .map((node) => node.textContent)
      .join(" ");
  }
  function clearTaskCompletionAnnotation() {
    for (const element of taskCompletionElements) {
      delete element.dataset.maTaskCompletion;
      delete element.dataset.maTaskCompletionRole;
      delete element.dataset.maTaskKind;
      delete element.dataset.maTaskResult;
      delete element.dataset.maTaskQuestionsCorrect;
      delete element.dataset.maTaskQuestionsTotal;
      delete element.dataset.maTaskScore;
      delete element.dataset.maTaskXpEarned;
      delete element.dataset.maTaskXpTotal;
      delete element.dataset.maTaskXpBonus;
      delete element.dataset.maTaskRewardKind;
      element.style.removeProperty("--mag-task-xp-progress");
    }
    taskCompletionElements = [];
    document.getElementById(TASK_DURATION_ID)?.remove();
    taskCompletionFireworks?.remove();
    taskCompletionFireworks = undefined;
    delete root.dataset.maGlassTaskState;
  }

  function createTaskCompletionFireworks(frame) {
    if (taskCompletionFireworks?.isConnected && taskCompletionFireworks.parentElement === frame) {
      return;
    }

    taskCompletionFireworks?.remove();
    const fireworks = document.createElement("div");
    fireworks.id = "ma-task-completion-fireworks";
    fireworks.setAttribute("aria-hidden", "true");
    fireworks.hidden = !appearance.isEnabled();

    for (let burstIndex = 0; burstIndex < 3; burstIndex += 1) {
      const burst = document.createElement("span");
      burst.className = `ma-task-firework ma-task-firework-${burstIndex + 1}`;
      const burstDelay = 100 + burstIndex * 300;
      burst.style.setProperty("--mag-firework-delay", `${burstDelay}ms`);

      for (let particleIndex = 0; particleIndex < 10; particleIndex += 1) {
        const particle = document.createElement("i");
        particle.style.setProperty(
          "--mag-firework-angle",
          `${particleIndex * 36}deg`
        );
        particle.style.setProperty(
          "--mag-firework-particle-delay",
          `${burstDelay + particleIndex % 2 * 28}ms`
        );
        burst.append(particle);
      }
      fireworks.append(burst);
    }

    frame.prepend(fireworks);
    taskCompletionFireworks = fireworks;
  }

  function parseTaskCompletionReward(value) {
    const copy = value.replace(/\s+/g, " ").trim();
    const partialMatch = copy.match(
      /^you(?:'|’)?ve been awarded\s+([\d,]+)\s+of\s+the task(?:'|’)?s\s+([\d,]+)\s+xp\.?$/i
    );
    if (partialMatch) {
      const earned = Number(partialMatch[1].replaceAll(",", ""));
      const total = Number(partialMatch[2].replaceAll(",", ""));
      if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
        return { earned, total, bonus: 0, kind: "standard" };
      }
    }

    const fullMatch = copy.match(
      /^you(?:'|’)?ve been awarded all of the task(?:'|’)?s\s+([\d,]+)\s+xp(?:,\s*plus a bonus of\s+([\d,]+)\s+xp(?:\s+for answering (?:every question|the first three questions) correctly)?)?\.?$/i
    );
    if (!fullMatch) return null;

    const total = Number(fullMatch[1].replaceAll(",", ""));
    const bonus = Number((fullMatch[2] || "0").replaceAll(",", ""));
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(bonus)) {
      return null;
    }
    return {
      earned: total + bonus,
      total,
      bonus,
      kind: bonus > 0 ? "bonus" : "standard"
    };
  }

  function parseTaskCompletionTitle(value) {
    const copy = value.replace(/\s+/g, " ").trim();
    const completedMatch = copy.match(
      /^congratulations!\s+you(?:'|’)?ve completed the (lesson|review|quiz|test)\.?$/i
    );
    if (completedMatch) {
      return {
        kind: completedMatch[1].toLowerCase(),
        result: "completed"
      };
    }

    const scoreMatch = copy.match(
      /^congratulations!\s+you answered\s+([\d,]+)\s+of\s+([\d,]+)\s+questions?\s+correctly\s+for\s+a\s+score\s+of\s+(\d+(?:\.\d+)?)%\.?$/i
    );
    if (!scoreMatch) return null;

    const correct = Number(scoreMatch[1].replaceAll(",", ""));
    const total = Number(scoreMatch[2].replaceAll(",", ""));
    const score = Number(scoreMatch[3]);
    if (
      !Number.isFinite(correct) ||
      !Number.isFinite(total) ||
      !Number.isFinite(score) ||
      correct < 0 ||
      total <= 0 ||
      correct > total ||
      score < 0 ||
      score > 100
    ) {
      return null;
    }

    return {
      kind: "test",
      result: "score",
      correct,
      total,
      score
    };
  }

  function annotateTaskCompletion() {
    const frame = document.getElementById("finalScreen");
    const title = document.getElementById("finalScreen-completionMessage");
    const summary = document.getElementById("finalScreen-pointsMessage");
    const buttonBar = document.getElementById("finalScreen-buttonBar");
    const action = document.getElementById("finalScreen-doneButton");
    const titleCopy = title?.textContent.replace(/\s+/g, " ").trim() || "";
    const titleDetails = parseTaskCompletionTitle(titleCopy);
    const reward = summary
      ? parseTaskCompletionReward(getTaskCompletionCopy(summary))
      : null;

    if (
      !frame ||
      !title ||
      !summary ||
      !buttonBar ||
      !action ||
      !titleDetails ||
      !reward ||
      !context.isVisibleControl(frame)
    ) {
      clearTaskCompletionAnnotation();
      return;
    }

    const progress = Math.min(100, Math.max(0, reward.earned / reward.total * 100));
    const dividers = [...frame.querySelectorAll("hr")];
    const duration = taskTimer.updateTaskDuration(summary);
    const nextElements = [
      frame,
      title,
      summary,
      buttonBar,
      action,
      ...dividers,
      ...(duration ? [duration] : [])
    ];
    const nextElementSet = new Set(nextElements);

    // Exact completion styling owns this subtree. Clear compatibility-layer
    // annotations left by an earlier task state so ID-specific fallback rules
    // such as #steps cannot flatten the celebration card.
    for (const element of [
      frame,
      ...frame.querySelectorAll(
        "[data-ma-glass-surface], [data-ma-glass-subtle], [data-ma-glass-orb]"
      )
    ]) {
      delete element.dataset.maGlassSurface;
      delete element.dataset.maGlassSubtle;
      delete element.dataset.maGlassOrb;
    }

    for (const element of taskCompletionElements) {
      if (nextElementSet.has(element)) continue;
      delete element.dataset.maTaskCompletion;
      delete element.dataset.maTaskCompletionRole;
      delete element.dataset.maTaskKind;
      delete element.dataset.maTaskResult;
      delete element.dataset.maTaskQuestionsCorrect;
      delete element.dataset.maTaskQuestionsTotal;
      delete element.dataset.maTaskScore;
      delete element.dataset.maTaskXpEarned;
      delete element.dataset.maTaskXpTotal;
      delete element.dataset.maTaskXpBonus;
      delete element.dataset.maTaskRewardKind;
      element.style.removeProperty("--mag-task-xp-progress");
    }

    if (root.dataset.maGlassTaskState !== "complete") {
      root.dataset.maGlassTaskState = "complete";
    }
    const frameKind = frame === document.body ? "page" : "frame";
    if (frame.dataset.maTaskCompletion !== frameKind) {
      frame.dataset.maTaskCompletion = frameKind;
    }
    if (frame.dataset.maTaskKind !== titleDetails.kind) {
      frame.dataset.maTaskKind = titleDetails.kind;
    }
    for (const element of [frame, title]) {
      if (element.dataset.maTaskResult !== titleDetails.result) {
        element.dataset.maTaskResult = titleDetails.result;
      }
      if (titleDetails.result === "score") {
        element.dataset.maTaskQuestionsCorrect = String(titleDetails.correct);
        element.dataset.maTaskQuestionsTotal = String(titleDetails.total);
        element.dataset.maTaskScore = String(titleDetails.score);
      } else {
        delete element.dataset.maTaskQuestionsCorrect;
        delete element.dataset.maTaskQuestionsTotal;
        delete element.dataset.maTaskScore;
      }
    }
    if (title.dataset.maTaskCompletionRole !== "title") {
      title.dataset.maTaskCompletionRole = "title";
    }
    if (summary.dataset.maTaskCompletionRole !== "reward") {
      summary.dataset.maTaskCompletionRole = "reward";
    }
    if (summary.dataset.maTaskXpEarned !== String(reward.earned)) {
      summary.dataset.maTaskXpEarned = String(reward.earned);
    }
    if (summary.dataset.maTaskXpTotal !== String(reward.total)) {
      summary.dataset.maTaskXpTotal = String(reward.total);
    }
    if (summary.dataset.maTaskXpBonus !== String(reward.bonus)) {
      summary.dataset.maTaskXpBonus = String(reward.bonus);
    }
    if (summary.dataset.maTaskRewardKind !== reward.kind) {
      summary.dataset.maTaskRewardKind = reward.kind;
    }
    const progressValue = `${progress.toFixed(2)}%`;
    if (summary.style.getPropertyValue("--mag-task-xp-progress") !== progressValue) {
      summary.style.setProperty("--mag-task-xp-progress", progressValue);
    }
    if (action.dataset.maTaskCompletionRole !== "action") {
      action.dataset.maTaskCompletionRole = "action";
    }
    if (buttonBar.dataset.maTaskCompletionRole !== "buttonbar") {
      buttonBar.dataset.maTaskCompletionRole = "buttonbar";
    }
    for (const divider of dividers) {
      if (divider.dataset.maTaskCompletionRole !== "divider") {
        divider.dataset.maTaskCompletionRole = "divider";
      }
    }

    createTaskCompletionFireworks(frame);
    taskCompletionElements = nextElements;
  }

  function setEnabled(enabled) {
    if (taskCompletionFireworks) taskCompletionFireworks.hidden = !enabled;
  }

  namespace.register("taskCompletion", {
    annotateTaskCompletion,
    clearTaskCompletionAnnotation,
    parseTaskCompletionReward,
    parseTaskCompletionTitle,
    setEnabled
  });
})();

