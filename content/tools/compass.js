(() => {
  "use strict";

  // Owns pivot/span geometry and compass interactions. Moving the pivot never
  // mutates the millimetre-snapped radius.

  const context = globalThis.__maGlassStudyTools;
  if (!context || context.modules.compass) return;
  context.services.requireModules(["runtime", "drawing"]);

  const { config, elements, state } = context;
  const runtime = context.modules.runtime;
  const drawing = context.modules.drawing;
  const compassState = Object.seal({
    x: null,
    y: null,
    radius: config.COMPASS_DEFAULT_RADIUS,
    angle: -Math.PI / 4
  });
  const {
    COMPASS_DEFAULT_RADIUS,
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
    COMPASS_SWEEP_ID,
    CSS_PIXELS_PER_CENTIMETER,
    TOOL_CONTROL_ALLOWANCE
  } = config;

  function buildCompass() {
    const namespace = "http://www.w3.org/2000/svg";

    elements.compass = document.createElement("div");
    elements.compass.id = COMPASS_ID;
    elements.compass.hidden = true;
    elements.compass.setAttribute("role", "group");
    elements.compass.setAttribute("aria-label", "Compass");
    elements.compass.setAttribute(
      "title",
      "Drag the pivot to move the compass without losing its span. " +
      "Drag the knob to set the radius."
    );

    // The locus is the circle the pencil would travel: a guide while measuring
    // and the drawable edge once drawing is on.
    const locus = document.createElementNS(namespace, "svg");
    locus.setAttribute("class", "ma-glass-compass-locus");
    locus.setAttribute("viewBox", "-1 -1 2 2");
    locus.setAttribute("aria-hidden", "true");
    locus.setAttribute("preserveAspectRatio", "none");

    elements.compassLocusGuide = document.createElementNS(namespace, "circle");
    elements.compassLocusGuide.setAttribute("class", "ma-glass-compass-locus-guide");
    elements.compassLocusGuide.setAttribute("cx", "0");
    elements.compassLocusGuide.setAttribute("cy", "0");
    elements.compassLocusGuide.setAttribute("r", "1");
    elements.compassLocusGuide.setAttribute("vector-effect", "non-scaling-stroke");

    const locusHit = document.createElementNS(namespace, "circle");
    locusHit.setAttribute("class", "ma-glass-compass-locus-hit");
    locusHit.setAttribute("cx", "0");
    locusHit.setAttribute("cy", "0");
    locusHit.setAttribute("r", "1");
    locusHit.setAttribute("vector-effect", "non-scaling-stroke");
    locusHit.setAttribute("pointer-events", "stroke");
    locusHit.setAttribute("stroke-width", String(COMPASS_LOCUS_HIT_WIDTH));
    // The hit circle precedes the guide so the adjacent-sibling hover rule can
    // brighten the guide without giving the visual stroke pointer events.
    locus.append(locusHit, elements.compassLocusGuide);

    elements.compassPivotControl = document.createElement("button");
    elements.compassPivotControl.id = COMPASS_PIVOT_ID;
    elements.compassPivotControl.type = "button";
    elements.compassPivotControl.setAttribute("aria-label", "Move compass pivot");
    elements.compassPivotControl.setAttribute(
      "title",
      "Drag to move the compass; the radius is kept. Arrow keys move by 1 px; " +
      "hold Shift for 10 px."
    );

    elements.compassRadiusControl = document.createElement("button");
    elements.compassRadiusControl.id = COMPASS_RADIUS_ID;
    elements.compassRadiusControl.type = "button";
    elements.compassRadiusControl.setAttribute("role", "slider");
    elements.compassRadiusControl.setAttribute("aria-label", "Compass radius");
    elements.compassRadiusControl.setAttribute("aria-orientation", "horizontal");
    elements.compassRadiusControl.setAttribute(
      "aria-valuemin",
      (COMPASS_MIN_RADIUS / CSS_PIXELS_PER_CENTIMETER).toFixed(1)
    );
    elements.compassRadiusControl.setAttribute(
      "aria-valuemax",
      (COMPASS_MAX_RADIUS / CSS_PIXELS_PER_CENTIMETER).toFixed(1)
    );
    elements.compassRadiusControl.setAttribute(
      "title",
      "Drag to set the radius; it snaps to millimetres. Arrow keys change it " +
      "by 1 mm, or 1 cm with Shift."
    );

    elements.compassReading = document.createElement("output");
    elements.compassReading.id = COMPASS_READING_ID;
    elements.compassReading.setAttribute("aria-hidden", "true");

    elements.compassSweepReading = document.createElement("output");
    elements.compassSweepReading.id = COMPASS_SWEEP_ID;
    elements.compassSweepReading.setAttribute("aria-hidden", "true");

    elements.compass.append(
      locus,
      elements.compassPivotControl,
      elements.compassRadiusControl,
      elements.compassReading,
      elements.compassSweepReading
    );

    elements.compassPivotControl.addEventListener("pointerdown", (event) => {
      startCompassInteraction(event, "compass-move");
    });
    elements.compassRadiusControl.addEventListener("pointerdown", (event) => {
      startCompassInteraction(event, "compass-radius");
    });
    locusHit.addEventListener("pointerdown", (event) => {
      startCompassInteraction(
        event,
        drawing.canDrawMarks() ? "compass-arc" : "compass-move"
      );
    });
    elements.compass.addEventListener("pointermove", continueCompassInteraction);
    elements.compass.addEventListener("pointerup", finishCompassInteraction);
    elements.compass.addEventListener("pointercancel", cancelCompassInteraction);
    elements.compass.addEventListener("lostpointercapture", cancelCompassInteraction);
    elements.compass.addEventListener("click", blockCompassEvent);
    elements.compass.addEventListener("dblclick", blockCompassEvent);
    elements.compass.addEventListener("contextmenu", blockCompassEvent);
    elements.compassPivotControl.addEventListener("keydown", handleCompassMoveKeydown);
    elements.compassRadiusControl.addEventListener(
      "keydown",
      handleCompassRadiusKeydown
    );
  }
  function snapCompassRadius(radius) {
    const snapped =
      Math.round(radius / COMPASS_MILLIMETRE) * COMPASS_MILLIMETRE;
    return runtime.clampValue(snapped, COMPASS_MIN_RADIUS, COMPASS_MAX_RADIUS);
  }

  function formatCompassRadius(radius = compassState.radius) {
    return `${(radius / CSS_PIXELS_PER_CENTIMETER).toFixed(1)} cm`;
  }

  function getCompassMetrics() {
    return {
      x: compassState.x,
      y: compassState.y,
      radius: compassState.radius,
      angle: compassState.angle
    };
  }

  function getCompassSweep(point, metrics, previousAngle, previousSweep) {
    const angle = Math.atan2(point.y - metrics.y, point.x - metrics.x);
    const sweep = runtime.clampValue(
      previousSweep + runtime.normalizeAngle(angle - previousAngle),
      -Math.PI * 2,
      Math.PI * 2
    );
    return {
      angle,
      degrees: Math.round((sweep * 180) / Math.PI),
      sweep
    };
  }

  function placeCompassInView() {
    const bounds = runtime.getVisiblePageBounds();
    const isOutside =
      Number.isFinite(compassState.x) &&
      Number.isFinite(compassState.y) &&
      (
        compassState.x < bounds.left ||
        compassState.x > bounds.left + bounds.width ||
        compassState.y < bounds.top ||
        compassState.y > bounds.top + bounds.height
      );

    if (
      !Number.isFinite(compassState.x) ||
      !Number.isFinite(compassState.y) ||
      isOutside
    ) {
      compassState.x = bounds.left + bounds.width * 0.42;
      compassState.y = bounds.top + bounds.height * 0.52;
    }
    clampCompassToVisiblePage();
  }

  // Only the pivot has to stay reachable; the circle may run off screen, the
  // same way the protractor's face is allowed to crop.
  function clampCompassToVisiblePage() {
    const bounds = runtime.getVisiblePageBounds();
    const margin = Math.min(TOOL_CONTROL_ALLOWANCE, bounds.width / 2);
    compassState.x = runtime.clampValue(
      compassState.x,
      bounds.left + margin,
      bounds.left + bounds.width - margin
    );
    compassState.y = runtime.clampValue(
      compassState.y,
      bounds.top + Math.min(margin, bounds.height / 2),
      bounds.top + bounds.height - Math.min(margin, bounds.height / 2)
    );
  }

  function updateCompassSweepReading(degrees) {
    if (!elements.compassSweepReading || !elements.compass) return;
    const hasReading = Number.isFinite(degrees);
    elements.compassSweepReading.textContent = hasReading ? `${degrees}°` : "";
    elements.compass.toggleAttribute("data-sweeping", hasReading);
  }

  function updateCompassPosition() {
    if (!elements.compass) return;
    const radiusLabel = formatCompassRadius();
    elements.compassReading.textContent = radiusLabel;
    elements.compassRadiusControl.setAttribute(
      "aria-valuenow",
      (compassState.radius / CSS_PIXELS_PER_CENTIMETER).toFixed(1)
    );
    elements.compassRadiusControl.setAttribute("aria-valuetext", radiusLabel);
    elements.compass.style.setProperty(
      "--ma-compass-radius",
      `${compassState.radius}px`
    );
    elements.compass.style.setProperty("--ma-compass-angle", `${compassState.angle}rad`);

    if (
      !Number.isFinite(compassState.x) ||
      !Number.isFinite(compassState.y)
    ) {
      return;
    }
    const origin = runtime.getLayoutViewportOrigin();
    elements.compass.style.setProperty(
      "--ma-compass-x",
      `${compassState.x - origin.x}px`
    );
    elements.compass.style.setProperty(
      "--ma-compass-y",
      `${compassState.y - origin.y}px`
    );
  }

  function startCompassInteraction(event, kind) {
    if (
      !state.compassVisible ||
      (kind === "compass-arc" && !drawing.canDrawMarks()) ||
      state.activePointerId !== null ||
      !runtime.isPrimaryPointer(event)
    ) {
      return;
    }

    if (kind === "compass-arc") runtime.blurActiveEditorForDrawing();
    event.preventDefault();
    event.stopPropagation();
    updateCompassPosition();
    const point = runtime.getPagePoint(event);
    const metrics = getCompassMetrics();
    let interaction;
    let stroke = null;

    if (kind === "compass-move") {
      interaction = {
        kind,
        startPoint: point,
        startX: compassState.x,
        startY: compassState.y
      };
    } else if (kind === "compass-radius") {
      interaction = { kind };
    } else {
      const startAngle = Math.atan2(point.y - metrics.y, point.x - metrics.x);
      drawing.pushUndoSnapshot();
      stroke = drawing.createStroke("arc");
      stroke.arc = {
        center: { x: metrics.x, y: metrics.y },
        radius: metrics.radius,
        startAngle,
        sweep: 0
      };
      state.strokes.push(stroke);
      interaction = {
        kind,
        metrics,
        startAngle,
        lastAngle: startAngle,
        sweep: 0,
        degrees: 0
      };
      updateCompassSweepReading(0);
      drawing.updateClearButton();
      drawing.scheduleRender();
    }

    elements.compass.dataset.interaction = kind;
    runtime.captureActivePointer(event.currentTarget, event, interaction, stroke);
  }

  function continueCompassInteraction(event) {
    if (
      !state.compassVisible ||
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("compass-")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = runtime.getPagePoint(event);

    if (state.activeInteraction.kind === "compass-move") {
      compassState.x =
        state.activeInteraction.startX + point.x - state.activeInteraction.startPoint.x;
      compassState.y =
        state.activeInteraction.startY + point.y - state.activeInteraction.startPoint.y;
      clampCompassToVisiblePage();
      updateCompassPosition();
      return;
    }

    if (state.activeInteraction.kind === "compass-radius") {
      compassState.radius = snapCompassRadius(
        Math.hypot(point.x - compassState.x, point.y - compassState.y)
      );
      compassState.angle = Math.atan2(
        point.y - compassState.y,
        point.x - compassState.x
      );
      updateCompassPosition();
      return;
    }

    if (!state.activeStroke) return;
    const { angle, degrees, sweep } = getCompassSweep(
      point,
      state.activeInteraction.metrics,
      state.activeInteraction.lastAngle,
      state.activeInteraction.sweep
    );
    state.activeInteraction.lastAngle = angle;
    state.activeInteraction.sweep = sweep;
    state.activeStroke.arc = {
      ...state.activeStroke.arc,
      sweep
    };
    state.activeInteraction.degrees = degrees;
    updateCompassSweepReading(degrees);
    drawing.scheduleRender();
  }

  function isShortCompassArc(stroke) {
    const arc = stroke?.arc;
    if (!arc) return true;
    return Math.abs((arc.sweep * 180) / Math.PI) < COMPASS_MIN_SWEEP;
  }

  function finishCompassInteraction(event) {
    if (
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("compass-")
    ) {
      return;
    }

    continueCompassInteraction(event);
    const interactionKind = state.activeInteraction.kind;
    const sweptDegrees = state.activeInteraction.degrees;
    const removeArc =
      interactionKind === "compass-arc" && isShortCompassArc(state.activeStroke);
    runtime.endActivePointer({ removeActiveStroke: removeArc });
    drawing.scheduleRender();

    if (interactionKind === "compass-arc") {
      if (removeArc) {
        updateCompassSweepReading(null);
        elements.status.textContent = "Swing farther around the circle to draw an arc.";
      } else {
        elements.status.textContent =
          `Arc drawn at radius ${formatCompassRadius()}, ` +
          `${Math.abs(sweptDegrees)}° of sweep.`;
      }
    } else if (interactionKind === "compass-radius") {
      elements.status.textContent = `Compass radius set to ${formatCompassRadius()}.`;
    } else {
      elements.status.textContent =
        `Compass moved; radius kept at ${formatCompassRadius()}.`;
    }
  }

  function cancelCompassInteraction(event) {
    if (
      event.pointerId !== state.activePointerId ||
      !state.activeInteraction?.kind.startsWith("compass-")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const removeArc = state.activeInteraction.kind === "compass-arc";
    runtime.endActivePointer({ removeActiveStroke: removeArc });
    if (removeArc) updateCompassSweepReading(null);
    drawing.scheduleRender();
  }

  function blockCompassEvent(event) {
    if (!state.compassVisible) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleCompassMoveKeydown(event) {
    if (!state.compassVisible) return;
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
    compassState.x += movement[0];
    compassState.y += movement[1];
    clampCompassToVisiblePage();
    updateCompassPosition();
    elements.status.textContent =
      `Compass moved; radius kept at ${formatCompassRadius()}.`;
  }

  function handleCompassRadiusKeydown(event) {
    if (!state.compassVisible) return;
    const step = event.shiftKey
      ? COMPASS_KEYBOARD_RADIUS_STEP * 10
      : COMPASS_KEYBOARD_RADIUS_STEP;
    let nextRadius = compassState.radius;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextRadius -= step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextRadius += step;
    } else if (event.key === "Home") {
      nextRadius = COMPASS_DEFAULT_RADIUS;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    compassState.radius = snapCompassRadius(nextRadius);
    updateCompassPosition();
    elements.status.textContent = `Compass radius set to ${formatCompassRadius()}.`;
  }
  function resetCompass() {
    compassState.x = null;
    compassState.y = null;
    compassState.radius = COMPASS_DEFAULT_RADIUS;
    compassState.angle = -Math.PI / 4;
    updateCompassSweepReading(null);
    updateCompassPosition();
  }

  context.services.registerModule("compass", {
    buildCompass,
    clampCompassToVisiblePage,
    formatCompassRadius,
    placeCompassInView,
    resetCompass,
    updateCompassPosition,
    updateCompassSweepReading
  });
})();
