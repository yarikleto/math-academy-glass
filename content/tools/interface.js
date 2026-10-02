(() => {
  "use strict";

  // Composition view for extension-owned DOM: exact layer order, launcher,
  // persistent menu, settings, descriptions, and tool visibility.

  const context = globalThis.__maGlassStudyTools;
  if (!context || context.modules.interface) return;
  context.services.requireModules([
    "runtime",
    "drawing",
    "ruler",
    "protractorFace",
    "protractor",
    "compass"
  ]);

  const { config, elements, root, state } = context;
  const runtime = context.modules.runtime;
  const drawingModule = context.modules.drawing;
  const {
    CLEAR_BUTTON_ID,
    COMPASS_DESCRIPTION_ID,
    COMPASS_TOGGLE_ID,
    DRAW_DESCRIPTION_ID,
    DRAW_TOGGLE_ID,
    DRAWING_CANVAS_ID,
    DRAWING_GRID_ID,
    DRAWING_LAYER_ID,
    DRAWING_SURFACE_ID,
    HOST_ID,
    ICONS,
    LAUNCHER_ID,
    MENU_ID,
    PROTRACTOR_DESCRIPTION_ID,
    PROTRACTOR_TOGGLE_ID,
    RULER_DESCRIPTION_ID,
    RULER_TOGGLE_ID,
    STATUS_ID
  } = config;

  function announce(message) {
    if (elements.status) elements.status.textContent = message;
  }

  function createToolCopy(titleText, descriptionText, descriptionId = "") {
    const copy = document.createElement("span");
    copy.className = "ma-glass-tool-copy";

    const title = document.createElement("strong");
    title.textContent = titleText;

    const description = document.createElement("small");
    description.textContent = descriptionText;
    if (descriptionId) description.id = descriptionId;

    copy.append(title, description);
    return { copy, description };
  }

  function createToolSwitch() {
    const toolSwitch = document.createElement("span");
    toolSwitch.className = "ma-glass-tool-switch";
    toolSwitch.setAttribute("aria-hidden", "true");
    toolSwitch.append(document.createElement("span"));
    return toolSwitch;
  }

  // Per-tool settings share one compact segmented control.
  function createToolSettings(labelText, ariaLabel) {
    const settings = document.createElement("div");
    settings.className = "ma-glass-tool-settings";
    settings.setAttribute("role", "group");
    settings.setAttribute("aria-label", ariaLabel);

    const label = document.createElement("span");
    label.className = "ma-glass-tool-settings-label";
    label.textContent = labelText;
    settings.append(label);
    return settings;
  }

  function createSegmentedOptions(options, onSelect) {
    const group = document.createElement("div");
    group.className = "ma-glass-tool-segment";

    const buttons = options.map((option) => {
      const button = document.createElement("button");
      button.className = "ma-glass-tool-segment-option";
      button.type = "button";
      if (option.icon) {
        button.classList.add("ma-glass-tool-segment-option-icon");
        button.setAttribute("aria-label", option.ariaLabel || option.label);
        button.append(
          runtime.createIcon(option.icon, "ma-glass-tool-segment-icon")
        );
      } else {
        button.textContent = option.label;
      }
      button.setAttribute("aria-pressed", String(Boolean(option.selected)));
      if (option.title) button.setAttribute("title", option.title);
      for (const [key, value] of Object.entries(option.data || {})) {
        button.dataset[key] = String(value);
      }
      button.addEventListener("click", () => onSelect(option, button));
      group.append(button);
      return button;
    });

    return { group, buttons };
  }
  function buildInterface() {
    elements.drawingLayer = document.createElement("div");
    elements.drawingLayer.id = DRAWING_LAYER_ID;
    elements.drawingLayer.hidden = true;

    const grid = document.createElement("div");
    grid.id = DRAWING_GRID_ID;
    grid.setAttribute("aria-hidden", "true");

    // Freehand input happens on a transparent surface *under* the geometry
    // tools, while the ink canvas paints *over* them, so a mark is never
    // hidden behind a ruler or protractor.
    elements.drawingSurface = document.createElement("div");
    elements.drawingSurface.id = DRAWING_SURFACE_ID;
    elements.drawingSurface.setAttribute("aria-hidden", "true");

    elements.drawingCanvas = document.createElement("canvas");
    elements.drawingCanvas.id = DRAWING_CANVAS_ID;
    elements.drawingCanvas.setAttribute("aria-label", "Drawing surface");
    elements.drawingCanvas.setAttribute("role", "img");
    elements.drawingCanvas.setAttribute("tabindex", "-1");
    elements.drawingContext = elements.drawingCanvas.getContext("2d");

    context.modules.ruler.buildRuler();
    context.modules.protractor.buildProtractor();
    context.modules.compass.buildCompass();
    elements.drawingLayer.append(
      grid,
      elements.drawingSurface,
      elements.ruler,
      elements.protractor,
      elements.compass,
      elements.drawingCanvas
    );

    elements.host = document.createElement("div");
    elements.host.id = HOST_ID;
    elements.host.hidden = true;

    elements.launcher = document.createElement("button");
    elements.launcher.id = LAUNCHER_ID;
    elements.launcher.type = "button";
    elements.launcher.setAttribute("aria-label", "Open study tools");
    elements.launcher.setAttribute("aria-haspopup", "dialog");
    elements.launcher.setAttribute("aria-expanded", "false");
    elements.launcher.setAttribute("aria-controls", MENU_ID);
    elements.launcher.append(runtime.createIcon(ICONS.launcher, "ma-glass-tool-launcher-icon"));

    const activeBadge = document.createElement("span");
    activeBadge.className = "ma-glass-tool-active-badge";
    activeBadge.setAttribute("aria-hidden", "true");
    elements.launcher.append(activeBadge);

    elements.menu = document.createElement("section");
    elements.menu.id = MENU_ID;
    elements.menu.hidden = true;
    elements.menu.setAttribute("role", "dialog");
    elements.menu.setAttribute("aria-modal", "false");
    elements.menu.setAttribute("aria-labelledby", "ma-glass-study-tools-title");

    const menuHeader = document.createElement("header");
    menuHeader.className = "ma-glass-study-tools-header";

    const menuTitle = document.createElement("h2");
    menuTitle.id = "ma-glass-study-tools-title";
    menuTitle.textContent = "Study tools";

    const menuHint = document.createElement("span");
    menuHint.textContent = "On this page";
    menuHeader.append(menuTitle, menuHint);

    elements.drawToggle = document.createElement("button");
    elements.drawToggle.id = DRAW_TOGGLE_ID;
    elements.drawToggle.type = "button";
    elements.drawToggle.setAttribute("aria-pressed", "false");
    elements.drawToggle.setAttribute("aria-describedby", DRAW_DESCRIPTION_ID);

    const drawIcon = document.createElement("span");
    drawIcon.className = "ma-glass-tool-icon";
    drawIcon.append(runtime.createIcon(ICONS.draw));

    const drawCopy = createToolCopy(
      "Draw",
      "Add freehand notes over the lesson",
      DRAW_DESCRIPTION_ID
    );
    elements.drawDescription = drawCopy.description;
    elements.drawToggle.append(drawIcon, drawCopy.copy, createToolSwitch());
    drawingModule.createDrawingOptions();

    elements.rulerToggle = document.createElement("button");
    elements.rulerToggle.id = RULER_TOGGLE_ID;
    elements.rulerToggle.type = "button";
    elements.rulerToggle.setAttribute("aria-pressed", "false");
    elements.rulerToggle.setAttribute("aria-describedby", RULER_DESCRIPTION_ID);

    const rulerIcon = document.createElement("span");
    rulerIcon.className = "ma-glass-tool-icon";
    rulerIcon.append(runtime.createIcon(ICONS.ruler));

    const rulerCopy = createToolCopy(
      "Ruler",
      "Move, rotate, and guide straight lines",
      RULER_DESCRIPTION_ID
    );
    elements.rulerDescription = rulerCopy.description;
    elements.rulerToggle.append(rulerIcon, rulerCopy.copy, createToolSwitch());

    elements.protractorToggle = document.createElement("button");
    elements.protractorToggle.id = PROTRACTOR_TOGGLE_ID;
    elements.protractorToggle.type = "button";
    elements.protractorToggle.setAttribute("aria-pressed", "false");
    elements.protractorToggle.setAttribute(
      "aria-describedby",
      PROTRACTOR_DESCRIPTION_ID
    );

    const protractorIcon = document.createElement("span");
    protractorIcon.className = "ma-glass-tool-icon";
    protractorIcon.append(runtime.createIcon(ICONS.protractor));

    const protractorCopy = createToolCopy(
      "Protractor",
      context.modules.protractor.getProtractorIdleDescription(),
      PROTRACTOR_DESCRIPTION_ID
    );
    elements.protractorDescription = protractorCopy.description;
    elements.protractorToggle.append(
      protractorIcon,
      protractorCopy.copy,
      createToolSwitch()
    );

    elements.compassToggle = document.createElement("button");
    elements.compassToggle.id = COMPASS_TOGGLE_ID;
    elements.compassToggle.type = "button";
    elements.compassToggle.setAttribute("aria-pressed", "false");
    elements.compassToggle.setAttribute("aria-describedby", COMPASS_DESCRIPTION_ID);

    const compassIcon = document.createElement("span");
    compassIcon.className = "ma-glass-tool-icon";
    compassIcon.append(runtime.createIcon(ICONS.compass));

    const compassCopy = createToolCopy(
      "Compass",
      "Keep a radius and swing arcs from a pivot",
      COMPASS_DESCRIPTION_ID
    );
    elements.compassDescription = compassCopy.description;
    elements.compassToggle.append(compassIcon, compassCopy.copy, createToolSwitch());

    elements.protractorSettings = createToolSettings("Scale", "Protractor scale");
    const sweepSegment = createSegmentedOptions(
      [
        {
          label: "180°",
          selected: state.protractorSweepDegrees === 180,
          title: "Half circle, numbered 0–180 both ways",
          data: { sweep: 180 }
        },
        {
          label: "360°",
          selected: state.protractorSweepDegrees === 360,
          title: "Full circle with clockwise and counterclockwise scales",
          data: { sweep: 360 }
        }
      ],
      (option) => context.modules.protractor.setProtractorSweep(Number(option.data.sweep))
    );
    elements.protractorSweepOptions = sweepSegment.buttons;
    elements.protractorSettings.append(sweepSegment.group);

    const divider = document.createElement("div");
    divider.className = "ma-glass-study-tools-divider";
    divider.setAttribute("aria-hidden", "true");

    elements.clearButton = document.createElement("button");
    elements.clearButton.id = CLEAR_BUTTON_ID;
    elements.clearButton.type = "button";
    elements.clearButton.disabled = true;

    const clearIcon = document.createElement("span");
    clearIcon.className = "ma-glass-tool-icon ma-glass-tool-icon-quiet";
    clearIcon.append(runtime.createIcon(ICONS.clear));

    const clearCopy = createToolCopy(
      "Clear marks",
      "Remove every mark from this page"
    );
    elements.clearButton.append(clearIcon, clearCopy.copy);

    elements.status = document.createElement("p");
    elements.status.id = STATUS_ID;
    elements.status.setAttribute("aria-live", "polite");
    elements.status.textContent = "Choose a tool to start.";

    elements.menu.append(
      menuHeader,
      elements.drawToggle,
      elements.drawingOptions,
      elements.rulerToggle,
      elements.protractorToggle,
      elements.protractorSettings,
      elements.compassToggle,
      divider,
      elements.clearButton,
      elements.status
    );
    elements.host.append(elements.menu, elements.launcher);
    drawingModule.updateDrawingStylePresentation();

    elements.launcher.addEventListener("click", (event) => {
      if (state.menuOpen) {
        closeMenu();
      } else {
        // Mouse users see a quiet popover; keyboard users enter its first
        // control immediately.
        openMenu({ focusFirst: event.detail === 0 });
      }
    });
    elements.drawToggle.addEventListener("click", () => {
      setToolState({ drawing: !state.drawingEnabled });
    });
    elements.rulerToggle.addEventListener("click", () => {
      setToolState({ ruler: !state.rulerVisible });
    });
    elements.protractorToggle.addEventListener("click", () => {
      setToolState({ protractor: !state.protractorVisible });
    });
    elements.compassToggle.addEventListener("click", () => {
      setToolState({ compass: !state.compassVisible });
    });
    elements.clearButton.addEventListener("click", drawingModule.clearDrawing);

    elements.drawingSurface.addEventListener("pointerdown", drawingModule.startStroke);
    elements.drawingSurface.addEventListener("pointermove", drawingModule.continueStroke);
    elements.drawingSurface.addEventListener("pointerup", drawingModule.finishStroke);
    elements.drawingSurface.addEventListener("pointercancel", drawingModule.cancelStroke);
    elements.drawingSurface.addEventListener("lostpointercapture", drawingModule.cancelStroke);
    elements.drawingSurface.addEventListener("click", drawingModule.blockCanvasEvent);
    elements.drawingSurface.addEventListener("dblclick", drawingModule.blockCanvasEvent);
    elements.drawingSurface.addEventListener("contextmenu", drawingModule.blockCanvasEvent);
  }
  function openMenu({ focusFirst = false } = {}) {
    if (!runtime.isExtensionAvailable() || !elements.menu) return;
    state.menuOpen = true;
    elements.menu.hidden = false;
    elements.launcher.setAttribute("aria-expanded", "true");
    if (focusFirst) {
      window.setTimeout(() => {
        if (state.menuOpen && !elements.menu.hidden) elements.drawToggle.focus();
      }, 0);
    }
  }

  function closeMenu() {
    if (!elements.menu) return;
    state.menuOpen = false;
    elements.menu.hidden = true;
    elements.launcher?.setAttribute("aria-expanded", "false");
  }

  function hasActiveTools() {
    return (
      state.drawingEnabled || state.rulerVisible || state.protractorVisible || state.compassVisible
    );
  }

  function hasGeometryTool() {
    return state.rulerVisible || state.protractorVisible || state.compassVisible;
  }

  function getToolState() {
    return Object.freeze({
      compass: state.compassVisible,
      drawing: state.drawingEnabled,
      menuOpen: state.menuOpen,
      protractor: state.protractorVisible,
      ruler: state.rulerVisible
    });
  }

  function getActiveToolNames() {
    const names = [];
    if (state.drawingEnabled) names.push("drawing");
    if (state.rulerVisible) names.push("ruler");
    if (state.protractorVisible) names.push("protractor");
    if (state.compassVisible) names.push("compass");
    return names;
  }

  function formatToolList(names) {
    if (names.length <= 1) return names[0] || "";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
  }

  function getToolDatasetValue() {
    const parts = [];
    if (state.drawingEnabled) parts.push("draw");
    if (state.rulerVisible) parts.push("ruler");
    if (state.protractorVisible) parts.push("protractor");
    if (state.compassVisible) parts.push("compass");
    return parts.join("+") || "none";
  }

  function updateDrawDescription() {
    if (!elements.drawDescription) return;
    elements.drawDescription.textContent = state.drawingEnabled
      ? state.drawingMode === "eraser"
        ? "Drag over a mark to erase it"
        : hasGeometryTool()
          ? "Draw freely or trace a tool edge"
          : "Draw freely anywhere on the page"
      : "Add notes directly over the lesson";
  }

  function updateToolDescriptions() {
    updateDrawDescription();

    if (elements.rulerDescription) {
      elements.rulerDescription.textContent = state.rulerVisible
        ? drawingModule.canDrawMarks()
          ? "Move, rotate, or draw along an edge"
          : state.drawingEnabled
            ? "Move or rotate it; the eraser does not trace its edges"
            : "20 cm screen scale; drawing is off"
        : "Show a movable 20 cm screen ruler";
    }

    context.modules.protractor.updateProtractorDescription();

    if (elements.compassDescription) {
      elements.compassDescription.textContent = state.compassVisible
        ? drawingModule.canDrawMarks()
          ? "Drag the circle to swing an arc"
          : state.drawingEnabled
            ? "Move it or set its radius; the eraser does not trace its circle"
            : "Drag the pivot; the radius is kept"
        : "Keep a radius and swing arcs from a pivot";
    }
  }

  function getToolStatusMessage() {
    const names = getActiveToolNames();
    if (!names.length) return "Study tools are off.";

    const label = formatToolList(names);
    const parts = [`${label.charAt(0).toUpperCase()}${label.slice(1)} active.`];

    if (state.drawingEnabled && state.drawingMode === "eraser") {
      parts.push("Eraser selected: drag over a mark to remove it.");
      parts.push("Press Escape to exit.");
      return parts.join(" ");
    }

    if (state.drawingEnabled && state.rulerVisible) {
      parts.push("Drag a ruler edge for a straight line.");
    }
    if (state.drawingEnabled && state.protractorVisible) {
      parts.push(
        state.protractorSweepDegrees === 360
          ? "On the 360° protractor: drag either full-circle edge for an arc " +
            "or the vertex for a ray. Drag the band anywhere else to move it."
          : "On the 180° protractor: drag either arc edge for an angle arc, " +
            "the vertex for a ray, or the baseline for a straight line. Drag " +
            "anywhere else to move it."
      );
    }
    if (state.drawingEnabled && state.compassVisible) {
      parts.push(
        "With the compass: drag along its circle to swing an arc at the set " +
        "radius."
      );
    }
    if (state.drawingEnabled && !hasGeometryTool()) {
      parts.push("Drag anywhere to draw.");
    }
    if (!state.drawingEnabled && hasGeometryTool()) {
      parts.push("Drawing is off; move or rotate freely.");
    }
    parts.push("Press Escape to exit.");
    return parts.join(" ");
  }

  function setToolState(
    {
      drawing = state.drawingEnabled,
      ruler: nextRulerVisible = state.rulerVisible,
      protractor: nextProtractorVisible = state.protractorVisible,
      compass: nextCompassVisible = state.compassVisible
    } = {},
    { announce = true } = {}
  ) {
    const available = runtime.isExtensionAvailable();
    const nextDrawingEnabled = available && Boolean(drawing);
    const nextRuler = available && Boolean(nextRulerVisible);
    const nextProtractor = available && Boolean(nextProtractorVisible);
    const nextCompass = available && Boolean(nextCompassVisible);
    const nextLayerHidden = !(
      nextDrawingEnabled ||
      nextRuler ||
      nextProtractor ||
      nextCompass
    );
    const previousRulerVisible = state.rulerVisible;
    const previousProtractorVisible = state.protractorVisible;
    const previousCompassVisible = state.compassVisible;

    if (
      state.drawingEnabled === nextDrawingEnabled &&
      state.rulerVisible === nextRuler &&
      state.protractorVisible === nextProtractor &&
      state.compassVisible === nextCompass &&
      elements.drawingLayer?.hidden === nextLayerHidden &&
      elements.ruler?.hidden === !nextRuler &&
      elements.protractor?.hidden === !nextProtractor &&
      elements.compass?.hidden === !nextCompass
    ) {
      return;
    }

    const interactionKind = state.activeInteraction?.kind;
    const interactionUsesDrawing =
      interactionKind === "freehand" ||
      interactionKind === "erase" ||
      runtime.isMarkInteraction(interactionKind);
    const interactionUsesRuler =
      interactionKind?.startsWith("ruler-") || false;
    const interactionUsesProtractor =
      interactionKind?.startsWith("protractor-") || false;
    const interactionUsesCompass =
      interactionKind?.startsWith("compass-") || false;
    if (
      (interactionUsesDrawing && !nextDrawingEnabled) ||
      (interactionUsesRuler && !nextRuler) ||
      (interactionUsesProtractor && !nextProtractor) ||
      (interactionUsesCompass && !nextCompass)
    ) {
      runtime.cancelActivePointer();
    }
    state.drawingEnabled = nextDrawingEnabled;
    state.rulerVisible = nextRuler;
    state.protractorVisible = nextProtractor;
    state.compassVisible = nextCompass;

    root.dataset.maGlassDrawing = String(state.drawingEnabled);
    root.dataset.maGlassRuler = String(state.rulerVisible);
    root.dataset.maGlassProtractor = String(state.protractorVisible);
    root.dataset.maGlassCompass = String(state.compassVisible);
    root.dataset.maGlassTool = getToolDatasetValue();
    elements.drawingLayer.hidden = nextLayerHidden;
    elements.ruler.hidden = !state.rulerVisible;
    elements.protractor.hidden = !state.protractorVisible;
    elements.compass.hidden = !state.compassVisible;
    elements.drawToggle.setAttribute("aria-pressed", String(state.drawingEnabled));
    elements.rulerToggle.setAttribute("aria-pressed", String(state.rulerVisible));
    elements.protractorToggle.setAttribute("aria-pressed", String(state.protractorVisible));
    elements.compassToggle.setAttribute("aria-pressed", String(state.compassVisible));
    elements.launcher.toggleAttribute("data-active", hasActiveTools());

    const activeName = formatToolList(getActiveToolNames());
    elements.launcher.setAttribute(
      "aria-label",
      activeName
        ? `Open study tools, ${activeName} active`
        : "Open study tools"
    );

    updateToolDescriptions();

    if (!state.protractorVisible) context.modules.protractor.updateProtractorReading(null);
    if (!state.compassVisible) context.modules.compass.updateCompassSweepReading(null);

    if (hasActiveTools()) {
      if (state.rulerVisible && !previousRulerVisible) context.modules.ruler.placeRulerInView();
      if (state.protractorVisible && !previousProtractorVisible) {
        context.modules.protractor.placeProtractorInView();
      }
      if (state.compassVisible && !previousCompassVisible) context.modules.compass.placeCompassInView();
      drawingModule.resizeCanvas();
      if (state.rulerVisible) context.modules.ruler.updateRulerPosition();
      if (state.protractorVisible) context.modules.protractor.updateProtractorPosition();
      if (state.compassVisible) context.modules.compass.updateCompassPosition();
    }

    if (!announce) return;
    elements.status.textContent = getToolStatusMessage();
  }

  context.services.registerModule("interface", {
    announce,
    buildInterface,
    closeMenu,
    createSegmentedOptions,
    createToolSettings,
    getToolState,
    getToolStatusMessage,
    hasActiveTools,
    hasGeometryTool,
    openMenu,
    setToolState,
    updateToolDescriptions
  });
})();
