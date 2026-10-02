(() => {
  "use strict";

  // Owns sweep mode, instrument placement, readings, and all protractor mark,
  // move, rotate, pointer, and keyboard interactions.

  const context = globalThis.__maGlassStudyTools;
  if (!context || context.modules.protractor) return;
  context.services.requireModules(["runtime", "drawing", "protractorFace"]);

  const { config, elements, root, state } = context;
  const runtime = context.modules.runtime;
  const drawing = context.modules.drawing;
  const face = context.modules.protractorFace;
  const protractorState = Object.seal({ x: null, y: null, angle: 0 });
  const {
    DEFAULT_DRAWING_STROKE_WIDTH,
    ICONS,
    PROTRACTOR_ANGLE_ID,
    PROTRACTOR_ARC_HIT_WIDTH,
    PROTRACTOR_BASELINE_MARGIN,
    PROTRACTOR_FALLBACK_RADIUS,
    PROTRACTOR_HANDLE_MARGIN,
    PROTRACTOR_HANDLE_REACH,
    PROTRACTOR_HOLE_RATIO,
    PROTRACTOR_ID,
    PROTRACTOR_MIN_ARC_RADIUS,
    PROTRACTOR_RADIUS_CENTIMETERS,
    PROTRACTOR_READING_ID,
    PROTRACTOR_ROTATE_ID,
    PROTRACTOR_VERTEX_ID,
    TOOL_KEYBOARD_ROTATION,
    TOOL_LINE_GAP,
    TOOL_MIN_VISIBLE_SPAN,
    TOOL_SNAPPED_ROTATION
  } = config;

  function getProtractorSweepLabel() {
    return `${state.protractorSweepDegrees}°`;
  }

  function getProtractorOppositeDegrees(degrees) {
    return state.protractorSweepDegrees - degrees;
  }

  function getProtractorIdleDescription() {
    const shape =
      state.protractorSweepDegrees === 360 ? "full-circle" : "half-circle";
    return (
      `Clear ${getProtractorSweepLabel()} ${shape} scale for measuring, ` +
      "rays, and arcs"
    );
  }

  function updateProtractorDescription() {
    if (!elements.protractorDescription) return;
    if (!state.protractorVisible) {
      elements.protractorDescription.textContent = getProtractorIdleDescription();
      return;
    }

    if (!drawing.canDrawMarks()) {
      elements.protractorDescription.textContent =
        state.drawingEnabled
          ? "Move or rotate it; the eraser does not trace its edges"
          : state.protractorSweepDegrees === 360
            ? "Drag the full ring to move it; drawing is off"
            : "Drag the half ring to move it; drawing is off";
      return;
    }

    elements.protractorDescription.textContent =
      state.protractorSweepDegrees === 360
        ? "Trace either full-circle edge; drag the vertex for a ray"
        : "Trace an arc edge or baseline; drag the vertex for a ray";
  }
  function setProtractorSweep(sweep, { announce = true } = {}) {
    const nextSweep = sweep === 360 ? 360 : 180;
    if (nextSweep === state.protractorSweepDegrees) return;
    if (state.activeInteraction?.kind.startsWith("protractor-")) {
      runtime.cancelActivePointer();
    }
    state.protractorSweepDegrees = nextSweep;
    root.dataset.maGlassProtractorSweep = String(nextSweep);
    face.renderProtractorFace();
    for (const option of elements.protractorSweepOptions || []) {
      const selected = Number(option.dataset.sweep) === nextSweep;
      option.setAttribute("aria-pressed", String(selected));
    }
    updateProtractorReading(null);
    updateProtractorDescription();
    if (state.protractorVisible) {
      clampProtractorToVisiblePage();
      updateProtractorPosition();
    }
    if (announce && elements.status) {
      elements.status.textContent = `Protractor scale set to ${getProtractorSweepLabel()}.`;
    }
  }

  function buildProtractor() {
    const radius = PROTRACTOR_FALLBACK_RADIUS;

    elements.protractor = document.createElement("div");
    elements.protractor.id = PROTRACTOR_ID;
    elements.protractor.hidden = true;
    elements.protractor.setAttribute("role", "group");
    elements.protractor.dataset.radiusCentimeters = String(
      PROTRACTOR_RADIUS_CENTIMETERS
    );

    const baselineEdge = document.createElement("span");
    baselineEdge.className = "ma-glass-protractor-edge";
    baselineEdge.setAttribute("aria-hidden", "true");

    elements.protractorVertexControl = document.createElement("button");
    elements.protractorVertexControl.id = PROTRACTOR_VERTEX_ID;
    elements.protractorVertexControl.type = "button";
    elements.protractorVertexControl.setAttribute("aria-label", "Move protractor");
    elements.protractorVertexControl.setAttribute(
      "title",
      "Drag the protractor to move it. Arrow keys move by 1 px; hold Shift " +
      "for 10 px. While drawing, drag out from here for a ray."
    );

    elements.protractorRotateControl = document.createElement("button");
    elements.protractorRotateControl.id = PROTRACTOR_ROTATE_ID;
    elements.protractorRotateControl.type = "button";
    elements.protractorRotateControl.setAttribute("role", "slider");
    elements.protractorRotateControl.setAttribute("aria-label", "Rotate protractor");
    elements.protractorRotateControl.setAttribute("aria-valuemin", "0");
    elements.protractorRotateControl.setAttribute("aria-valuemax", "359");
    elements.protractorRotateControl.setAttribute(
      "title",
      "Drag to rotate around the vertex. Hold Shift to snap to 15 degrees."
    );
    elements.protractorRotateControl.append(runtime.createIcon(ICONS.rotate));

    const connector = document.createElement("span");
    connector.className = "ma-glass-protractor-rotate-connector";
    connector.setAttribute("aria-hidden", "true");

    elements.protractorAngle = document.createElement("output");
    elements.protractorAngle.id = PROTRACTOR_ANGLE_ID;
    elements.protractorAngle.setAttribute("aria-hidden", "true");

    elements.protractorReading = document.createElement("output");
    elements.protractorReading.id = PROTRACTOR_READING_ID;
    elements.protractorReading.setAttribute("aria-hidden", "true");

    elements.protractor.append(
      baselineEdge,
      elements.protractorVertexControl,
      connector,
      elements.protractorRotateControl,
      elements.protractorAngle,
      elements.protractorReading
    );
    face.renderProtractorFace();

    elements.protractorRotateControl.addEventListener("pointerdown", (event) => {
      startProtractorInteraction(event, "protractor-rotate");
    });
    baselineEdge.addEventListener("pointerdown", (event) => {
      if (state.protractorSweepDegrees !== 180) return;
      const endpoint = drawing.canDrawMarks()
        ? getProtractorArcEndpoint(
            runtime.getPagePoint(event),
            getProtractorMetrics()
          )
        : null;
      startProtractorInteraction(
        event,
        endpoint ? "protractor-arc" : "protractor-baseline",
        endpoint?.edge || "outer",
        endpoint?.startDegrees ?? null
      );
    });
    elements.protractorVertexControl.addEventListener("pointerdown", (event) => {
      startProtractorInteraction(
        event,
        drawing.canDrawMarks() ? "protractor-ray" : "protractor-move"
      );
    });
    elements.protractor.addEventListener("pointermove", continueProtractorInteraction);
    elements.protractor.addEventListener("pointerup", finishProtractorInteraction);
    elements.protractor.addEventListener("pointercancel", cancelProtractorInteraction);
    elements.protractor.addEventListener(
      "lostpointercapture",
      cancelProtractorInteraction
    );
    elements.protractor.addEventListener("click", blockProtractorEvent);
    elements.protractor.addEventListener("dblclick", blockProtractorEvent);
    elements.protractor.addEventListener("contextmenu", blockProtractorEvent);
    elements.protractorVertexControl.addEventListener(
      "keydown",
      handleProtractorMoveKeydown
    );
    elements.protractorRotateControl.addEventListener(
      "keydown",
      handleProtractorRotateKeydown
    );
    void radius;
  }
  function getProtractorMetrics() {
    const radius = Math.max(
      1,
      (elements.protractor?.offsetWidth || PROTRACTOR_FALLBACK_RADIUS * 2) / 2
    );
    const cosine = Math.cos(protractorState.angle);
    const sine = Math.sin(protractorState.angle);
    return {
      x: protractorState.x,
      y: protractorState.y,
      angle: protractorState.angle,
      radius,
      // axis runs along the baseline; normal points away from the scale.
      axis: { x: cosine, y: sine },
      normal: { x: -sine, y: cosine }
    };
  }

  // Resolve the small overlap where the baseline's straight-line strip covers
  // an arc cap. The nearest cap wins inside the same radius as the SVG hit
  // stroke, and its side encodes an exact 0° or 180° start.
  function getProtractorArcEndpoint(point, metrics) {
    const offsetX = point.x - metrics.x;
    const offsetY = point.y - metrics.y;
    const along =
      offsetX * metrics.axis.x + offsetY * metrics.axis.y;
    const across =
      offsetX * metrics.normal.x + offsetY * metrics.normal.y;
    // The endpoint caps occupy only the scale side of the baseline. Points on
    // the outside/lower side belong to the straight-edge guide, even when they
    // are within the circular arc-hit tolerance at 0° or 180°.
    if (across > 0) return null;
    const tolerance = PROTRACTOR_ARC_HIT_WIDTH / 2;
    let closest = null;

    for (const edge of ["outer", "inner"]) {
      const edgeRadius = face.getProtractorArcHitRadius(metrics.radius, edge);
      for (const startDegrees of [0, 180]) {
        const direction = startDegrees === 0 ? 1 : -1;
        const distance = Math.hypot(
          along - direction * edgeRadius,
          across
        );
        if (
          distance <= tolerance &&
          (!closest || distance < closest.distance)
        ) {
          closest = { edge, startDegrees, distance };
        }
      }
    }

    return closest;
  }

  function projectPointToProtractorBaseline(
    point,
    metrics,
    strokeWidth = DEFAULT_DRAWING_STROKE_WIDTH
  ) {
    const offsetX = point.x - metrics.x;
    const offsetY = point.y - metrics.y;
    const projection = runtime.clampValue(
      offsetX * metrics.axis.x + offsetY * metrics.axis.y,
      -metrics.radius,
      metrics.radius
    );
    const edgeOffset =
      TOOL_LINE_GAP + drawing.normalizeStrokeWidth(strokeWidth) / 2;
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

  // A ray always starts at the vertex and is snapped to a whole degree so the
  // drawn mark matches the number the student reads off the scale.
  function getProtractorRay(point, metrics) {
    const offsetX = point.x - metrics.x;
    const offsetY = point.y - metrics.y;
    const degrees = getProtractorLocalDegrees(point, metrics);
    const radians = (degrees * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const direction = {
      x: metrics.axis.x * cosine - metrics.normal.x * sine,
      y: metrics.axis.y * cosine - metrics.normal.y * sine
    };
    // The ray is exactly as long as the drag, so a short drag stays a short
    // mark and an accidental tap is discarded as a short segment.
    const length = Math.hypot(offsetX, offsetY);

    return {
      degrees,
      end: {
        x: metrics.x + direction.x * length,
        y: metrics.y + direction.y * length
      }
    };
  }

  // Local degrees map to canvas radians as (protractor angle - degrees),
  // because local degrees increase counterclockwise while canvas y grows down.
  function getProtractorLocalDegrees(point, metrics) {
    const offsetX = point.x - metrics.x;
    const offsetY = point.y - metrics.y;
    const along = offsetX * metrics.axis.x + offsetY * metrics.axis.y;
    const across = offsetX * metrics.normal.x + offsetY * metrics.normal.y;
    const degrees = Math.round((Math.atan2(-across, along) * 180) / Math.PI);
    if (state.protractorSweepDegrees === 360) {
      return ((degrees % 360) + 360) % 360;
    }
    return runtime.clampValue(degrees, 0, 180);
  }

  // The drawn arc rides just outside the traced edge, with the same gap the
  // ruler leaves outside its edges so the new mark stays visible.
  function getProtractorEdgeRadius(
    metrics,
    edge,
    strokeWidth = DEFAULT_DRAWING_STROKE_WIDTH
  ) {
    const offset = TOOL_LINE_GAP + drawing.normalizeStrokeWidth(strokeWidth) / 2;
    if (edge === "inner") {
      return Math.max(
        PROTRACTOR_MIN_ARC_RADIUS,
        metrics.radius * PROTRACTOR_HOLE_RATIO - offset
      );
    }
    return metrics.radius + offset;
  }

  function createProtractorArc(
    metrics,
    startDegrees,
    endDegrees,
    radius,
    sweepDegrees = null
  ) {
    const startAngle = metrics.angle - (startDegrees * Math.PI) / 180;
    const endAngle = metrics.angle - (endDegrees * Math.PI) / 180;
    return {
      center: { x: metrics.x, y: metrics.y },
      radius,
      startAngle,
      sweep: Number.isFinite(sweepDegrees)
        ? (-sweepDegrees * Math.PI) / 180
        : endAngle - startAngle,
      startDegrees,
      endDegrees
    };
  }

  // The body is a half disc above the baseline, so its reach is asymmetric
  // around the vertex. Treating it as a full disc would reserve a whole radius
  // of empty space below the vertex and block the lower part of the viewport.
  function getProtractorBodyExtents(metrics = getProtractorMetrics()) {
    const { radius } = metrics;
    if (state.protractorSweepDegrees === 360) {
      return { up: radius, down: radius, left: radius, right: radius };
    }
    const cosine = Math.cos(metrics.angle);
    const sine = Math.sin(metrics.angle);
    const absCosine = Math.abs(cosine);
    const absSine = Math.abs(sine);

    return {
      up: cosine >= 0 ? radius : radius * absSine,
      down: cosine <= 0 ? radius : radius * absSine,
      right: sine >= 0 ? radius : radius * absCosine,
      left: sine <= 0 ? radius : radius * absCosine
    };
  }

  // Body reach plus whatever room the rotate handle needs on its own side.
  // Only a slice of the face has to stay on screen: the vertex is what the
  // student aligns, so requiring the whole dome would make figures near an
  // edge unreachable. The face is allowed to crop instead.
  function getProtractorReachExtents(metrics = getProtractorMetrics()) {
    const body = getProtractorBodyExtents(metrics);
    const reach = metrics.radius + PROTRACTOR_HANDLE_REACH;
    const handleX = metrics.axis.x * reach;
    const handleY = metrics.axis.y * reach;
    const face = (extent) => Math.min(extent, TOOL_MIN_VISIBLE_SPAN);

    return {
      up: Math.max(face(body.up), -handleY + PROTRACTOR_HANDLE_MARGIN),
      down: Math.max(
        face(body.down),
        handleY + PROTRACTOR_HANDLE_MARGIN,
        PROTRACTOR_BASELINE_MARGIN
      ),
      right: Math.max(face(body.right), handleX + PROTRACTOR_HANDLE_MARGIN),
      left: Math.max(face(body.left), -handleX + PROTRACTOR_HANDLE_MARGIN)
    };
  }

  function placeProtractorInView({ recenterControls = false } = {}) {
    const bounds = runtime.getVisiblePageBounds();
    const metrics = getProtractorMetrics();
    const bodyExtents = getProtractorBodyExtents(metrics);
    const controlsOutside =
      recenterControls &&
      runtime.isControlOutsideBounds(elements.protractorRotateControl, bounds);
    const isOutside =
      Number.isFinite(protractorState.x) &&
      Number.isFinite(protractorState.y) &&
      (
        protractorState.x + bodyExtents.right < bounds.left ||
        protractorState.x - bodyExtents.left > bounds.left + bounds.width ||
        protractorState.y + bodyExtents.down < bounds.top ||
        protractorState.y - bodyExtents.up > bounds.top + bounds.height
      );

    if (
      !Number.isFinite(protractorState.x) ||
      !Number.isFinite(protractorState.y) ||
      isOutside ||
      controlsOutside
    ) {
      protractorState.x = bounds.left + bounds.width / 2;
      protractorState.y =
        bounds.top +
        bounds.height * (state.protractorSweepDegrees === 360 ? 0.5 : 0.72);
    }
    clampProtractorToVisiblePage();
  }

  function clampProtractorToVisiblePage() {
    const bounds = runtime.getVisiblePageBounds();
    const reach = getProtractorReachExtents();

    protractorState.x = runtime.clampToolAxisSided(
      protractorState.x,
      bounds.left,
      bounds.width,
      reach.left,
      reach.right
    );
    protractorState.y = runtime.clampToolAxisSided(
      protractorState.y,
      bounds.top,
      bounds.height,
      reach.up,
      reach.down
    );
  }

  function updateProtractorReading(degrees, { dual = true } = {}) {
    if (!elements.protractorReading || !elements.protractor) return;
    const hasReading = Number.isFinite(degrees);
    const opposite = getProtractorOppositeDegrees(degrees);
    elements.protractorReading.textContent = hasReading
      ? dual
        ? `${degrees}° · ${opposite}°`
        : `${degrees}°`
      : "";
    elements.protractor.toggleAttribute("data-reading", hasReading);
  }

  function updateProtractorPosition() {
    if (!elements.protractor) return;
    // The readout tracks rotation even before the vertex has been placed, so a
    // reset tool never shows a stale angle when it is opened again.
    const degrees = runtime.getAngleDegrees(protractorState.angle);
    elements.protractorAngle.textContent = `${degrees}°`;
    elements.protractorRotateControl.setAttribute("aria-valuenow", String(degrees));
    elements.protractorRotateControl.setAttribute(
      "aria-valuetext",
      `${degrees} degrees`
    );

    if (
      !Number.isFinite(protractorState.x) ||
      !Number.isFinite(protractorState.y)
    ) {
      return;
    }
    const origin = runtime.getLayoutViewportOrigin();
    elements.protractor.style.setProperty(
      "--ma-protractor-x",
      `${protractorState.x - origin.x}px`
    );
    elements.protractor.style.setProperty(
      "--ma-protractor-y",
      `${protractorState.y - origin.y}px`
    );
    elements.protractor.style.setProperty(
      "--ma-protractor-angle",
      `${protractorState.angle}rad`
    );
  }

  function startProtractorInteraction(
    event,
    kind,
    edge = "outer",
    forcedArcStartDegrees = null,
    pointerTarget = null
  ) {
    const needsDrawing = runtime.isMarkInteraction(kind);
    if (
      !state.protractorVisible ||
      (needsDrawing && !drawing.canDrawMarks()) ||
      state.activePointerId !== null ||
      !runtime.isPrimaryPointer(event)
    ) {
      return;
    }

    if (needsDrawing) runtime.blurActiveEditorForDrawing();
    event.preventDefault();
    event.stopPropagation();
    if (kind === "protractor-move" || kind === "protractor-rotate") {
      updateProtractorReading(null);
    }
    updateProtractorPosition();
    const point = runtime.getPagePoint(event);
    const metrics = getProtractorMetrics();
    let interaction;
    let stroke = null;

    if (kind === "protractor-move") {
      interaction = {
        kind,
        startPoint: point,
        startX: protractorState.x,
        startY: protractorState.y
      };
    } else if (kind === "protractor-rotate") {
      interaction = {
        kind,
        angleOffset:
          protractorState.angle -
          Math.atan2(
            point.y - protractorState.y,
            point.x - protractorState.x
          )
      };
    } else if (kind === "protractor-baseline") {
      drawing.pushUndoSnapshot();
      stroke = drawing.createStroke("segment");
      const snappedPoint = projectPointToProtractorBaseline(
        point,
        metrics,
        stroke.style.width
      );
      stroke.points.push(snappedPoint, { ...snappedPoint });
      state.strokes.push(stroke);
      interaction = { kind, metrics };
      drawing.updateClearButton();
      drawing.scheduleRender();
    } else if (kind === "protractor-ray") {
      drawing.pushUndoSnapshot();
      stroke = drawing.createStroke("segment");
      const ray = getProtractorRay(point, metrics);
      stroke.points.push({ x: metrics.x, y: metrics.y }, ray.end);
      state.strokes.push(stroke);
      interaction = { kind, metrics, degrees: ray.degrees };
      updateProtractorReading(ray.degrees);
      drawing.updateClearButton();
      drawing.scheduleRender();
    } else {
      const startDegrees = Number.isFinite(forcedArcStartDegrees)
        ? forcedArcStartDegrees
        : getProtractorLocalDegrees(point, metrics);
      // The radius comes from the traced edge, so the arc keeps a constant
      // curve while the sweep follows the pointer.
      drawing.pushUndoSnapshot();
      stroke = drawing.createStroke("arc");
      const arcRadius = getProtractorEdgeRadius(
        metrics,
        edge,
        stroke.style.width
      );
      stroke.arc = createProtractorArc(
        metrics,
        startDegrees,
        startDegrees,
        arcRadius
      );
      state.strokes.push(stroke);
      interaction = {
        kind,
        metrics,
        edge,
        startDegrees,
        arcRadius,
        lastDegrees: startDegrees,
        sweepDegrees: 0,
        degrees: 0
      };
      updateProtractorReading(0, { dual: false });
      drawing.updateClearButton();
      drawing.scheduleRender();
    }

    elements.protractor.dataset.interaction = kind;
    if (kind === "protractor-arc") {
      elements.protractor.dataset.arcEdge = edge;
    } else {
      delete elements.protractor.dataset.arcEdge;
    }
    runtime.captureActivePointer(
      pointerTarget || event.currentTarget,
      event,
      interaction,
      stroke
    );
  }

  function continueProtractorInteraction(event) {
    if (
      !state.protractorVisible ||
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("protractor-")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = runtime.getPagePoint(event);

    if (state.activeInteraction.kind === "protractor-move") {
      protractorState.x =
        state.activeInteraction.startX + point.x - state.activeInteraction.startPoint.x;
      protractorState.y =
        state.activeInteraction.startY + point.y - state.activeInteraction.startPoint.y;
      clampProtractorToVisiblePage();
      updateProtractorPosition();
      return;
    }

    if (state.activeInteraction.kind === "protractor-rotate") {
      let angle =
        Math.atan2(
          point.y - protractorState.y,
          point.x - protractorState.x
        ) + state.activeInteraction.angleOffset;
      if (event.shiftKey) {
        angle =
          Math.round(angle / TOOL_SNAPPED_ROTATION) * TOOL_SNAPPED_ROTATION;
      }
      protractorState.angle = runtime.normalizeAngle(angle);
      updateProtractorPosition();
      return;
    }

    if (!state.activeStroke) return;

    if (state.activeInteraction.kind === "protractor-baseline") {
      state.activeStroke.points[1] = projectPointToProtractorBaseline(
        point,
        state.activeInteraction.metrics,
        state.activeStroke.style?.width
      );
      drawing.scheduleRender();
      return;
    }

    if (state.activeInteraction.kind === "protractor-arc") {
      const endDegrees = getProtractorLocalDegrees(
        point,
        state.activeInteraction.metrics
      );
      if (state.protractorSweepDegrees === 360) {
        state.activeInteraction.sweepDegrees = runtime.clampValue(
          state.activeInteraction.sweepDegrees +
            runtime.getWrappedDegreeDelta(endDegrees, state.activeInteraction.lastDegrees),
          -360,
          360
        );
        state.activeInteraction.lastDegrees = endDegrees;
      }
      state.activeStroke.arc = createProtractorArc(
        state.activeInteraction.metrics,
        state.activeInteraction.startDegrees,
        endDegrees,
        state.activeInteraction.arcRadius,
        state.protractorSweepDegrees === 360
          ? state.activeInteraction.sweepDegrees
          : null
      );
      state.activeInteraction.degrees = Math.abs(
        state.protractorSweepDegrees === 360
          ? state.activeInteraction.sweepDegrees
          : endDegrees - state.activeInteraction.startDegrees
      );
      updateProtractorReading(state.activeInteraction.degrees, { dual: false });
      drawing.scheduleRender();
      return;
    }

    const ray = getProtractorRay(point, state.activeInteraction.metrics);
    state.activeStroke.points[1] = ray.end;
    state.activeInteraction.degrees = ray.degrees;
    updateProtractorReading(ray.degrees);
    drawing.scheduleRender();
  }

  function finishProtractorInteraction(event) {
    if (
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("protractor-")
    ) {
      return;
    }

    continueProtractorInteraction(event);
    const interactionKind = state.activeInteraction.kind;
    const markDegrees = state.activeInteraction.degrees;
    const removeSegment =
      runtime.isMarkInteraction(interactionKind) && drawing.isShortMark(state.activeStroke);
    runtime.endActivePointer({ removeActiveStroke: removeSegment });
    if (interactionKind === "protractor-rotate") {
      clampProtractorToVisiblePage();
      updateProtractorPosition();
    }
    drawing.scheduleRender();

    if (interactionKind === "protractor-baseline") {
      elements.status.textContent = removeSegment
        ? "Drag farther along the baseline to add a straight line."
        : "Straight line added along the protractor baseline.";
    } else if (interactionKind === "protractor-ray") {
      if (removeSegment) {
        updateProtractorReading(null);
        elements.status.textContent = "Drag out from the vertex to draw a ray.";
      } else {
        elements.status.textContent =
          `Ray drawn at ${markDegrees}° on the outer scale, ` +
          `${getProtractorOppositeDegrees(markDegrees)}° on the inner scale.`;
      }
    } else if (interactionKind === "protractor-arc") {
      if (removeSegment) {
        updateProtractorReading(null);
        elements.status.textContent = "Drag farther along the edge to sweep an angle.";
      } else {
        elements.status.textContent = `Angle arc drawn across ${markDegrees}°.`;
      }
    } else if (interactionKind === "protractor-rotate") {
      elements.status.textContent =
        `Protractor rotated to ${runtime.getAngleDegrees(protractorState.angle)}°.`;
    } else {
      updateProtractorReading(null);
      elements.status.textContent = "Protractor moved.";
    }
  }

  function cancelProtractorInteraction(event) {
    if (
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("protractor-")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const interactionKind = state.activeInteraction.kind;
    const removeSegment = runtime.isMarkInteraction(interactionKind);
    runtime.endActivePointer({ removeActiveStroke: removeSegment });
    if (
      interactionKind === "protractor-ray" ||
      interactionKind === "protractor-arc"
    ) {
      updateProtractorReading(null);
    }
    if (interactionKind === "protractor-rotate") {
      clampProtractorToVisiblePage();
      updateProtractorPosition();
    }
    drawing.scheduleRender();
  }

  function blockProtractorEvent(event) {
    if (!state.protractorVisible) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleProtractorMoveKeydown(event) {
    if (!state.protractorVisible) return;
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
    protractorState.x += movement[0];
    protractorState.y += movement[1];
    clampProtractorToVisiblePage();
    updateProtractorPosition();
    updateProtractorReading(null);
    elements.status.textContent = "Protractor moved.";
  }

  function handleProtractorRotateKeydown(event) {
    if (!state.protractorVisible) return;
    let nextAngle = protractorState.angle;
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
    protractorState.angle = runtime.normalizeAngle(nextAngle);
    clampProtractorToVisiblePage();
    updateProtractorPosition();
    updateProtractorReading(null);
    elements.status.textContent =
      `Protractor rotated to ${runtime.getAngleDegrees(protractorState.angle)}°.`;
  }
  function resetProtractor() {
    protractorState.x = null;
    protractorState.y = null;
    protractorState.angle = 0;
    updateProtractorReading(null);
    updateProtractorPosition();
  }

  context.services.registerModule("protractor", {
    buildProtractor,
    clampProtractorToVisiblePage,
    getProtractorArcEndpoint,
    getProtractorEdgeRadius,
    getProtractorIdleDescription,
    getProtractorOppositeDegrees,
    placeProtractorInView,
    resetProtractor,
    setProtractorSweep,
    startProtractorInteraction,
    updateProtractorDescription,
    updateProtractorPosition,
    updateProtractorReading
  });
})();
