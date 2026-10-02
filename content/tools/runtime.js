(() => {
  "use strict";

  // Composition kernel for the buildless study-tools subsystem. Feature files
  // register frozen APIs here; only gesture coordination and page-local shared
  // references live in this context.

  const NAMESPACE = "__maGlassStudyTools";
  if (globalThis[NAMESPACE]) return;

  // Manifest V3 content scripts are classic scripts. This single isolated-world
  // context gives the load-ordered modules explicit shared ownership without
  // leaking lexical bindings from one file into another.

  const HOST_ID = "ma-glass-study-tools";
  const DRAWING_LAYER_ID = "ma-glass-drawing-layer";
  const DRAWING_GRID_ID = "ma-glass-drawing-grid";
  const DRAWING_SURFACE_ID = "ma-glass-drawing-surface";
  const DRAWING_CANVAS_ID = "ma-glass-drawing-canvas";
  const RULER_ID = "ma-glass-ruler";
  const RULER_MOVE_ID = "ma-glass-ruler-move";
  const RULER_ROTATE_ID = "ma-glass-ruler-rotate";
  const RULER_ANGLE_ID = "ma-glass-ruler-angle";
  const PROTRACTOR_ID = "ma-glass-protractor";
  const PROTRACTOR_VERTEX_ID = "ma-glass-protractor-vertex";
  const PROTRACTOR_ROTATE_ID = "ma-glass-protractor-rotate";
  const PROTRACTOR_ANGLE_ID = "ma-glass-protractor-angle";
  const PROTRACTOR_READING_ID = "ma-glass-protractor-reading";
  const PROTRACTOR_TOGGLE_ID = "ma-glass-protractor-toggle";
  const PROTRACTOR_DESCRIPTION_ID = "ma-glass-protractor-description";
  const COMPASS_ID = "ma-glass-compass";
  const COMPASS_PIVOT_ID = "ma-glass-compass-pivot";
  const COMPASS_RADIUS_ID = "ma-glass-compass-radius";
  const COMPASS_READING_ID = "ma-glass-compass-reading";
  const COMPASS_SWEEP_ID = "ma-glass-compass-sweep";
  const COMPASS_TOGGLE_ID = "ma-glass-compass-toggle";
  const COMPASS_DESCRIPTION_ID = "ma-glass-compass-description";
  const LAUNCHER_ID = "ma-glass-study-tools-launcher";
  const MENU_ID = "ma-glass-study-tools-menu";
  const DRAW_TOGGLE_ID = "ma-glass-draw-toggle";
  const DRAW_DESCRIPTION_ID = "ma-glass-draw-description";
  const RULER_TOGGLE_ID = "ma-glass-ruler-toggle";
  const RULER_DESCRIPTION_ID = "ma-glass-ruler-description";
  const PEN_COLOR_VALUE_ID = "ma-glass-pen-color-value";
  const PEN_WIDTH_VALUE_ID = "ma-glass-pen-width-value";
  const CLEAR_BUTTON_ID = "ma-glass-drawing-clear";
  const STATUS_ID = "ma-glass-study-tools-status";
  const MAX_PIXEL_RATIO = 2;
  const MIN_SEGMENT_LENGTH = 2;
  const DEFAULT_DRAWING_COLOR = "blue";
  const DEFAULT_DRAWING_STROKE_WIDTH = 2.75;
  const MIN_DRAWING_STROKE_WIDTH = 1;
  const MAX_DRAWING_STROKE_WIDTH = 10;
  const TOOL_LINE_GAP = 4;
  const TOOL_EDGE_HIT_OUTSET = 10;
  const TOOL_GUIDE_LINE_WIDTH = 2;
  const RULER_LENGTH_CENTIMETERS = 20;
  const CSS_PIXELS_PER_CENTIMETER = 96 / 2.54;
  const RULER_FALLBACK_WIDTH =
    RULER_LENGTH_CENTIMETERS * CSS_PIXELS_PER_CENTIMETER;
  const TOOL_CONTROL_ALLOWANCE = 64;
  const TOOL_MIN_VISIBLE_SPAN = 144;
  const TOOL_KEYBOARD_ROTATION = Math.PI / 180;
  const TOOL_SNAPPED_ROTATION = Math.PI / 12;
  const PROTRACTOR_RADIUS_CENTIMETERS = 6;
  const PROTRACTOR_FALLBACK_RADIUS =
    PROTRACTOR_RADIUS_CENTIMETERS * CSS_PIXELS_PER_CENTIMETER;
  const PROTRACTOR_HOLE_RATIO = 0.6;
  const PROTRACTOR_RIM_INSET = 3;
  const PROTRACTOR_TICK_MINOR = 5;
  const PROTRACTOR_TICK_MEDIUM = 9;
  const PROTRACTOR_TICK_MAJOR = 15;
  const PROTRACTOR_LABEL_GAP = 11;
  const PROTRACTOR_LABEL_BASELINE_GUARD = 9;
  const PROTRACTOR_ARC_HIT_WIDTH = 30;
  const PROTRACTOR_ARC_HIT_BIAS = 1;
  const PROTRACTOR_MIN_ARC_RADIUS = 22;
  const PROTRACTOR_MIN_ARC_SWEEP = 2;
  const COMPASS_MILLIMETRE = CSS_PIXELS_PER_CENTIMETER / 10;
  const COMPASS_DEFAULT_RADIUS = COMPASS_MILLIMETRE * 35;
  const COMPASS_MIN_RADIUS = COMPASS_MILLIMETRE * 5;
  const COMPASS_MAX_RADIUS = COMPASS_MILLIMETRE * 120;
  const COMPASS_LOCUS_HIT_WIDTH = 22;
  const COMPASS_KEYBOARD_RADIUS_STEP = COMPASS_MILLIMETRE;
  const COMPASS_MIN_SWEEP = 2;
  const COMPASS_READOUT_GAP = 18;
  const ERASER_RADIUS = 16;
  const MAX_UNDO_STEPS = 60;
  const PROTRACTOR_HANDLE_REACH = 46;
  const PROTRACTOR_HANDLE_MARGIN = 24;
  const PROTRACTOR_BASELINE_MARGIN = 62;
  const PROTRACTOR_LABEL_STEP = 10;

  const DRAWING_COLORS = Object.freeze({
    ink: Object.freeze({
      label: "Ink",
      cssProperty: "--mag-drawing-ink",
      fallback: "#24324d"
    }),
    blue: Object.freeze({
      label: "Blue",
      cssProperty: "--mag-drawing-blue",
      fallback: "#0a74d9"
    }),
    red: Object.freeze({
      label: "Red",
      cssProperty: "--mag-drawing-red",
      fallback: "#be3455"
    }),
    green: Object.freeze({
      label: "Green",
      cssProperty: "--mag-drawing-green",
      fallback: "#077a5e"
    }),
    amber: Object.freeze({
      label: "Amber",
      cssProperty: "--mag-drawing-amber",
      fallback: "#8b6200"
    })
  });

  const DRAWING_WIDTHS = Object.freeze([
    Object.freeze({ id: "fine", label: "Fine", width: 1.5 }),
    Object.freeze({
      id: "regular",
      label: "Regular",
      width: DEFAULT_DRAWING_STROKE_WIDTH
    }),
    Object.freeze({ id: "bold", label: "Bold", width: 5 })
  ]);

  const ICONS = Object.freeze({
    launcher: [
      "M4 7h5",
      "M13 7h7",
      "M9 4v6",
      "M4 17h9",
      "M17 17h3",
      "M17 14v6"
    ],
    draw: [
      "M4.8 15.8 15.9 4.7a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L8.2 19.2 4 20Z",
      "M14.1 7.2l2.9 2.9",
      "M5.5 13.1 10.9 18.5"
    ],
    eraser: [
      "m4.7 15.8 7.6-9.4a2 2 0 0 1 2.8-.3l3 2.5a2 2 0 0 1 .3 2.8l-6.2 7.5H7.4Z",
      "m9 11.1 5.9 4.9"
    ],
    ruler: [
      "M4 7h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z",
      "M8 7v4",
      "M12 7v2.5",
      "M16 7v4"
    ],
    clear: [
      "m4.7 15.8 7.6-9.4a2 2 0 0 1 2.8-.3l3 2.5a2 2 0 0 1 .3 2.8l-6.2 7.5H7.4Z",
      "m9 11.1 5.9 4.9",
      "M12.2 18.9h7.1"
    ],
    rotate: ["M20 11a8 8 0 1 1-2.35-5.66", "M20 4v7h-7"],
    protractor: [
      "M3.6 17.4a8.4 8.4 0 0 1 16.8 0",
      "M3.6 17.4h16.8",
      "M12 17.4v-2.6",
      "M12 17.4 16.2 10.1",
      "M7.6 10.2 8.8 12.2"
    ],
    compass: [
      "M12 3.4v2.2",
      "M12 5.6 6.4 19.4",
      "M12 5.6l4.4 10.9",
      "M16.4 16.5l1.9 2.9",
      "M7.9 15.6a7.6 7.6 0 0 0 8.2 0"
    ]
  });

  const root = document.documentElement;
  const modules = Object.create(null);
  const elements = Object.create(null);
  const state = {
    // Exactly one pointer transaction may own a mark or instrument at a time.
    activeInteraction: null,
    activePointerId: null,
    activePointerTarget: null,
    activeStroke: null,

    // Tool activation is coordinated by the interface and consulted by input
    // modules during a gesture.
    compassVisible: false,
    protractorFaceNodes: [],
    protractorSweepDegrees: 180,
    protractorVisible: false,
    rulerVisible: false,

    // Drawing document and presentation state.
    drawingEnabled: false,
    drawingMode: "pen",
    pixelRatio: 1,
    renderFrame: undefined,
    selectedDrawingColor: DEFAULT_DRAWING_COLOR,
    selectedDrawingStrokeWidth: DEFAULT_DRAWING_STROKE_WIDTH,
    strokes: [],
    undoStack: [],

    // Persistent-menu presentation state.
    menuOpen: false
  };
  Object.seal(state);

  const config = Object.freeze({
    CLEAR_BUTTON_ID,
    COMPASS_DEFAULT_RADIUS,
    COMPASS_DESCRIPTION_ID,
    COMPASS_ID,
    COMPASS_KEYBOARD_RADIUS_STEP,
    COMPASS_LOCUS_HIT_WIDTH,
    COMPASS_MAX_RADIUS,
    COMPASS_MILLIMETRE,
    COMPASS_MIN_RADIUS,
    COMPASS_MIN_SWEEP,
    COMPASS_PIVOT_ID,
    COMPASS_RADIUS_ID,
    COMPASS_READING_ID,
    COMPASS_READOUT_GAP,
    COMPASS_SWEEP_ID,
    COMPASS_TOGGLE_ID,
    CSS_PIXELS_PER_CENTIMETER,
    DEFAULT_DRAWING_COLOR,
    DEFAULT_DRAWING_STROKE_WIDTH,
    DRAW_DESCRIPTION_ID,
    DRAW_TOGGLE_ID,
    DRAWING_CANVAS_ID,
    DRAWING_COLORS,
    DRAWING_GRID_ID,
    DRAWING_LAYER_ID,
    DRAWING_SURFACE_ID,
    DRAWING_WIDTHS,
    ERASER_RADIUS,
    HOST_ID,
    ICONS,
    LAUNCHER_ID,
    MAX_DRAWING_STROKE_WIDTH,
    MAX_PIXEL_RATIO,
    MAX_UNDO_STEPS,
    MENU_ID,
    MIN_DRAWING_STROKE_WIDTH,
    MIN_SEGMENT_LENGTH,
    PEN_COLOR_VALUE_ID,
    PEN_WIDTH_VALUE_ID,
    PROTRACTOR_ANGLE_ID,
    PROTRACTOR_ARC_HIT_BIAS,
    PROTRACTOR_ARC_HIT_WIDTH,
    PROTRACTOR_BASELINE_MARGIN,
    PROTRACTOR_DESCRIPTION_ID,
    PROTRACTOR_FALLBACK_RADIUS,
    PROTRACTOR_HANDLE_MARGIN,
    PROTRACTOR_HANDLE_REACH,
    PROTRACTOR_HOLE_RATIO,
    PROTRACTOR_ID,
    PROTRACTOR_LABEL_BASELINE_GUARD,
    PROTRACTOR_LABEL_GAP,
    PROTRACTOR_LABEL_STEP,
    PROTRACTOR_MIN_ARC_RADIUS,
    PROTRACTOR_MIN_ARC_SWEEP,
    PROTRACTOR_RADIUS_CENTIMETERS,
    PROTRACTOR_READING_ID,
    PROTRACTOR_RIM_INSET,
    PROTRACTOR_ROTATE_ID,
    PROTRACTOR_TICK_MAJOR,
    PROTRACTOR_TICK_MEDIUM,
    PROTRACTOR_TICK_MINOR,
    PROTRACTOR_TOGGLE_ID,
    PROTRACTOR_VERTEX_ID,
    RULER_ANGLE_ID,
    RULER_DESCRIPTION_ID,
    RULER_FALLBACK_WIDTH,
    RULER_ID,
    RULER_LENGTH_CENTIMETERS,
    RULER_MOVE_ID,
    RULER_ROTATE_ID,
    RULER_TOGGLE_ID,
    STATUS_ID,
    TOOL_CONTROL_ALLOWANCE,
    TOOL_EDGE_HIT_OUTSET,
    TOOL_GUIDE_LINE_WIDTH,
    TOOL_KEYBOARD_ROTATION,
    TOOL_LINE_GAP,
    TOOL_MIN_VISIBLE_SPAN,
    TOOL_SNAPPED_ROTATION
  });

  const context = { config, elements, modules, root, services: null, state };
  Object.defineProperty(globalThis, NAMESPACE, {
    configurable: false,
    enumerable: false,
    value: context,
    writable: false
  });

  function registerModule(name, api) {
    if (!name || modules[name]) {
      throw new Error(`Math Academy Glass module already registered: ${name}`);
    }
    Object.defineProperty(modules, name, {
      configurable: false,
      enumerable: true,
      value: Object.freeze(api),
      writable: false
    });
    return modules[name];
  }

  function requireModules(names) {
    const missing = names.filter((name) => !modules[name]);
    if (missing.length) {
      throw new Error(`Math Academy Glass modules missing: ${missing.join(", ")}`);
    }
  }

  function createIcon(pathData, className = "") {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    if (className) icon.setAttribute("class", className);

    for (const data of pathData) {
      const path = document.createElementNS(namespace, "path");
      path.setAttribute("d", data);
      icon.append(path);
    }

    return icon;
  }

  function isExtensionAvailable() {
    const isReady = root.dataset.maGlassReady === "true";
    return isReady && root.dataset.maGlassEnabled === "true";
  }

  function isMarkInteraction(kind) {
    return (
      kind === "ruler-line" ||
      kind === "protractor-baseline" ||
      kind === "protractor-ray" ||
      kind === "protractor-arc" ||
      kind === "compass-arc"
    );
  }

  function hasActiveMarkInteraction() {
    return isMarkInteraction(state.activeInteraction?.kind);
  }

  function isEditingElement(target) {
    return (
      target instanceof Element &&
      (
        target.isContentEditable ||
        target.matches(
          "input, textarea, select, [role='textbox'], [role='combobox'], " +
          "[role='searchbox'], [role='spinbutton'], .mq-editable-field, " +
          ".mq-textarea"
        )
      )
    );
  }

  function isEditingKeyboardTarget(event) {
    if (document.designMode === "on") return true;
    const targets = typeof event.composedPath === "function"
      ? event.composedPath()
      : [event.target];
    return targets.some(isEditingElement);
  }

  function blurActiveEditorForDrawing() {
    const activeElement = document.activeElement;
    if (
      document.designMode !== "on" &&
      isEditingElement(activeElement) &&
      typeof activeElement.blur === "function"
    ) {
      activeElement.blur();
    }
  }

  function getLayoutViewportOrigin() {
    return { x: window.scrollX, y: window.scrollY };
  }

  function getVisiblePageBounds() {
    const viewport = window.visualViewport;
    return {
      left: viewport?.pageLeft ?? window.scrollX,
      top: viewport?.pageTop ?? window.scrollY,
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight
    };
  }

  function getPagePoint(event) {
    const origin = getLayoutViewportOrigin();
    return {
      x: Number.isFinite(event.pageX) ? event.pageX : event.clientX + origin.x,
      y: Number.isFinite(event.pageY) ? event.pageY : event.clientY + origin.y
    };
  }

  function isPrimaryPointer(event) {
    return event.isPrimary !== false && event.button === 0;
  }

  function captureActivePointer(target, event, interaction, stroke = null) {
    state.activePointerId = event.pointerId;
    state.activePointerTarget = target;
    state.activeInteraction = interaction;
    state.activeStroke = stroke;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by local QA do not own capture.
    }
  }

  function endActivePointer({
    removeActiveStroke = false,
    discardUndoSnapshot = false
  } = {}) {
    const interactionKind = state.activeInteraction?.kind;
    const ownsUndoSnapshot =
      interactionKind === "freehand" ||
      interactionKind === "erase" ||
      isMarkInteraction(interactionKind);
    const shouldDiscardSnapshot =
      (removeActiveStroke && state.activeStroke) || discardUndoSnapshot;
    if (shouldDiscardSnapshot) state.undoStack.pop();

    const pointerId = state.activePointerId;
    const pointerTarget = state.activePointerTarget;
    const stroke = state.activeStroke;
    state.activePointerId = null;
    state.activePointerTarget = null;
    state.activeInteraction = null;
    state.activeStroke = null;
    elements.ruler?.removeAttribute("data-interaction");
    elements.protractor?.removeAttribute("data-interaction");
    elements.protractor?.removeAttribute("data-arc-edge");
    elements.compass?.removeAttribute("data-interaction");

    if (removeActiveStroke && stroke) modules.drawing.removeStroke(stroke);
    if (ownsUndoSnapshot && !shouldDiscardSnapshot) {
      modules.drawing.trimUndoStack();
    }
    if (pointerId !== null && pointerTarget?.hasPointerCapture?.(pointerId)) {
      try {
        pointerTarget.releasePointerCapture(pointerId);
      } catch {
        // The browser may release capture before pointercancel is dispatched.
      }
    }
    modules.drawing.updateClearButton();
  }

  function cancelActivePointer() {
    const interactionKind = state.activeInteraction?.kind;
    const shouldRemove = isMarkInteraction(interactionKind);
    const shouldDiscardErase =
      interactionKind === "erase" && !state.activeInteraction.erased;
    const shouldClampRuler =
      interactionKind === "ruler-rotate" && state.rulerVisible;
    const shouldClampProtractor =
      interactionKind === "protractor-rotate" && state.protractorVisible;
    const shouldClampCompass =
      interactionKind === "compass-radius" && state.compassVisible;
    endActivePointer({
      removeActiveStroke: shouldRemove,
      discardUndoSnapshot: shouldDiscardErase
    });
    if (shouldClampRuler) {
      modules.ruler.clampRulerToVisiblePage();
      modules.ruler.updateRulerPosition();
    }
    if (shouldClampProtractor) {
      modules.protractor.clampProtractorToVisiblePage();
      modules.protractor.updateProtractorPosition();
    }
    if (shouldClampCompass) {
      modules.compass.clampCompassToVisiblePage();
      modules.compass.updateCompassPosition();
    }
    if (shouldRemove) modules.drawing.scheduleRender();
  }

  function normalizeAngle(angle) {
    const fullTurn = Math.PI * 2;
    let normalized = angle % fullTurn;
    if (normalized <= -Math.PI) normalized += fullTurn;
    if (normalized > Math.PI) normalized -= fullTurn;
    return normalized;
  }

  function normalizePositiveAngle(angle) {
    const fullTurn = Math.PI * 2;
    const normalized = angle % fullTurn;
    return normalized < 0 ? normalized + fullTurn : normalized;
  }

  function getWrappedDegreeDelta(nextDegrees, previousDegrees) {
    let delta = nextDegrees - previousDegrees;
    if (delta <= -180) delta += 360;
    if (delta > 180) delta -= 360;
    return delta;
  }

  function getAngleDegrees(angle) {
    const degrees = Math.round((angle * 180) / Math.PI);
    return ((degrees % 360) + 360) % 360;
  }

  function clampValue(value, minimum, maximum) {
    if (minimum > maximum) return (minimum + maximum) / 2;
    return Math.max(minimum, Math.min(maximum, value));
  }

  function clampToolAxisSided(value, start, size, before, after) {
    const minimum = start + before;
    const maximum = start + size - after;
    if (minimum <= maximum) return clampValue(value, minimum, maximum);
    const minimumVisible = Math.min(TOOL_MIN_VISIBLE_SPAN, size);
    return clampValue(
      value,
      start + minimumVisible - before,
      start + size - minimumVisible + after
    );
  }

  function clampToolAxis(value, start, size, bodyExtent, controlExtent) {
    const minimum = start + controlExtent;
    const maximum = start + size - controlExtent;
    if (minimum <= maximum) return clampValue(value, minimum, maximum);
    const minimumVisible = Math.min(TOOL_MIN_VISIBLE_SPAN, size);
    return clampValue(
      value,
      start + minimumVisible - bodyExtent,
      start + size - minimumVisible + bodyExtent
    );
  }

  function isControlOutsideBounds(control, bounds) {
    const controlRect = control?.getBoundingClientRect();
    if (!controlRect?.width || !controlRect?.height) return false;
    const origin = getLayoutViewportOrigin();
    return (
      controlRect.left + origin.x < bounds.left ||
      controlRect.right + origin.x > bounds.left + bounds.width ||
      controlRect.top + origin.y < bounds.top ||
      controlRect.bottom + origin.y > bounds.top + bounds.height
    );
  }

  context.services = Object.freeze({ registerModule, requireModules });
  Object.freeze(context);
  registerModule("runtime", {
    blurActiveEditorForDrawing,
    cancelActivePointer,
    captureActivePointer,
    clampToolAxis,
    clampToolAxisSided,
    clampValue,
    createIcon,
    endActivePointer,
    getAngleDegrees,
    getLayoutViewportOrigin,
    getPagePoint,
    getVisiblePageBounds,
    getWrappedDegreeDelta,
    hasActiveMarkInteraction,
    isControlOutsideBounds,
    isEditingElement,
    isEditingKeyboardTarget,
    isExtensionAvailable,
    isMarkInteraction,
    isPrimaryPointer,
    normalizeAngle,
    normalizePositiveAngle
  });
})();
