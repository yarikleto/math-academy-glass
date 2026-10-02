(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("dashboard")) return;

  const appearance = namespace.require("appearance");
  const cardExport = namespace.require("cardExport");
  const context = namespace.require("context");
  const courseProgress = namespace.require("courseProgress");
  const dailyGoal = namespace.require("dailyGoal");
  const extensionState = namespace.require("extensionState");
  const mathEditor = namespace.require("mathEditor");
  const taskCompletion = namespace.require("taskCompletion");
  const taskTimer = namespace.require("taskTimer");
  const root = context.getRoot();
  let dashboardObserver;
  let scanFrame;

  function annotateLearnDashboard() {
    scanFrame = undefined;
    root.dataset.maGlassPage = context.pageKind();
    cardExport.annotateLessonCards();

    if (!appearance.isEnabled()) {
      taskTimer.stopLiveTaskTimer();
      dailyGoal.watchDailyGoal(null);
      return;
    }

    courseProgress.updatePublicCourseTopicTotal();
    mathEditor.scheduleMathToolboxPosition();
    if (!context.isLearnPage() || !document.body) {
      dailyGoal.watchDailyGoal(null);
      return;
    }

    const dailyGoalFrame = document.getElementById("dailyGoalFrame");
    if (extensionState.isTabStateLoaded()) taskTimer.syncTaskTimer();
    taskCompletion.annotateTaskCompletion();
    dailyGoal.annotateDailyGoal(dailyGoalFrame);
    dailyGoal.watchDailyGoal(dailyGoalFrame);
    courseProgress.annotateCourseProgress();
    if (extensionState.isTabStateLoaded()) courseProgress.updateCourseTopicStats();

    const leagueIndicator = document.getElementById("leaderboardLeagueColor");
    const currentLeague = appearance.getLeagueNames().find((name) => leagueIndicator?.classList.contains(name));
    document.querySelectorAll("#leagueLevels tr").forEach((row) => {
      row.toggleAttribute(
        "data-ma-current-league",
        Boolean(currentLeague && row.querySelector(`.${currentLeague}`))
      );
    });

    document.querySelectorAll("#leaderboardTable td").forEach((cell) => {
      const label = cell.textContent.replace(/\s+/g, " ").trim().toLowerCase();
      const boundary = label.includes("promotion zone")
        ? "promotion"
        : label.includes("demotion zone")
          ? "demotion"
          : "";

      if (boundary) {
        cell.dataset.maLeagueBoundary = boundary;
      } else {
        delete cell.dataset.maLeagueBoundary;
      }
    });

    document.querySelectorAll(".answerResult").forEach((result) => {
      const label = result.textContent.trim().toLowerCase();
      const status = label === "correct" ? "correct" : label === "incorrect" ? "incorrect" : "";
      if (status) {
        result.dataset.maAnswerResult = status;
      } else {
        delete result.dataset.maAnswerResult;
      }
    });

    // Compatibility annotations must describe the current DOM, not a previous
    // render. Remove only attributes owned by this detector before measuring.
    document.querySelectorAll(
      "[data-ma-glass-surface], [data-ma-glass-subtle], " +
      "[data-ma-glass-orb], [data-ma-glass-copy]"
    ).forEach((element) => {
      delete element.dataset.maGlassSurface;
      delete element.dataset.maGlassSubtle;
      delete element.dataset.maGlassOrb;
      delete element.dataset.maGlassCopy;
    });

    const candidates = [
      ...document.querySelectorAll("main, aside, section, article, table, div")
    ];
    const paleCandidates = new Set();

    // Snapshot surfaces before adding attributes, because the attribute itself
    // changes the computed glass background.
    for (const element of candidates) {
      if (element.closest("#topRibbon, #topNavFrame, #mobileMenu, #ma-glass-study-tools, #ma-glass-drawing-layer, nav, header, dialog, [role='dialog']")) continue;
      if (element.closest("[data-ma-task-completion]")) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 38 || rect.height < 38) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (context.isPaleSurface(context.parseColor(style.backgroundColor))) paleCandidates.add(element);
    }

    for (const element of paleCandidates) {
      const rect = element.getBoundingClientRect();
      let ancestor = element.parentElement;
      while (ancestor && !paleCandidates.has(ancestor)) {
        ancestor = ancestor.parentElement;
      }
      const hasPaleAncestor = Boolean(ancestor);

      if (!hasPaleAncestor && rect.width >= 240 && rect.height >= 74) {
        element.dataset.maGlassSurface = "raised";
        continue;
      }

      const radius = Number.parseFloat(getComputedStyle(element).borderRadius) || 0;
      const isOrb = rect.width <= 96 && rect.height <= 96 && radius >= Math.min(rect.width, rect.height) * 0.38;
      if (isOrb) element.dataset.maGlassOrb = "true";
    }

    // Convert opaque gray sections inside a detected card into a tinted material.
    for (const element of candidates) {
      if (!element.closest("[data-ma-glass-surface='raised']")) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 150 || rect.height < 42) continue;
      const color = context.parseColor(getComputedStyle(element).backgroundColor);
      if (!color || color.a <= 0.55) continue;
      const max = Math.max(color.r, color.g, color.b);
      const min = Math.min(color.r, color.g, color.b);
      if (max >= 92 && max <= 205 && max - min <= 34) {
        element.dataset.maGlassSubtle = "true";
      }
    }

    // Math Academy uses dark navy and mid-gray copy on opaque white cards.
    // Label neutral copy by computed color while preserving blue links, green
    // completion marks, yellow XP bars, and mathematical notation.
    const copyCandidates = document.querySelectorAll(
      "main div, main span, main p, main h1, main h2, main h3, main h4, main td, main th, " +
      "#wrap div, #wrap span, #wrap p, #wrap h1, #wrap h2, #wrap h3, #wrap h4, #wrap td, #wrap th"
    );

    for (const element of copyCandidates) {
      if (!context.hasDirectText(element)) continue;
      if (element.closest("#ma-glass-study-tools, #ma-glass-drawing-layer, a, button, [role='button'], svg, .MathJax, mjx-container, .mq-math-mode, .katex")) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const color = context.parseColor(style.color);
      if (!color) continue;

      const max = Math.max(color.r, color.g, color.b);
      const min = Math.min(color.r, color.g, color.b);
      const chroma = max - min;
      const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
      const isColoredStatus = chroma > 45 && max > 130;

      if (!isColoredStatus && luminance < 0.38) {
        element.dataset.maGlassCopy = "primary";
      } else if (chroma < 28 && luminance < 0.78) {
        element.dataset.maGlassCopy = "muted";
      }
    }
  }

  function scheduleDashboardScan() {
    if (scanFrame !== undefined) return;
    scanFrame = window.setTimeout(annotateLearnDashboard, 40);
  }

  function startDashboardEnhancer() {
    root.dataset.maGlassPage = context.pageKind();
    scheduleDashboardScan();
    if (context.isLearnPage()) courseProgress.scheduleDayRollover();
    if (document.readyState !== "complete") {
      window.addEventListener("load", scheduleDashboardScan, { once: true });
    }
    if (dashboardObserver || !document.body) return;
    dashboardObserver = new MutationObserver(scheduleDashboardScan);
    dashboardObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
      characterData: true,
      childList: true,
      subtree: true
    });
    window.addEventListener("popstate", scheduleDashboardScan);
  }

  namespace.register("dashboard", {
    annotateLearnDashboard,
    scheduleDashboardScan,
    startDashboardEnhancer
  });
})();
