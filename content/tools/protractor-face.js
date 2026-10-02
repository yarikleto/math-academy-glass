(() => {
  "use strict";

  // Pure face/scale construction plus the two drawable guide paths. Pointer
  // callbacks resolve the protractor API lazily because the face is its input
  // surface while the protractor owns the gesture state.

  const context = globalThis.__maGlassStudyTools;
  if (!context || context.modules.protractorFace) return;
  context.services.requireModules(["runtime", "drawing"]);

  const { config, elements, state } = context;
  const drawing = context.modules.drawing;
  const {
    PROTRACTOR_ARC_HIT_BIAS,
    PROTRACTOR_ARC_HIT_WIDTH,
    PROTRACTOR_FALLBACK_RADIUS,
    PROTRACTOR_HOLE_RATIO,
    PROTRACTOR_LABEL_BASELINE_GUARD,
    PROTRACTOR_LABEL_GAP,
    PROTRACTOR_LABEL_STEP,
    PROTRACTOR_RIM_INSET,
    PROTRACTOR_TICK_MAJOR,
    PROTRACTOR_TICK_MEDIUM,
    PROTRACTOR_TICK_MINOR
  } = config;

  function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
  }

  // Scale lines, hit targets, and drawing guides must share one exact path.
  // Keeping the 360° ring here prevents the hover guide from falling back to
  // the half-circle geometry used by the 180° instrument.
  function getProtractorRingPath(radius, arcRadius, sweep) {
    const from = roundCoordinate(radius - arcRadius);
    const to = roundCoordinate(radius + arcRadius);
    const roundedRadius = roundCoordinate(arcRadius);
    const arcFlags = sweep === 360 ? "0 1 1" : "0 0 1";
    const firstArc =
      `M${from} ${radius}` +
      `A${roundedRadius} ${roundedRadius} ${arcFlags} ${to} ${radius}`;

    return sweep === 360
      ? `${firstArc}A${roundedRadius} ${roundedRadius} 0 1 1 ${from} ${radius}`
      : firstArc;
  }

  // Local protractor space: the vertex is the origin, 0 degrees points along
  // the baseline to the right, and degrees increase counterclockwise.
  function getProtractorScalePoint(radius, degrees, distance) {
    const radians = (degrees * Math.PI) / 180;
    return {
      x: radius + Math.cos(radians) * distance,
      y: radius - Math.sin(radians) * distance
    };
  }

  // Band geometry, shared by the scale, the labels, and the hit surfaces.
  function getProtractorBand(radius) {
    const holeRadius = radius * PROTRACTOR_HOLE_RATIO;
    return {
      radius,
      holeRadius,
      outerTickBase: radius - PROTRACTOR_RIM_INSET,
      innerTickBase: holeRadius + PROTRACTOR_RIM_INSET,
      outerLabelRadius:
        radius -
        PROTRACTOR_RIM_INSET -
        PROTRACTOR_TICK_MAJOR -
        PROTRACTOR_LABEL_GAP,
      innerLabelRadius:
        holeRadius +
        PROTRACTOR_RIM_INSET +
        PROTRACTOR_TICK_MAJOR +
        PROTRACTOR_LABEL_GAP,
      width: radius - holeRadius
    };
  }

  function getProtractorArcHitRadius(radius, edge) {
    return edge === "inner"
      ? radius * PROTRACTOR_HOLE_RATIO + PROTRACTOR_ARC_HIT_BIAS
      : radius - PROTRACTOR_ARC_HIT_BIAS;
  }

  function createProtractorScale(radius, sweep) {
    const namespace = "http://www.w3.org/2000/svg";
    const band = getProtractorBand(radius);
    const isFull = sweep === 360;
    // Both scales get their own tick ring, read inward from the rim and
    // outward from the hole, so either direction can be read precisely.
    const ticks = {
      outerMinor: [],
      outerMedium: [],
      outerMajor: [],
      innerMinor: [],
      innerMedium: [],
      innerMajor: []
    };

    for (let degree = 0; degree < sweep + (isFull ? 0 : 1); degree += 1) {
      const isMajor = degree % PROTRACTOR_LABEL_STEP === 0;
      const isMedium = !isMajor && degree % 5 === 0;
      const weight = isMajor ? "Major" : isMedium ? "Medium" : "Minor";
      const length = isMajor
        ? PROTRACTOR_TICK_MAJOR
        : isMedium
          ? PROTRACTOR_TICK_MEDIUM
          : PROTRACTOR_TICK_MINOR;

      const outerFrom = getProtractorScalePoint(
        radius,
        degree,
        band.outerTickBase
      );
      const outerTo = getProtractorScalePoint(
        radius,
        degree,
        band.outerTickBase - length
      );
      ticks[`outer${weight}`].push(
        `M${roundCoordinate(outerFrom.x)} ${roundCoordinate(outerFrom.y)}` +
        `L${roundCoordinate(outerTo.x)} ${roundCoordinate(outerTo.y)}`
      );

      const innerFrom = getProtractorScalePoint(
        radius,
        degree,
        band.innerTickBase
      );
      const innerTo = getProtractorScalePoint(
        radius,
        degree,
        band.innerTickBase + length
      );
      ticks[`inner${weight}`].push(
        `M${roundCoordinate(innerFrom.x)} ${roundCoordinate(innerFrom.y)}` +
        `L${roundCoordinate(innerTo.x)} ${roundCoordinate(innerTo.y)}`
      );
    }

    const scale = document.createElementNS(namespace, "svg");
    scale.setAttribute("class", "ma-glass-protractor-scale");
    scale.setAttribute(
      "viewBox",
      `0 0 ${radius * 2} ${isFull ? radius * 2 : radius}`
    );
    scale.setAttribute("aria-hidden", "true");

    const appendPath = (className, data) => {
      const path = document.createElementNS(namespace, "path");
      path.setAttribute("class", className);
      path.setAttribute("d", data);
      scale.append(path);
      return path;
    };

    // In both modes the centre sits at (radius, radius): the vertex of the
    // half disc is the centre of the full disc.
    const ring = (arcRadius) =>
      getProtractorRingPath(radius, arcRadius, sweep);

    appendPath("ma-glass-protractor-arc", ring(radius - 0.5));
    appendPath("ma-glass-protractor-arc", ring(band.holeRadius));
    appendPath("ma-glass-protractor-tick-minor", ticks.outerMinor.join(""));
    appendPath("ma-glass-protractor-tick-medium", ticks.outerMedium.join(""));
    appendPath("ma-glass-protractor-tick-major", ticks.outerMajor.join(""));
    appendPath("ma-glass-protractor-tick-minor", ticks.innerMinor.join(""));
    appendPath("ma-glass-protractor-tick-medium", ticks.innerMedium.join(""));
    appendPath("ma-glass-protractor-tick-major", ticks.innerMajor.join(""));
    // A straight baseline belongs to the 180° instrument only. A 360°
    // protractor is a continuous ring, so its centre must stay free of a
    // horizontal drawing rule.
    if (!isFull) {
      appendPath(
        "ma-glass-protractor-baseline",
        `M1 ${roundCoordinate(radius - 0.5)}H${roundCoordinate(radius * 2 - 1)}`
      );
    }
    if (isFull) {
      // The 90-270 axis, the way a full-circle protractor is cross-ruled.
      appendPath(
        "ma-glass-protractor-plumb",
        `M${radius} 1V${roundCoordinate(radius * 2 - 1)}`
      );
    } else {
      appendPath(
        "ma-glass-protractor-plumb",
        `M${radius} ${roundCoordinate(radius - 6)}` +
        `V${roundCoordinate(radius - 18)}`
      );
    }

    const vertex = document.createElementNS(namespace, "circle");
    vertex.setAttribute("class", "ma-glass-protractor-vertex");
    vertex.setAttribute("cx", String(radius));
    vertex.setAttribute("cy", String(radius));
    vertex.setAttribute("r", "3.25");
    scale.append(vertex);

    return scale;
  }

  // Two rows running in opposite directions, the way a physical protractor is
  // numbered, so either arm of an angle can be read directly.
  function createProtractorLabels(radius, sweep) {
    const labels = document.createElement("span");
    labels.className = "ma-glass-protractor-labels";
    labels.setAttribute("aria-hidden", "true");

    const band = getProtractorBand(radius);
    const rows = [
      {
        distance: band.outerLabelRadius,
        className: "ma-glass-protractor-label-outer"
      },
      {
        distance: band.innerLabelRadius,
        className: "ma-glass-protractor-label-inner"
      }
    ];

    for (const [rowIndex, row] of rows.entries()) {
      for (
        let degree = 0;
        degree < sweep + (sweep === 360 ? 0 : 1);
        degree += PROTRACTOR_LABEL_STEP
      ) {
        const point = getProtractorScalePoint(radius, degree, row.distance);
        const label = document.createElement("span");
        label.className = row.className;
        label.textContent = String(
          rowIndex === 0 ? degree : sweep - degree
        );
        label.style.setProperty(
          "--ma-protractor-label-x",
          `${(point.x / (radius * 2)) * 100}%`
        );
        // Percentages are of the element box, which is twice as tall in 360
        // mode; the baseline guard only applies to the half-disc face.
        const boxHeight = sweep === 360 ? radius * 2 : radius;
        const labelY = sweep === 360
          ? point.y
          : Math.min(point.y, radius - PROTRACTOR_LABEL_BASELINE_GUARD);
        label.style.setProperty(
          "--ma-protractor-label-y",
          `${(labelY / boxHeight) * 100}%`
        );
        labels.append(label);
      }
    }

    return labels;
  }

  function renderProtractorFace() {
    const radius = PROTRACTOR_FALLBACK_RADIUS;
    const sweep = state.protractorSweepDegrees;
    const isFull = sweep === 360;
    const namespace = "http://www.w3.org/2000/svg";
    const band = getProtractorBand(radius);
    const height = isFull ? radius * 2 : radius;

    for (const node of [...state.protractorFaceNodes]) node.remove();
    state.protractorFaceNodes.length = 0;

    // Only the scale band is made of glass. The middle is left open.
    const bandSurface = document.createElement("span");
    bandSurface.className = "ma-glass-protractor-band";
    bandSurface.setAttribute("aria-hidden", "true");

    const surfaces = document.createElementNS(namespace, "svg");
    surfaces.setAttribute("class", "ma-glass-protractor-surfaces");
    surfaces.setAttribute("viewBox", `0 0 ${radius * 2} ${height}`);
    surfaces.setAttribute("aria-hidden", "true");

    const ringPath = (arcRadius) =>
      getProtractorRingPath(radius, arcRadius, sweep);

    // Everything except the two arc edges, the baseline and the vertex simply
    // moves the tool, so it can always be repositioned by grabbing the band.
    // The opening is left out of the fill, so it stays clickable.
    const moveHit = document.createElementNS(namespace, "path");
    moveHit.setAttribute("class", "ma-glass-protractor-move-hit");
    moveHit.setAttribute("pointer-events", "fill");
    moveHit.setAttribute("fill-rule", "evenodd");
    moveHit.setAttribute(
      "d",
      isFull
        ? `${ringPath(radius)}Z${ringPath(band.holeRadius)}Z`
        : `${ringPath(radius)}L${roundCoordinate(radius + band.holeRadius)} ` +
          `${radius}A${roundCoordinate(band.holeRadius)} ` +
          `${roundCoordinate(band.holeRadius)} 0 0 0 ` +
          `${roundCoordinate(radius - band.holeRadius)} ${radius}Z`
    );

    // Arcs are drawn along the band's edges, the way lines are drawn along a
    // ruler's edges: one strip hugs the rim, the other hugs the opening.
    const createArcEdge = (edge, edgeRadius) => {
      const hit = document.createElementNS(namespace, "path");
      hit.setAttribute(
        "class",
        `ma-glass-protractor-arc-edge ma-glass-protractor-arc-edge-${edge}`
      );
      hit.dataset.arcEdge = edge;
      hit.setAttribute("pointer-events", "stroke");
      hit.setAttribute("stroke-width", String(PROTRACTOR_ARC_HIT_WIDTH));
      hit.setAttribute("d", ringPath(edgeRadius));
      hit.addEventListener("pointerdown", (event) => {
        context.modules.protractor.startProtractorInteraction(
          event,
          drawing.canDrawMarks() ? "protractor-arc" : "protractor-move",
          edge
        );
      });
      return hit;
    };

    const createArcGuide = (edge) => {
      const guide = document.createElementNS(namespace, "path");
      guide.setAttribute(
        "class",
        `ma-glass-protractor-arc-guide ma-glass-protractor-arc-guide-${edge}`
      );
      guide.setAttribute("pointer-events", "none");
      return guide;
    };

    const outerHit = createArcEdge(
      "outer",
      getProtractorArcHitRadius(radius, "outer")
    );
    const innerHit = createArcEdge(
      "inner",
      getProtractorArcHitRadius(radius, "inner")
    );
    elements.protractorArcGuides = {
      outer: createArcGuide("outer"),
      inner: createArcGuide("inner")
    };
    surfaces.append(
      moveHit,
      outerHit,
      innerHit,
      elements.protractorArcGuides.outer,
      elements.protractorArcGuides.inner
    );

    // The straight baseline sits above the arc SVG, so it would otherwise hide
    // the round arc caps at exactly 0° and 180°. These invisible caps restore
    // the face-side half of the 30 px hit footprint without extending below
    // the baseline, where the straight-edge guide must keep hover and gesture
    // priority. A full-circle scale is a continuous ring rather than a pair of
    // baseline endpoints, so these caps belong only to the 180° face.
    let endpointHits = null;
    if (!isFull) {
      endpointHits = document.createElementNS(namespace, "svg");
      endpointHits.setAttribute(
        "class",
        "ma-glass-protractor-arc-endpoints"
      );
      endpointHits.setAttribute("viewBox", `0 0 ${radius * 2} ${height}`);
      endpointHits.setAttribute("aria-hidden", "true");

      for (const edge of ["outer", "inner"]) {
        const edgeRadius = getProtractorArcHitRadius(radius, edge);
        for (const startDegrees of [0, 180]) {
          const endpoint = document.createElementNS(namespace, "circle");
          const direction = startDegrees === 0 ? 1 : -1;
          endpoint.setAttribute(
            "class",
            `ma-glass-protractor-arc-endpoint ` +
              `ma-glass-protractor-arc-endpoint-${edge}`
          );
          endpoint.dataset.arcEdge = edge;
          endpoint.dataset.startDegrees = String(startDegrees);
          endpoint.setAttribute(
            "cx",
            String(radius + direction * edgeRadius)
          );
          endpoint.setAttribute("cy", String(radius));
          endpoint.setAttribute(
            "r",
            String(PROTRACTOR_ARC_HIT_WIDTH / 2)
          );
          endpoint.setAttribute("pointer-events", "fill");
          endpoint.addEventListener("pointerdown", (event) => {
            context.modules.protractor.startProtractorInteraction(
              event,
              drawing.canDrawMarks() ? "protractor-arc" : "protractor-move",
              edge,
              startDegrees,
              elements.protractor
            );
          });
          endpointHits.append(endpoint);
        }
      }
    }

    moveHit.addEventListener("pointerdown", (event) => {
      context.modules.protractor.startProtractorInteraction(event, "protractor-move");
    });

    state.protractorFaceNodes.push(
      bandSurface,
      createProtractorScale(radius, sweep),
      createProtractorLabels(radius, sweep),
      surfaces,
      ...(endpointHits ? [endpointHits] : [])
    );
    elements.protractor.prepend(...state.protractorFaceNodes);
    elements.protractor.dataset.sweep = String(sweep);
    elements.protractor.setAttribute(
      "aria-label",
      `${sweep} degree protractor with a dual scale`
    );
    elements.protractor.setAttribute(
      "title",
      `${sweep}° dual scale. Drag the ring to move it. ` +
      "Physical size depends on browser zoom and display scaling."
    );
    updateProtractorArcGuides();
  }
  function updateProtractorArcGuides() {
    if (!elements.protractorArcGuides) return;
    const radius = PROTRACTOR_FALLBACK_RADIUS;
    const metrics = { radius };
    for (const [edge, guide] of Object.entries(elements.protractorArcGuides)) {
      const guideRadius = context.modules.protractor.getProtractorEdgeRadius(
        metrics,
        edge,
        state.selectedDrawingStrokeWidth
      );
      guide.setAttribute(
        "d",
        getProtractorRingPath(
          radius,
          guideRadius,
          state.protractorSweepDegrees
        )
      );
    }
  }

  context.services.registerModule("protractorFace", {
    getProtractorArcHitRadius,
    getProtractorBand,
    getProtractorRingPath,
    getProtractorScalePoint,
    renderProtractorFace,
    updateProtractorArcGuides
  });
})();
