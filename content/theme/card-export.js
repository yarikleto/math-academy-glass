(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("cardExport")) return;

  const context = namespace.require("context");
  const root = context.getRoot();
  const TASK_CARD_SELECTOR = "#steps > .step";
  const TOPIC_CARD_SELECTOR = "#lessonContent > .step";
  const TOPIC_ROUTE_PATTERN = /^\/topics\/\d+\/?$/;
  const CONTROL_SELECTOR = "[data-ma-glass-card-export-control='true']";
  const PRINT_ANCESTOR_ATTRIBUTE = "data-ma-glass-print-ancestor";
  const PRINT_EXCLUDED_ATTRIBUTE = "data-ma-glass-print-excluded";
  const PRINT_TARGET_ATTRIBUTE = "data-ma-glass-print-target";
  const PRINT_TIMEOUT = 300_000;
  const TITLE_LIMIT = 90;
  const markedAncestors = new Set();
  const markedExcluded = new Set();
  let activeCard = null;
  let cleanupTimer;
  let enabled = false;
  let originalTitle = null;

  function hasDirectLessonContent(card) {
    return [...card.children].some((child) => child.matches?.(".tutorial, .example"));
  }

  function getCardFamily() {
    const page = context.pageKind();
    if (page === "learn") {
      return { kind: "task", selector: TASK_CARD_SELECTOR };
    }
    if (page === "topic" && TOPIC_ROUTE_PATTERN.test(location.pathname)) {
      return { kind: "topic", selector: TOPIC_CARD_SELECTOR };
    }
    return null;
  }

  function getEligibleCardHeader(card, family) {
    const header = card.querySelector(".stepHeader");
    if (!header) return null;

    if (family.kind === "task") {
      return hasDirectLessonContent(card) ? header : null;
    }

    if (
      !card.querySelector(".stepName") ||
      card.querySelector(".question, .questionWidget")
    ) {
      return null;
    }
    return header;
  }

  function cardBelongsToFamily(card, family) {
    return [...document.querySelectorAll(family.selector)].includes(card);
  }

  function createExportIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("viewBox", "0 0 16 16");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M8 2.5v7m0 0 3-3m-3 3-3-3M3 12.5h10");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "1.5");
    svg.append(path);
    return svg;
  }

  function normalizePrintTitle(card) {
    const rawTitle = card.querySelector(".stepName")?.textContent || "Lesson card";
    const normalized = typeof rawTitle.normalize === "function"
      ? rawTitle.normalize("NFKC")
      : rawTitle;
    const safeTitle = normalized
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[. ]+|[. ]+$/g, "")
      .slice(0, TITLE_LIMIT)
      .trim();
    return `Math Academy - ${safeTitle || "Lesson card"}`;
  }

  function setControlsBusy(activeControl) {
    document.querySelectorAll(CONTROL_SELECTOR).forEach((control) => {
      control.setAttribute("aria-disabled", "true");
      control.toggleAttribute(
        "data-ma-glass-card-export-active",
        control === activeControl
      );
    });
  }

  function restoreControls() {
    document.querySelectorAll(CONTROL_SELECTOR).forEach((control) => {
      control.removeAttribute("aria-disabled");
      control.removeAttribute("data-ma-glass-card-export-active");
    });
  }

  function markPrintBranch(card) {
    card.setAttribute(PRINT_TARGET_ATTRIBUTE, "true");
    let branch = card;

    while (branch.parentElement) {
      const parent = branch.parentElement;
      parent.setAttribute(PRINT_ANCESTOR_ATTRIBUTE, "true");
      markedAncestors.add(parent);

      for (const sibling of parent.children) {
        if (sibling === branch) continue;
        sibling.setAttribute(PRINT_EXCLUDED_ATTRIBUTE, "true");
        markedExcluded.add(sibling);
      }

      if (parent === document.body) break;
      branch = parent;
    }
  }

  function finishCardPrint() {
    if (!activeCard && originalTitle === null) return;
    if (cleanupTimer !== undefined) {
      window.clearTimeout(cleanupTimer);
      cleanupTimer = undefined;
    }

    activeCard?.removeAttribute(PRINT_TARGET_ATTRIBUTE);
    for (const element of markedAncestors) {
      element.removeAttribute(PRINT_ANCESTOR_ATTRIBUTE);
    }
    for (const element of markedExcluded) {
      element.removeAttribute(PRINT_EXCLUDED_ATTRIBUTE);
    }
    markedAncestors.clear();
    markedExcluded.clear();
    delete root.dataset.maGlassCardPrinting;
    restoreControls();

    if (originalTitle !== null) document.title = originalTitle;
    originalTitle = null;
    activeCard = null;
  }

  function showPrintError(control) {
    control.setAttribute("data-ma-glass-card-export-error", "true");
    control.setAttribute("aria-label", "Could not open print preview");
    window.setTimeout(() => {
      if (!control.isConnected) return;
      control.removeAttribute("data-ma-glass-card-export-error");
      control.setAttribute("aria-label", "Save this card as PDF");
    }, 3_000);
  }

  function startCardPrint(card, control) {
    const family = getCardFamily();
    if (
      activeCard ||
      !enabled ||
      root.dataset.maGlassEnabled !== "true" ||
      !card.isConnected ||
      !family ||
      !cardBelongsToFamily(card, family) ||
      !getEligibleCardHeader(card, family)
    ) {
      return;
    }

    activeCard = card;
    originalTitle = document.title;
    document.title = normalizePrintTitle(card);
    root.dataset.maGlassCardPrinting = "true";
    markPrintBranch(card);
    setControlsBusy(control);
    cleanupTimer = window.setTimeout(finishCardPrint, PRINT_TIMEOUT);

    let printFailed = false;
    try {
      window.print();
    } catch {
      printFailed = true;
    } finally {
      finishCardPrint();
    }
    if (printFailed) showPrintError(control);
  }

  function handleExportActivation(event, card, control) {
    event.preventDefault();
    if (!event.isTrusted) return;
    startCardPrint(card, control);
  }

  function createExportControl(card) {
    const control = document.createElement("a");
    control.className = "ma-glass-card-export-link";
    control.dataset.maGlassCardExportControl = "true";
    control.setAttribute("aria-label", "Save this card as PDF");
    control.setAttribute("href", "#");
    control.setAttribute("title", "Save this card as PDF (opens print preview)");
    control.append(createExportIcon());

    const label = document.createElement("span");
    label.textContent = "PDF";
    control.append(label);
    control.addEventListener("click", (event) => {
      handleExportActivation(event, card, control);
    });
    return control;
  }

  function removeExportControls() {
    document.querySelectorAll(CONTROL_SELECTOR).forEach((control) => control.remove());
  }

  function annotateLessonCards() {
    const family = getCardFamily();
    if (!enabled || !family || !document.body) {
      finishCardPrint();
      removeExportControls();
      return;
    }

    const eligibleCards = new Set();
    document.querySelectorAll(family.selector).forEach((card) => {
      const header = getEligibleCardHeader(card, family);
      if (!header) return;
      eligibleCards.add(card);
      if (!header.querySelector(CONTROL_SELECTOR)) {
        header.append(createExportControl(card));
      }
    });

    document.querySelectorAll(CONTROL_SELECTOR).forEach((control) => {
      const ownsControl = [...eligibleCards].some((card) => card.contains(control));
      if (!ownsControl) control.remove();
    });

    if (activeCard && (!activeCard.isConnected || !eligibleCards.has(activeCard))) {
      finishCardPrint();
    }
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (!enabled) {
      finishCardPrint();
      removeExportControls();
      return;
    }
    annotateLessonCards();
  }

  window.addEventListener("afterprint", finishCardPrint);
  window.addEventListener("pagehide", finishCardPrint);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finishCardPrint();
  });

  namespace.register("cardExport", {
    annotateLessonCards,
    setEnabled
  });
})();
