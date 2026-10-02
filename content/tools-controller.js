(() => {
  "use strict";

  const CONTROLLER_VERSION = "1.24";
  const context = globalThis.__maGlassStudyTools;
  if (!context) {
    throw new Error("Math Academy Glass runtime must load before its controller.");
  }
  if (context.modules.controller) return;

  context.services.requireModules([
    "runtime",
    "drawing",
    "ruler",
    "protractorFace",
    "protractor",
    "compass",
    "interface"
  ]);

  const { config, elements, root } = context;
  const runtime = context.modules.runtime;
  const drawing = context.modules.drawing;
  const rulerModule = context.modules.ruler;
  const protractorModule = context.modules.protractor;
  const compassModule = context.modules.compass;
  const interfaceModule = context.modules.interface;
  let bodyObserver;
  let observedBody;
  let currentUrl = location.href;
  let undoListenerInstalled = false;

  root.dataset.maGlassToolsController = CONTROLLER_VERSION;
  root.dataset.maGlassDrawing = "false";
  root.dataset.maGlassDrawMode = "pen";
  root.dataset.maGlassRuler = "false";
  root.dataset.maGlassProtractor = "false";
  root.dataset.maGlassProtractorSweep = "180";
  root.dataset.maGlassCompass = "false";
  root.dataset.maGlassTool = "none";
  root.dataset.maGlassPenColor = config.DEFAULT_DRAWING_COLOR;
  root.dataset.maGlassPenWidth = String(config.DEFAULT_DRAWING_STROKE_WIDTH);

  function ensureMounted() {
    if (!document.body || !elements.host || !elements.drawingLayer) return;
    observeCurrentBody();
    if (elements.drawingLayer.parentNode !== document.body) {
      document.body.append(elements.drawingLayer);
    }
    if (elements.host.parentNode !== document.body) {
      document.body.append(elements.host);
    }
  }

  function observeCurrentBody() {
    if (!document.body || observedBody === document.body) return;
    bodyObserver?.disconnect();
    bodyObserver ||= new MutationObserver(ensureMounted);
    observedBody = document.body;
    bodyObserver.observe(observedBody, { childList: true });
  }

  function syncExtensionState() {
    if (!elements.host) return;
    const available = runtime.isExtensionAvailable();
    elements.host.hidden = !available;
    updateToolsViewportPosition();

    if (!available) {
      interfaceModule.closeMenu();
      interfaceModule.setToolState(
        { drawing: false, ruler: false, protractor: false, compass: false },
        { announce: false }
      );
    } else if (interfaceModule.hasActiveTools()) {
      const toolState = interfaceModule.getToolState();
      drawing.scheduleRender();
      if (toolState.ruler) rulerModule.updateRulerPosition();
      if (toolState.protractor) protractorModule.updateProtractorPosition();
      if (toolState.compass) compassModule.updateCompassPosition();
    }
  }
  function updateToolsViewportPosition() {
    if (!elements.host) return;
    const viewport = window.visualViewport;
    const scale = Math.max(1, viewport?.scale || 1);
    const styles = getComputedStyle(elements.host);
    const rightInset = Number.parseFloat(styles.right) || 0;
    const bottomInset = Number.parseFloat(styles.bottom) || 0;
    const offsetLeft = viewport?.offsetLeft || 0;
    const offsetTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const translateX =
      offsetLeft +
      viewportWidth -
      window.innerWidth +
      rightInset -
      rightInset / scale;
    const translateY =
      offsetTop +
      viewportHeight -
      window.innerHeight +
      bottomInset -
      bottomInset / scale;

    elements.host.style.setProperty("--ma-tools-viewport-x", `${translateX}px`);
    elements.host.style.setProperty("--ma-tools-viewport-y", `${translateY}px`);
    elements.host.style.setProperty("--ma-tools-viewport-scale", String(1 / scale));
  }
  function handleRootMutation() {
    ensureMounted();
    syncExtensionState();
    if (interfaceModule.hasActiveTools()) drawing.scheduleRender();
  }

  function resetPageSession() {
    runtime.cancelActivePointer();
    interfaceModule.setToolState(
      { drawing: false, ruler: false, protractor: false, compass: false },
      { announce: false }
    );
    drawing.resetDrawingSession();
    protractorModule.updateProtractorReading(null);
    compassModule.updateCompassSweepReading(null);
    rulerModule.resetRuler();
    protractorModule.resetProtractor();
    compassModule.resetCompass();
    interfaceModule.closeMenu();
    elements.status.textContent = "Choose a tool to start.";
  }

  function handlePossibleNavigation(event) {
    const nextUrl = String(event?.destination?.url || location.href);
    if (nextUrl === currentUrl) return;
    currentUrl = nextUrl;
    resetPageSession();
  }

  function handlePageHide(event) {
    runtime.cancelActivePointer();
    if (event.persisted) resetPageSession();
  }

  function handlePageShow(event) {
    if (!event.persisted) return;
    currentUrl = location.href;
    resetPageSession();
  }

  function handleKeydown(event) {
    if (
      !event.isTrusted ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.key !== "Escape" ||
      !interfaceModule.hasActiveTools()
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const focusedElement = document.activeElement instanceof Element
      ? document.activeElement
      : null;
    let focusAfterDisable = null;
    if (
      elements.protractor?.contains(focusedElement) ||
      elements.protractorSettings?.contains(focusedElement)
    ) {
      focusAfterDisable = elements.protractorToggle;
    } else if (elements.ruler?.contains(focusedElement)) {
      focusAfterDisable = elements.rulerToggle;
    } else if (elements.compass?.contains(focusedElement)) {
      focusAfterDisable = elements.compassToggle;
    } else if (elements.drawingOptions?.contains(focusedElement)) {
      focusAfterDisable = elements.drawToggle;
    }
    interfaceModule.setToolState({
      drawing: false,
      ruler: false,
      protractor: false,
      compass: false
    });
    if (interfaceModule.getToolState().menuOpen) {
      focusAfterDisable?.focus();
    } else {
      elements.launcher.focus();
    }
  }

  function handleViewportChange(event) {
    const visualViewport = window.visualViewport;
    if (
      event?.currentTarget === visualViewport ||
      (visualViewport?.scale || 1) !== 1
    ) {
      updateToolsViewportPosition();
    }
    if (!interfaceModule.hasActiveTools()) return;
    if (drawing.hasMarks()) drawing.scheduleRender();
    rulerModule.updateRulerPosition();
    protractorModule.updateProtractorPosition();
    compassModule.updateCompassPosition();
  }

  function handleViewportResize(event) {
    if (runtime.hasActiveMarkInteraction()) {
      runtime.cancelActivePointer();
    }
    updateToolsViewportPosition();
    drawing.resizeCanvas();
    const toolState = interfaceModule.getToolState();
    if (toolState.ruler && event?.currentTarget === window) {
      rulerModule.placeRulerInView({ recenterControls: true });
    }
    if (toolState.protractor && event?.currentTarget === window) {
      protractorModule.placeProtractorInView({ recenterControls: true });
    }
    if (toolState.compass && event?.currentTarget === window) {
      compassModule.placeCompassInView();
    }
    rulerModule.updateRulerPosition();
    protractorModule.updateProtractorPosition();
    compassModule.updateCompassPosition();
  }

  function initialize() {
    if (elements.host || !document.body) return;
    interfaceModule.buildInterface();
    ensureMounted();
    syncExtensionState();

    const rootObserver = new MutationObserver(handleRootMutation);
    rootObserver.observe(root, {
      attributes: true,
      attributeFilter: [
        "data-ma-glass-enabled",
        "data-ma-glass-ready",
        "data-ma-glass-theme"
      ],
      childList: true
    });

    observeCurrentBody();

    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("visibilitychange", runtime.cancelActivePointer);
    window.addEventListener("blur", runtime.cancelActivePointer);
    window.addEventListener("resize", handleViewportResize);
    window.addEventListener("scroll", handleViewportChange, { passive: true });
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    window.visualViewport?.addEventListener("scroll", handleViewportChange, {
      passive: true
    });
    window.addEventListener("popstate", handlePossibleNavigation);
    window.addEventListener("hashchange", handlePossibleNavigation);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    globalThis.navigation?.addEventListener(
      "navigatesuccess",
      handlePossibleNavigation
    );
  }

  context.services.registerModule("controller", {
    ensureMounted,
    handleKeydown,
    handlePageHide,
    handlePageShow,
    handlePossibleNavigation,
    initialize,
    resetPageSession,
    syncExtensionState
  });

  // Install before DOMContentLoaded and use capture so Math Academy's own
  // keyboard handlers cannot consume the drawing shortcut first.
  if (!undoListenerInstalled) {
    undoListenerInstalled = true;
    window.addEventListener("keydown", drawing.handleUndoKeydown, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
