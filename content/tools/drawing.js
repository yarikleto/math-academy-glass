(() => {
  "use strict";

  // Owns the mark document: drawing preferences, undo snapshots, eraser
  // geometry, freehand input, and the pointer-inert canvas renderer.

  const context = globalThis.__maGlassStudyTools;
  if (!context || context.modules.drawing) return;
  context.services.requireModules(["runtime"]);

  const { config, elements, root, state } = context;
  const runtime = context.modules.runtime;
  const {
    DEFAULT_DRAWING_COLOR,
    DEFAULT_DRAWING_STROKE_WIDTH,
    DRAWING_COLORS,
    DRAWING_WIDTHS,
    ERASER_RADIUS,
    ICONS,
    MAX_DRAWING_STROKE_WIDTH,
    MAX_PIXEL_RATIO,
    MAX_UNDO_STEPS,
    MIN_DRAWING_STROKE_WIDTH,
    MIN_SEGMENT_LENGTH,
    PEN_COLOR_VALUE_ID,
    PEN_WIDTH_VALUE_ID,
    PROTRACTOR_MIN_ARC_RADIUS,
    PROTRACTOR_MIN_ARC_SWEEP,
    TOOL_EDGE_HIT_OUTSET,
    TOOL_GUIDE_LINE_WIDTH,
    TOOL_LINE_GAP
  } = config;

  function canDrawMarks() {
    return state.drawingEnabled && state.drawingMode === "pen";
  }

  function formatStrokeWidth(width) {
    return `${Number(width).toFixed(2).replace(/\.?0+$/, "")} px`;
  }

  function normalizeStrokeWidth(width) {
    const numericWidth = Number(width);
    if (!Number.isFinite(numericWidth)) {
      return DEFAULT_DRAWING_STROKE_WIDTH;
    }
    return Math.min(
      MAX_DRAWING_STROKE_WIDTH,
      Math.max(MIN_DRAWING_STROKE_WIDTH, numericWidth)
    );
  }

  function getDrawingColor(colorId) {
    return DRAWING_COLORS[colorId] || DRAWING_COLORS[DEFAULT_DRAWING_COLOR];
  }

  function updateDrawingStylePresentation() {
    const color = getDrawingColor(state.selectedDrawingColor);
    const colorValue = `var(${color.cssProperty}, ${color.fallback})`;
    const widthLabel = DRAWING_WIDTHS.find(
      ({ width }) => width === state.selectedDrawingStrokeWidth
    )?.label || "Custom";
    const guideInset =
      TOOL_EDGE_HIT_OUTSET -
      TOOL_LINE_GAP -
      state.selectedDrawingStrokeWidth / 2 -
      TOOL_GUIDE_LINE_WIDTH / 2;

    root.dataset.maGlassPenColor = state.selectedDrawingColor;
    root.dataset.maGlassPenWidth = String(state.selectedDrawingStrokeWidth);
    elements.penColorValue && (elements.penColorValue.textContent = color.label);
    elements.penWidthValue && (
      elements.penWidthValue.textContent =
        `${widthLabel} · ${formatStrokeWidth(state.selectedDrawingStrokeWidth)}`
    );

    for (const input of elements.drawingOptions?.querySelectorAll(
      "input[name='ma-glass-pen-color']"
    ) || []) {
      input.checked = input.value === state.selectedDrawingColor;
    }
    for (const input of elements.drawingOptions?.querySelectorAll(
      "input[name='ma-glass-pen-width']"
    ) || []) {
      input.checked = Number(input.value) === state.selectedDrawingStrokeWidth;
    }

    for (const element of [elements.drawingLayer, elements.host]) {
      element?.style.setProperty("--ma-drawing-color", colorValue);
    }
    elements.drawingLayer?.style.setProperty(
      "--ma-tool-guide-inset",
      `${guideInset}px`
    );
    context.modules.protractorFace.updateProtractorArcGuides();
  }

  function setDrawingColor(colorId, { announce = true } = {}) {
    if (!Object.hasOwn(DRAWING_COLORS, colorId)) return;
    state.selectedDrawingColor = colorId;
    updateDrawingStylePresentation();
    if (announce && elements.status) {
      elements.status.textContent = `Pen color set to ${DRAWING_COLORS[colorId].label}.`;
    }
  }

  function setDrawingStrokeWidth(width, { announce = true } = {}) {
    const nextWidth = normalizeStrokeWidth(width);
    state.selectedDrawingStrokeWidth = nextWidth;
    updateDrawingStylePresentation();
    if (announce && elements.status) {
      const option = DRAWING_WIDTHS.find(
        ({ width: optionWidth }) => optionWidth === nextWidth
      );
      elements.status.textContent =
        `Line thickness set to ${option?.label || "Custom"}, ` +
        `${formatStrokeWidth(nextWidth)}.`;
    }
  }
  function createDrawingOptions() {
    elements.drawingOptions = document.createElement("section");
    elements.drawingOptions.className = "ma-glass-drawing-options";
    elements.drawingOptions.setAttribute("aria-label", "Drawing options");

    const modeSettings = context.modules.interface.createToolSettings("Mode", "Drawing mode");
    const modeSegment = context.modules.interface.createSegmentedOptions(
      [
        {
          label: "Pen",
          ariaLabel: "Pen mode",
          icon: ICONS.draw,
          selected: true,
          title: "Draw marks",
          data: { drawMode: "pen" }
        },
        {
          label: "Eraser",
          ariaLabel: "Eraser mode",
          icon: ICONS.eraser,
          title: "Remove marks you drag over",
          data: { drawMode: "eraser" }
        }
      ],
      (option) => setDrawingMode(option.data.drawMode)
    );
    elements.drawingModeOptions = modeSegment.buttons;
    modeSettings.append(modeSegment.group);
    elements.drawingOptions.append(modeSettings);

    const colorFieldset = document.createElement("fieldset");
    colorFieldset.className = "ma-glass-pen-fieldset";

    const colorLegend = document.createElement("legend");
    colorLegend.className = "ma-glass-visually-hidden";
    colorLegend.textContent = "Pen color";

    const colorHeading = document.createElement("div");
    colorHeading.className = "ma-glass-pen-heading";
    const colorHeadingLabel = document.createElement("span");
    colorHeadingLabel.textContent = "Color";
    elements.penColorValue = document.createElement("output");
    elements.penColorValue.id = PEN_COLOR_VALUE_ID;
    elements.penColorValue.setAttribute("aria-live", "polite");
    colorHeading.append(colorHeadingLabel, elements.penColorValue);

    const palette = document.createElement("div");
    palette.className = "ma-glass-pen-colors";

    for (const [colorId, color] of Object.entries(DRAWING_COLORS)) {
      const option = document.createElement("label");
      option.className = "ma-glass-pen-color-option";
      option.setAttribute("title", `${color.label} drawing color`);

      const input = document.createElement("input");
      input.className = "ma-glass-pen-radio";
      input.type = "radio";
      input.name = "ma-glass-pen-color";
      input.value = colorId;
      input.checked = colorId === state.selectedDrawingColor;
      input.addEventListener("change", () => {
        if (input.checked) setDrawingColor(colorId);
      });

      const swatch = document.createElement("span");
      swatch.className = "ma-glass-pen-swatch";
      swatch.setAttribute("aria-hidden", "true");
      swatch.style.setProperty(
        "--ma-pen-swatch",
        `var(${color.cssProperty}, ${color.fallback})`
      );

      const accessibleLabel = document.createElement("span");
      accessibleLabel.className = "ma-glass-visually-hidden";
      accessibleLabel.textContent = `${color.label} drawing color`;
      option.append(input, swatch, accessibleLabel);
      palette.append(option);
    }
    colorFieldset.append(colorLegend, colorHeading, palette);

    const widthFieldset = document.createElement("fieldset");
    widthFieldset.className = "ma-glass-pen-fieldset";

    const widthLegend = document.createElement("legend");
    widthLegend.className = "ma-glass-visually-hidden";
    widthLegend.textContent = "Line thickness";

    const widthHeading = document.createElement("div");
    widthHeading.className = "ma-glass-pen-heading";
    const widthHeadingLabel = document.createElement("span");
    widthHeadingLabel.textContent = "Thickness";
    elements.penWidthValue = document.createElement("output");
    elements.penWidthValue.id = PEN_WIDTH_VALUE_ID;
    elements.penWidthValue.setAttribute("aria-live", "polite");
    widthHeading.append(widthHeadingLabel, elements.penWidthValue);

    const widths = document.createElement("div");
    widths.className = "ma-glass-pen-widths";

    for (const width of DRAWING_WIDTHS) {
      const option = document.createElement("label");
      option.className = "ma-glass-pen-width-option";
      option.setAttribute(
        "title",
        `${width.label}, ${formatStrokeWidth(width.width)}`
      );

      const input = document.createElement("input");
      input.className = "ma-glass-pen-radio";
      input.type = "radio";
      input.name = "ma-glass-pen-width";
      input.value = String(width.width);
      input.checked = width.width === state.selectedDrawingStrokeWidth;
      input.addEventListener("change", () => {
        if (input.checked) setDrawingStrokeWidth(width.width);
      });

      const sample = document.createElement("span");
      sample.className = "ma-glass-pen-width-sample";
      sample.setAttribute("aria-hidden", "true");
      sample.style.setProperty("--ma-pen-width", `${width.width}px`);

      const accessibleLabel = document.createElement("span");
      accessibleLabel.className = "ma-glass-visually-hidden";
      accessibleLabel.textContent =
        `${width.label} line, ${formatStrokeWidth(width.width)}`;
      option.append(input, sample, accessibleLabel);
      widths.append(option);
    }
    widthFieldset.append(widthLegend, widthHeading, widths);
    elements.penOptions = document.createElement("div");
    elements.penOptions.className = "ma-glass-pen-options";
    elements.penOptions.append(colorFieldset, widthFieldset);

    const undoHint = document.createElement("p");
    undoHint.className = "ma-glass-drawing-undo-hint";
    undoHint.textContent = "Press ⌘Z / Ctrl+Z to undo.";

    elements.drawingOptions.append(elements.penOptions, undoHint);
    return elements.drawingOptions;
  }
  function clearDrawing() {
    runtime.cancelActivePointer();
    if (state.strokes.length) {
      pushUndoSnapshot("clear");
      trimUndoStack();
    }
    state.strokes.length = 0;
    elements.clearButton.disabled = true;
    context.modules.protractor.updateProtractorReading(null);
    context.modules.compass.updateCompassSweepReading(null);
    renderCanvas();
    elements.status.textContent = "Drawing cleared.";
  }

  function updateClearButton() {
    elements.clearButton.disabled = state.strokes.length === 0;
  }

  function hasMarks() {
    return state.strokes.length > 0;
  }

  function resetDrawingSession() {
    state.strokes.length = 0;
    state.undoStack.length = 0;
    updateClearButton();
    renderCanvas();
  }

  function undoLastStroke() {
    const toolsOwnKeyboardFocus = elements.host?.contains(document.activeElement);
    if (
      !runtime.isExtensionAvailable() ||
      (!state.drawingEnabled && !toolsOwnKeyboardFocus) ||
      state.activePointerId !== null ||
      state.undoStack.length === 0
    ) {
      return false;
    }

    const snapshot = state.undoStack.pop();
    state.strokes.length = 0;
    state.strokes.push(...snapshot.strokes);
    context.modules.protractor.updateProtractorReading(null);
    context.modules.compass.updateCompassSweepReading(null);
    updateClearButton();
    renderCanvas();
    elements.status.textContent = snapshot.action === "erase"
      ? "Erase undone."
      : snapshot.action === "clear"
        ? "Clear undone."
        : "Last mark undone.";
    return true;
  }
  function isUndoShortcut(event) {
    const isZKey =
      event.code === "KeyZ" ||
      String(event.key).toLowerCase() === "z";
    return (
      event.isTrusted &&
      !event.defaultPrevented &&
      !event.isComposing &&
      !event.altKey &&
      !event.shiftKey &&
      (event.ctrlKey || event.metaKey) &&
      isZKey
    );
  }

  function handleUndoKeydown(event) {
    if (!isUndoShortcut(event) || runtime.isEditingKeyboardTarget(event)) return;
    if (!undoLastStroke()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function pushUndoSnapshot(action = "mark") {
    state.undoStack.push({ action, strokes: [...state.strokes] });
  }

  function trimUndoStack() {
    const overflow = state.undoStack.length - MAX_UNDO_STEPS;
    if (overflow > 0) state.undoStack.splice(0, overflow);
  }

  function distanceToSegment(point, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(point.x - from.x, point.y - from.y);
    }
    const t = runtime.clampValue(
      ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
      0,
      1
    );
    return Math.hypot(
      point.x - (from.x + dx * t),
      point.y - (from.y + dy * t)
    );
  }

  function strokeHitsPoint(stroke, point, radius) {
    const reach = radius + resolveStrokeWidth(stroke) / 2;

    if (stroke.kind === "arc") {
      const arc = stroke.arc;
      if (!arc) return false;
      const distance = Math.hypot(
        point.x - arc.center.x,
        point.y - arc.center.y
      );
      if (Math.abs(distance - arc.radius) > reach) return false;
      // Only the drawn part of the circle erases.
      const angle = Math.atan2(
        point.y - arc.center.y,
        point.x - arc.center.x
      );
      const tolerance = reach / Math.max(arc.radius, 1);
      return arcContainsAngle(arc, angle, tolerance);
    }

    const points = stroke.points;
    if (!points?.length) return false;
    if (points.length === 1) {
      return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= reach;
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      if (distanceToSegment(point, points[index], points[index + 1]) <= reach) {
        return true;
      }
    }
    return false;
  }

  function arcContainsAngle(arc, angle, tolerance = 0) {
    const span = Math.abs(arc.sweep);
    const fullTurn = Math.PI * 2;
    if (span + tolerance >= fullTurn) return true;

    const offset = runtime.normalizePositiveAngle(
      arc.sweep >= 0
        ? angle - arc.startAngle
        : arc.startAngle - angle
    );
    return offset <= span + tolerance || offset >= fullTurn - tolerance;
  }

  function pointOnSegment(point, from, to) {
    const epsilon = 1e-7;
    return (
      point.x >= Math.min(from.x, to.x) - epsilon &&
      point.x <= Math.max(from.x, to.x) + epsilon &&
      point.y >= Math.min(from.y, to.y) - epsilon &&
      point.y <= Math.max(from.y, to.y) + epsilon
    );
  }

  function segmentCrossProduct(from, to, point) {
    return (
      (to.x - from.x) * (point.y - from.y) -
      (to.y - from.y) * (point.x - from.x)
    );
  }

  function segmentsIntersect(firstFrom, firstTo, secondFrom, secondTo) {
    const epsilon = 1e-7;
    const firstStart = segmentCrossProduct(firstFrom, firstTo, secondFrom);
    const firstEnd = segmentCrossProduct(firstFrom, firstTo, secondTo);
    const secondStart = segmentCrossProduct(secondFrom, secondTo, firstFrom);
    const secondEnd = segmentCrossProduct(secondFrom, secondTo, firstTo);

    if (
      ((firstStart > epsilon && firstEnd < -epsilon) ||
        (firstStart < -epsilon && firstEnd > epsilon)) &&
      ((secondStart > epsilon && secondEnd < -epsilon) ||
        (secondStart < -epsilon && secondEnd > epsilon))
    ) {
      return true;
    }

    return (
      (Math.abs(firstStart) <= epsilon && pointOnSegment(secondFrom, firstFrom, firstTo)) ||
      (Math.abs(firstEnd) <= epsilon && pointOnSegment(secondTo, firstFrom, firstTo)) ||
      (Math.abs(secondStart) <= epsilon && pointOnSegment(firstFrom, secondFrom, secondTo)) ||
      (Math.abs(secondEnd) <= epsilon && pointOnSegment(firstTo, secondFrom, secondTo))
    );
  }

  function distanceBetweenSegments(firstFrom, firstTo, secondFrom, secondTo) {
    if (segmentsIntersect(firstFrom, firstTo, secondFrom, secondTo)) return 0;
    return Math.min(
      distanceToSegment(firstFrom, secondFrom, secondTo),
      distanceToSegment(firstTo, secondFrom, secondTo),
      distanceToSegment(secondFrom, firstFrom, firstTo),
      distanceToSegment(secondTo, firstFrom, firstTo)
    );
  }

  function getSegmentCircleIntersectionAngles(from, to, center, radius) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return [];

    const offsetX = from.x - center.x;
    const offsetY = from.y - center.y;
    const linear = 2 * (offsetX * dx + offsetY * dy);
    const constant =
      offsetX * offsetX + offsetY * offsetY - radius * radius;
    const discriminant = linear * linear - 4 * lengthSquared * constant;
    if (discriminant < 0) return [];

    const root = Math.sqrt(Math.max(0, discriminant));
    const angles = [];
    for (const numerator of [-linear - root, -linear + root]) {
      const progress = numerator / (2 * lengthSquared);
      if (progress < 0 || progress > 1) continue;
      const x = from.x + dx * progress;
      const y = from.y + dy * progress;
      angles.push(Math.atan2(y - center.y, x - center.x));
    }
    return angles;
  }

  function arcHitsSegment(stroke, from, to, radius) {
    const arc = stroke.arc;
    if (!arc) return false;

    const reach = radius + resolveStrokeWidth(stroke) / 2;
    if (
      strokeHitsPoint(stroke, from, radius) ||
      strokeHitsPoint(stroke, to, radius)
    ) {
      return true;
    }

    const segmentAngle = Math.atan2(to.y - from.y, to.x - from.x);
    const candidateAngles = [
      arc.startAngle,
      arc.startAngle + arc.sweep,
      Math.atan2(from.y - arc.center.y, from.x - arc.center.x),
      Math.atan2(to.y - arc.center.y, to.x - arc.center.x),
      segmentAngle + Math.PI / 2,
      segmentAngle - Math.PI / 2,
      ...getSegmentCircleIntersectionAngles(
        from,
        to,
        arc.center,
        arc.radius
      )
    ];
    const angleTolerance = reach / Math.max(arc.radius, 1);

    for (const angle of candidateAngles) {
      if (!arcContainsAngle(arc, angle, angleTolerance)) continue;
      const arcPoint = {
        x: arc.center.x + Math.cos(angle) * arc.radius,
        y: arc.center.y + Math.sin(angle) * arc.radius
      };
      if (distanceToSegment(arcPoint, from, to) <= reach) return true;
    }

    return false;
  }

  function strokeHitsSegment(stroke, from, to, radius) {
    if (stroke.kind === "arc") {
      return arcHitsSegment(stroke, from, to, radius);
    }

    const points = stroke.points;
    if (!points?.length) return false;
    const reach = radius + resolveStrokeWidth(stroke) / 2;
    if (points.length === 1) {
      return distanceToSegment(points[0], from, to) <= reach;
    }

    for (let index = 0; index < points.length - 1; index += 1) {
      if (
        distanceBetweenSegments(
          points[index],
          points[index + 1],
          from,
          to
        ) <= reach
      ) {
        return true;
      }
    }
    return false;
  }

  function eraseAtPoint(point) {
    const survivors = state.strokes.filter(
      (stroke) => !strokeHitsPoint(stroke, point, ERASER_RADIUS)
    );
    if (survivors.length === state.strokes.length) return false;
    state.strokes.length = 0;
    state.strokes.push(...survivors);
    return true;
  }

  function eraseAlongPath(points) {
    if (points.length < 2) return eraseAtPoint(points[0]);

    const survivors = state.strokes.filter((stroke) => {
      for (let index = 0; index < points.length - 1; index += 1) {
        if (
          strokeHitsSegment(
            stroke,
            points[index],
            points[index + 1],
            ERASER_RADIUS
          )
        ) {
          return false;
        }
      }
      return true;
    });

    if (survivors.length === state.strokes.length) return false;
    state.strokes.length = 0;
    state.strokes.push(...survivors);
    return true;
  }
  function setDrawingMode(mode, { announce = true } = {}) {
    const nextMode = mode === "eraser" ? "eraser" : "pen";
    if (nextMode !== state.drawingMode && state.activeInteraction) runtime.cancelActivePointer();
    state.drawingMode = nextMode;
    root.dataset.maGlassDrawMode = nextMode;
    for (const option of elements.drawingModeOptions || []) {
      option.setAttribute(
        "aria-pressed",
        String(option.dataset.drawMode === nextMode)
      );
    }
    context.modules.interface.updateToolDescriptions();
    if (announce && elements.status) {
      elements.status.textContent = nextMode === "eraser"
        ? "Eraser active. Drag over a mark to remove it."
        : "Pen active.";
    }
  }

  function removeStroke(stroke) {
    const index = state.strokes.indexOf(stroke);
    if (index >= 0) state.strokes.splice(index, 1);
  }

  function createStroke(kind) {
    return {
      kind,
      points: [],
      style: Object.freeze({
        colorId: state.selectedDrawingColor,
        width: state.selectedDrawingStrokeWidth
      })
    };
  }
  function appendPoint(stroke, event) {
    const point = runtime.getPagePoint(event);
    const previous = stroke.points.at(-1);
    if (
      previous &&
      Math.hypot(point.x - previous.x, point.y - previous.y) < 0.45
    ) {
      return;
    }
    stroke.points.push(point);
  }

  function appendPointerSamples(stroke, event) {
    for (const sample of getPointerSamples(event)) appendPoint(stroke, sample);
  }

  function getPointerSamples(event) {
    const samples = typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];
    return samples.length ? samples : [event];
  }

  function startStroke(event) {
    if (!state.drawingEnabled || state.activePointerId !== null) return;
    if (!runtime.isPrimaryPointer(event)) return;

    // Preventing the pointer event keeps Chrome's previous focus in place.
    // Explicitly release an answer editor so the next Cmd/Ctrl+Z belongs to
    // the drawing history, while shortcuts typed in an actively edited field
    // remain untouched.
    runtime.blurActiveEditorForDrawing();
    event.preventDefault();
    event.stopPropagation();

    if (state.drawingMode === "eraser") {
      pushUndoSnapshot("erase");
      const point = runtime.getPagePoint(event);
      const erased = eraseAtPoint(point);
      runtime.captureActivePointer(
        elements.drawingSurface,
        event,
        { kind: "erase", erased, lastPoint: point }
      );
      updateClearButton();
      if (erased) scheduleRender();
      return;
    }

    pushUndoSnapshot();
    const stroke = createStroke("freehand");
    appendPointerSamples(stroke, event);
    state.strokes.push(stroke);
    runtime.captureActivePointer(
      elements.drawingSurface,
      event,
      { kind: "freehand" },
      stroke
    );
    updateClearButton();
    scheduleRender();
  }

  function continueStroke(event) {
    if (!state.drawingEnabled || event.pointerId !== state.activePointerId) return;

    if (state.activeInteraction?.kind === "erase") {
      event.preventDefault();
      event.stopPropagation();
      const points = [state.activeInteraction.lastPoint];
      for (const sample of getPointerSamples(event)) {
        points.push(runtime.getPagePoint(sample));
      }
      const erased = eraseAlongPath(points);
      state.activeInteraction.lastPoint = points.at(-1);
      if (erased) {
        state.activeInteraction.erased = true;
        updateClearButton();
        scheduleRender();
      }
      return;
    }

    if (state.activeInteraction?.kind !== "freehand" || !state.activeStroke) return;
    event.preventDefault();
    event.stopPropagation();
    appendPointerSamples(state.activeStroke, event);
    scheduleRender();
  }

  function finishStroke(event) {
    if (event.pointerId !== state.activePointerId) return;

    if (state.activeInteraction?.kind === "erase") {
      event.preventDefault();
      event.stopPropagation();
      continueStroke(event);
      const erased = state.activeInteraction.erased;
      runtime.endActivePointer({ discardUndoSnapshot: !erased });
      scheduleRender();
      elements.status.textContent = erased
        ? "Marks erased."
        : "Nothing to erase there.";
      return;
    }

    if (state.activeInteraction?.kind !== "freehand") return;
    event.preventDefault();
    event.stopPropagation();
    if (state.activeStroke) appendPointerSamples(state.activeStroke, event);
    runtime.endActivePointer();
    scheduleRender();
  }

  function cancelStroke(event) {
    if (
      event.pointerId !== state.activePointerId ||
      (state.activeInteraction?.kind !== "freehand" &&
        state.activeInteraction?.kind !== "erase")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const discardUndoSnapshot =
      state.activeInteraction.kind === "erase" && !state.activeInteraction.erased;
    runtime.endActivePointer({ discardUndoSnapshot });
    scheduleRender();
  }

  function blockCanvasEvent(event) {
    if (!state.drawingEnabled) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function isShortSegment(stroke) {
    if (!stroke || stroke.points.length < 2) return true;
    return (
      Math.hypot(
        stroke.points[1].x - stroke.points[0].x,
        stroke.points[1].y - stroke.points[0].y
      ) < MIN_SEGMENT_LENGTH
    );
  }

  function isShortArc(stroke) {
    const arc = stroke?.arc;
    if (!arc) return true;
    return (
      Math.abs((arc.sweep * 180) / Math.PI) < PROTRACTOR_MIN_ARC_SWEEP ||
      arc.radius < PROTRACTOR_MIN_ARC_RADIUS
    );
  }

  function isShortMark(stroke) {
    return stroke?.kind === "arc"
      ? isShortArc(stroke)
      : isShortSegment(stroke);
  }
  function resizeCanvas() {
    if (!elements.drawingCanvas || !elements.drawingContext) return;
    const canvasRect = elements.drawingCanvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(canvasRect.width || window.innerWidth));
    const nextHeight = Math.max(1, Math.round(canvasRect.height || window.innerHeight));
    const nextRatio = Math.min(
      MAX_PIXEL_RATIO,
      Math.max(1, window.devicePixelRatio || 1)
    );
    const backingWidth = Math.round(nextWidth * nextRatio);
    const backingHeight = Math.round(nextHeight * nextRatio);

    state.pixelRatio = nextRatio;

    if (
      elements.drawingCanvas.width !== backingWidth ||
      elements.drawingCanvas.height !== backingHeight
    ) {
      elements.drawingCanvas.width = backingWidth;
      elements.drawingCanvas.height = backingHeight;
    }
    renderCanvas();
    context.modules.ruler.updateRulerPosition();
    context.modules.protractor.updateProtractorPosition();
    context.modules.compass.updateCompassPosition();
  }

  function scheduleRender() {
    if (!context.modules.interface.hasActiveTools() || state.renderFrame !== undefined) return;
    state.renderFrame = window.requestAnimationFrame(renderCanvas);
  }

  function resolveStrokeColor(stroke, styles) {
    const colorId = stroke.style?.colorId;
    if (Object.hasOwn(DRAWING_COLORS, colorId)) {
      const color = DRAWING_COLORS[colorId];
      return (
        styles.getPropertyValue(color.cssProperty).trim() ||
        color.fallback
      );
    }
    return styles.getPropertyValue("--mag-accent").trim() || "#0a74d9";
  }

  function resolveStrokeWidth(stroke) {
    return normalizeStrokeWidth(
      stroke.style?.width ?? DEFAULT_DRAWING_STROKE_WIDTH
    );
  }

  function renderCanvas() {
    if (!elements.drawingContext || !elements.drawingCanvas) return;
    if (state.renderFrame !== undefined) {
      window.cancelAnimationFrame(state.renderFrame);
      state.renderFrame = undefined;
    }

    elements.drawingContext.setTransform(1, 0, 0, 1, 0, 0);
    elements.drawingContext.clearRect(0, 0, elements.drawingCanvas.width, elements.drawingCanvas.height);
    if (!state.strokes.length) return;

    const styles = getComputedStyle(root);
    elements.drawingContext.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
    elements.drawingContext.lineCap = "round";
    elements.drawingContext.lineJoin = "round";
    const origin = runtime.getLayoutViewportOrigin();
    const toViewportPoint = (point) => ({
      x: point.x - origin.x,
      y: point.y - origin.y
    });

    for (const stroke of state.strokes) {
      const points = stroke.points;
      if (stroke.kind !== "arc" && !points.length) continue;

      const strokeColor = resolveStrokeColor(stroke, styles);
      const strokeWidth = resolveStrokeWidth(stroke);
      elements.drawingContext.strokeStyle = strokeColor;
      elements.drawingContext.fillStyle = strokeColor;
      elements.drawingContext.lineWidth = strokeWidth;

      if (stroke.kind === "arc") {
        const arc = stroke.arc;
        if (!arc || arc.sweep === 0) continue;
        const center = toViewportPoint(arc.center);
        elements.drawingContext.beginPath();
        elements.drawingContext.arc(
          center.x,
          center.y,
          arc.radius,
          arc.startAngle,
          arc.startAngle + arc.sweep,
          arc.sweep < 0
        );
        elements.drawingContext.stroke();
        continue;
      }

      const first = toViewportPoint(points[0]);

      if (stroke.kind === "segment" && points.length > 1) {
        const last = toViewportPoint(points.at(-1));
        elements.drawingContext.beginPath();
        elements.drawingContext.moveTo(first.x, first.y);
        elements.drawingContext.lineTo(last.x, last.y);
        elements.drawingContext.stroke();
        continue;
      }

      if (points.length === 1) {
        elements.drawingContext.beginPath();
        elements.drawingContext.arc(first.x, first.y, strokeWidth / 2, 0, Math.PI * 2);
        elements.drawingContext.fill();
        continue;
      }

      elements.drawingContext.beginPath();
      elements.drawingContext.moveTo(first.x, first.y);

      for (let index = 1; index < points.length - 1; index += 1) {
        const point = toViewportPoint(points[index]);
        const next = toViewportPoint(points[index + 1]);
        elements.drawingContext.quadraticCurveTo(
          point.x,
          point.y,
          (point.x + next.x) / 2,
          (point.y + next.y) / 2
        );
      }

      const last = toViewportPoint(points.at(-1));
      elements.drawingContext.lineTo(last.x, last.y);
      elements.drawingContext.stroke();
    }
  }

  context.services.registerModule("drawing", {
    blockCanvasEvent,
    canDrawMarks,
    cancelStroke,
    clearDrawing,
    continueStroke,
    createDrawingOptions,
    createStroke,
    finishStroke,
    formatStrokeWidth,
    handleUndoKeydown,
    hasMarks,
    isShortArc,
    isShortMark,
    isShortSegment,
    normalizeStrokeWidth,
    pushUndoSnapshot,
    removeStroke,
    renderCanvas,
    resetDrawingSession,
    resizeCanvas,
    scheduleRender,
    setDrawingColor,
    setDrawingMode,
    setDrawingStrokeWidth,
    startStroke,
    trimUndoStack,
    updateClearButton,
    updateDrawingStylePresentation
  });
})();
