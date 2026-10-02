(() => {
  "use strict";

  // Owns ruler construction, page-coordinate placement, edge projection, and
  // pointer/keyboard gestures. Mark commits go through the drawing API.

  const context = globalThis.__maGlassStudyTools;
  if (!context || context.modules.ruler) return;
  context.services.requireModules(["runtime", "drawing"]);

  const { config, elements, state } = context;
  const runtime = context.modules.runtime;
  const drawing = context.modules.drawing;
  const rulerState = Object.seal({ x: null, y: null, angle: 0 });
  const {
    DEFAULT_DRAWING_STROKE_WIDTH,
    ICONS,
    RULER_ANGLE_ID,
    RULER_FALLBACK_WIDTH,
    RULER_ID,
    RULER_LENGTH_CENTIMETERS,
    RULER_MOVE_ID,
    RULER_ROTATE_ID,
    TOOL_CONTROL_ALLOWANCE,
    TOOL_KEYBOARD_ROTATION,
    TOOL_LINE_GAP,
    TOOL_SNAPPED_ROTATION
  } = config;

  function buildRuler() {
    elements.ruler = document.createElement("div");
    elements.ruler.id = RULER_ID;
    elements.ruler.hidden = true;
    elements.ruler.setAttribute("role", "group");
    elements.ruler.dataset.lengthCentimeters = String(RULER_LENGTH_CENTIMETERS);
    elements.ruler.setAttribute(
      "aria-label",
      `${RULER_LENGTH_CENTIMETERS} CSS-centimeter screen ruler`
    );
    elements.ruler.setAttribute(
      "title",
      "20 CSS cm. Physical size depends on browser zoom and display scaling."
    );

    const scale = document.createElement("span");
    scale.className = "ma-glass-ruler-scale";
    scale.setAttribute("aria-hidden", "true");

    const labels = document.createElement("span");
    labels.className = "ma-glass-ruler-labels";
    labels.setAttribute("aria-hidden", "true");
    for (
      let value = 0;
      value <= RULER_LENGTH_CENTIMETERS;
      value += 1
    ) {
      const label = document.createElement("span");
      label.textContent = String(value);
      label.dataset.rulerCentimeter = String(value);
      label.style.setProperty(
        "--ma-ruler-label-position",
        `${(value / RULER_LENGTH_CENTIMETERS) * 100}%`
      );
      labels.append(label);
    }

    const unit = document.createElement("span");
    unit.className = "ma-glass-ruler-unit";
    unit.textContent = "cm";
    unit.setAttribute("aria-hidden", "true");

    const topEdge = document.createElement("span");
    topEdge.className = "ma-glass-ruler-edge ma-glass-ruler-edge-top";
    topEdge.dataset.rulerEdge = "-1";
    topEdge.setAttribute("aria-hidden", "true");

    const bottomEdge = document.createElement("span");
    bottomEdge.className = "ma-glass-ruler-edge ma-glass-ruler-edge-bottom";
    bottomEdge.dataset.rulerEdge = "1";
    bottomEdge.setAttribute("aria-hidden", "true");

    elements.rulerMoveControl = document.createElement("button");
    elements.rulerMoveControl.id = RULER_MOVE_ID;
    elements.rulerMoveControl.type = "button";
    elements.rulerMoveControl.setAttribute("aria-label", "Move ruler");
    elements.rulerMoveControl.setAttribute(
      "title",
      "Drag the ruler to move it. Arrow keys move by 1 px; hold Shift for 10 px."
    );


    elements.rulerRotateControl = document.createElement("button");
    elements.rulerRotateControl.id = RULER_ROTATE_ID;
    elements.rulerRotateControl.type = "button";
    elements.rulerRotateControl.setAttribute("role", "slider");
    elements.rulerRotateControl.setAttribute("aria-label", "Rotate ruler");
    elements.rulerRotateControl.setAttribute("aria-valuemin", "0");
    elements.rulerRotateControl.setAttribute("aria-valuemax", "359");
    elements.rulerRotateControl.setAttribute(
      "title",
      "Drag to rotate. Hold Shift to snap to 15 degrees."
    );
    elements.rulerRotateControl.append(runtime.createIcon(ICONS.rotate));

    const connector = document.createElement("span");
    connector.className = "ma-glass-ruler-rotate-connector";
    connector.setAttribute("aria-hidden", "true");

    elements.rulerAngle = document.createElement("output");
    elements.rulerAngle.id = RULER_ANGLE_ID;
    elements.rulerAngle.setAttribute("aria-hidden", "true");

    elements.ruler.append(
      scale,
      labels,
      unit,
      elements.rulerMoveControl,
      topEdge,
      bottomEdge,
      connector,
      elements.rulerRotateControl,
      elements.rulerAngle
    );

    elements.rulerMoveControl.addEventListener("pointerdown", (event) => {
      startRulerInteraction(event, "ruler-move");
    });
    elements.rulerRotateControl.addEventListener("pointerdown", (event) => {
      startRulerInteraction(event, "ruler-rotate");
    });
    topEdge.addEventListener("pointerdown", (event) => {
      startRulerInteraction(event, "ruler-line", -1);
    });
    bottomEdge.addEventListener("pointerdown", (event) => {
      startRulerInteraction(event, "ruler-line", 1);
    });
    elements.ruler.addEventListener("pointermove", continueRulerInteraction);
    elements.ruler.addEventListener("pointerup", finishRulerInteraction);
    elements.ruler.addEventListener("pointercancel", cancelRulerInteraction);
    elements.ruler.addEventListener("lostpointercapture", cancelRulerInteraction);
    elements.ruler.addEventListener("click", blockRulerEvent);
    elements.ruler.addEventListener("dblclick", blockRulerEvent);
    elements.ruler.addEventListener("contextmenu", blockRulerEvent);
    elements.rulerMoveControl.addEventListener("keydown", handleRulerMoveKeydown);
    elements.rulerRotateControl.addEventListener("keydown", handleRulerRotateKeydown);
  }
  function getRulerMetrics() {
    const width = Math.max(
      1,
      elements.ruler?.offsetWidth || RULER_FALLBACK_WIDTH
    );
    const height = Math.max(1, elements.ruler?.offsetHeight || 64);
    const cosine = Math.cos(rulerState.angle);
    const sine = Math.sin(rulerState.angle);
    return {
      x: rulerState.x,
      y: rulerState.y,
      angle: rulerState.angle,
      width,
      height,
      axis: { x: cosine, y: sine },
      normal: { x: -sine, y: cosine }
    };
  }

  function projectPointToRulerEdge(
    point,
    metrics,
    edge,
    strokeWidth = DEFAULT_DRAWING_STROKE_WIDTH
  ) {
    const offsetX = point.x - metrics.x;
    const offsetY = point.y - metrics.y;
    const projection = Math.max(
      -metrics.width / 2,
      Math.min(
        metrics.width / 2,
        offsetX * metrics.axis.x + offsetY * metrics.axis.y
      )
    );
    const normalizedStrokeWidth = drawing.normalizeStrokeWidth(strokeWidth);
    const edgeOffset = edge * Math.max(
      0,
      metrics.height / 2 +
        TOOL_LINE_GAP +
        normalizedStrokeWidth / 2
    );
    return {
      x:
        metrics.x +
        metrics.axis.x * projection +
        metrics.normal.x * edgeOffset,
      y:
        metrics.y +
        metrics.axis.y * projection +
        metrics.normal.y * edgeOffset
    };
  }

  function getRulerBodyExtents(metrics = getRulerMetrics()) {
    return {
      x:
        Math.abs(metrics.axis.x) * metrics.width / 2 +
        Math.abs(metrics.normal.x) * metrics.height / 2,
      y:
        Math.abs(metrics.axis.y) * metrics.width / 2 +
        Math.abs(metrics.normal.y) * metrics.height / 2
    };
  }
  function placeRulerInView({ recenterControls = false } = {}) {
    const bounds = runtime.getVisiblePageBounds();
    const metrics = getRulerMetrics();
    const bodyExtents = getRulerBodyExtents(metrics);
    const controlsOutside =
      recenterControls &&
      runtime.isControlOutsideBounds(elements.rulerRotateControl, bounds);
    const isOutside =
      Number.isFinite(rulerState.x) &&
      Number.isFinite(rulerState.y) &&
      (
        rulerState.x + bodyExtents.x < bounds.left ||
        rulerState.x - bodyExtents.x > bounds.left + bounds.width ||
        rulerState.y + bodyExtents.y < bounds.top ||
        rulerState.y - bodyExtents.y > bounds.top + bounds.height
      );

    if (
      !Number.isFinite(rulerState.x) ||
      !Number.isFinite(rulerState.y) ||
      isOutside ||
      controlsOutside
    ) {
      rulerState.x = bounds.left + bounds.width / 2;
      rulerState.y = bounds.top + bounds.height * 0.58;
    }
    clampRulerToVisiblePage();
  }
  function clampRulerToVisiblePage() {
    const bounds = runtime.getVisiblePageBounds();
    const metrics = getRulerMetrics();
    const bodyExtents = getRulerBodyExtents(metrics);
    const controlExtentX =
      Math.abs(metrics.axis.x) *
        (metrics.width / 2 + TOOL_CONTROL_ALLOWANCE) +
      Math.abs(metrics.normal.x) *
        (metrics.height / 2 + TOOL_CONTROL_ALLOWANCE);
    const controlExtentY =
      Math.abs(metrics.axis.y) *
        (metrics.width / 2 + TOOL_CONTROL_ALLOWANCE) +
      Math.abs(metrics.normal.y) *
        (metrics.height / 2 + TOOL_CONTROL_ALLOWANCE);

    rulerState.x = runtime.clampToolAxis(
      rulerState.x,
      bounds.left,
      bounds.width,
      bodyExtents.x,
      controlExtentX
    );
    rulerState.y = runtime.clampToolAxis(
      rulerState.y,
      bounds.top,
      bounds.height,
      bodyExtents.y,
      controlExtentY
    );
  }

  function updateRulerPosition() {
    if (!elements.ruler || !Number.isFinite(rulerState.x) || !Number.isFinite(rulerState.y)) {
      return;
    }
    const origin = runtime.getLayoutViewportOrigin();
    const degrees = runtime.getAngleDegrees(rulerState.angle);
    elements.ruler.style.setProperty("--ma-ruler-x", `${rulerState.x - origin.x}px`);
    elements.ruler.style.setProperty("--ma-ruler-y", `${rulerState.y - origin.y}px`);
    elements.ruler.style.setProperty("--ma-ruler-angle", `${rulerState.angle}rad`);
    elements.rulerAngle.textContent = `${degrees}°`;
    elements.rulerRotateControl.setAttribute("aria-valuenow", String(degrees));
    elements.rulerRotateControl.setAttribute("aria-valuetext", `${degrees} degrees`);
  }

  function startRulerInteraction(event, kind, edge = 0) {
    if (
      !state.rulerVisible ||
      (kind === "ruler-line" && !drawing.canDrawMarks()) ||
      state.activePointerId !== null ||
      !runtime.isPrimaryPointer(event)
    ) {
      return;
    }

    if (kind === "ruler-line") runtime.blurActiveEditorForDrawing();
    event.preventDefault();
    event.stopPropagation();
    updateRulerPosition();
    const point = runtime.getPagePoint(event);
    const metrics = getRulerMetrics();
    let interaction;
    let stroke = null;

    if (kind === "ruler-move") {
      interaction = {
        kind,
        startPoint: point,
        startX: rulerState.x,
        startY: rulerState.y
      };
    } else if (kind === "ruler-rotate") {
      interaction = {
        kind,
        angleOffset:
          rulerState.angle -
          Math.atan2(point.y - rulerState.y, point.x - rulerState.x)
      };
    } else {
      drawing.pushUndoSnapshot();
      stroke = drawing.createStroke("segment");
      const snappedPoint = projectPointToRulerEdge(
        point,
        metrics,
        edge,
        stroke.style.width
      );
      stroke.points.push(snappedPoint, { ...snappedPoint });
      state.strokes.push(stroke);
      interaction = { kind, edge, metrics };
      drawing.updateClearButton();
      drawing.scheduleRender();
    }

    elements.ruler.dataset.interaction = kind;
    runtime.captureActivePointer(event.currentTarget, event, interaction, stroke);
  }

  function continueRulerInteraction(event) {
    if (
      !state.rulerVisible ||
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = runtime.getPagePoint(event);

    if (state.activeInteraction.kind === "ruler-move") {
      rulerState.x =
        state.activeInteraction.startX +
        point.x -
        state.activeInteraction.startPoint.x;
      rulerState.y =
        state.activeInteraction.startY +
        point.y -
        state.activeInteraction.startPoint.y;
      clampRulerToVisiblePage();
      updateRulerPosition();
      return;
    }

    if (state.activeInteraction.kind === "ruler-rotate") {
      let angle =
        Math.atan2(point.y - rulerState.y, point.x - rulerState.x) +
        state.activeInteraction.angleOffset;
      if (event.shiftKey) {
        angle =
          Math.round(angle / TOOL_SNAPPED_ROTATION) *
          TOOL_SNAPPED_ROTATION;
      }
      rulerState.angle = runtime.normalizeAngle(angle);
      updateRulerPosition();
      return;
    }

    if (state.activeInteraction.kind === "ruler-line" && state.activeStroke) {
      state.activeStroke.points[1] = projectPointToRulerEdge(
        point,
        state.activeInteraction.metrics,
        state.activeInteraction.edge,
        state.activeStroke.style?.width
      );
      drawing.scheduleRender();
    }
  }
  function finishRulerInteraction(event) {
    if (
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("ruler-")
    ) {
      return;
    }

    continueRulerInteraction(event);
    const interactionKind = state.activeInteraction.kind;
    const removeSegment =
      interactionKind === "ruler-line" && drawing.isShortSegment(state.activeStroke);
    runtime.endActivePointer({ removeActiveStroke: removeSegment });
    if (interactionKind === "ruler-rotate") {
      clampRulerToVisiblePage();
      updateRulerPosition();
    }
    drawing.scheduleRender();

    if (interactionKind === "ruler-line") {
      elements.status.textContent = removeSegment
        ? "Drag farther along an edge to add a straight line."
        : "Straight line added.";
    } else if (interactionKind === "ruler-rotate") {
      elements.status.textContent =
        `Ruler rotated to ${runtime.getAngleDegrees(rulerState.angle)}°.`;
    } else {
      elements.status.textContent = "Ruler moved.";
    }
  }

  function cancelRulerInteraction(event) {
    if (
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("ruler-")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const removeSegment = state.activeInteraction.kind === "ruler-line";
    const clampRuler = state.activeInteraction.kind === "ruler-rotate";
    runtime.endActivePointer({ removeActiveStroke: removeSegment });
    if (clampRuler) {
      clampRulerToVisiblePage();
      updateRulerPosition();
    }
    drawing.scheduleRender();
  }

  function blockRulerEvent(event) {
    if (!state.rulerVisible) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleRulerMoveKeydown(event) {
    if (!state.rulerVisible) return;
    const distance = event.shiftKey ? 10 : 1;
    const movement = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance]
    }[event.key];
    if (!movement) return;

    event.preventDefault();
    event.stopPropagation();
    rulerState.x += movement[0];
    rulerState.y += movement[1];
    clampRulerToVisiblePage();
    updateRulerPosition();
    elements.status.textContent = "Ruler moved.";
  }

  function handleRulerRotateKeydown(event) {
    if (!state.rulerVisible) return;
    let nextAngle = rulerState.angle;
    if (event.key === "Home") {
      nextAngle = 0;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextAngle -= event.shiftKey
        ? TOOL_SNAPPED_ROTATION
        : TOOL_KEYBOARD_ROTATION;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextAngle += event.shiftKey
        ? TOOL_SNAPPED_ROTATION
        : TOOL_KEYBOARD_ROTATION;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    rulerState.angle = runtime.normalizeAngle(nextAngle);
    clampRulerToVisiblePage();
    updateRulerPosition();
    elements.status.textContent =
      `Ruler rotated to ${runtime.getAngleDegrees(rulerState.angle)}°.`;
  }
  function resetRuler() {
    rulerState.x = null;
    rulerState.y = null;
    rulerState.angle = 0;
    updateRulerPosition();
  }

  context.services.registerModule("ruler", {
    buildRuler,
    clampRulerToVisiblePage,
    placeRulerInView,
    resetRuler,
    updateRulerPosition
  });
})();
