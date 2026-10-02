(() => {
  "use strict";

  const NAMESPACE_KEY = "__maGlassThemeModules";
  const namespace = globalThis[NAMESPACE_KEY];
  if (!namespace) throw new Error("Math Academy Glass context must load first.");
  if (namespace.has("mathEditor")) return;

  const appearance = namespace.require("appearance");
  let mathToolboxFrame;
  let activeMathEditor;

  function getMathEditorWrapper(target) {
    return target instanceof Element
      ? target.closest(".matheditor-wrapper-answer")
      : null;
  }

  function setActiveMathEditor(wrapper) {
    if (!wrapper || wrapper === activeMathEditor) return;
    activeMathEditor?.removeAttribute("data-ma-math-editor-active");
    activeMathEditor = wrapper;
    activeMathEditor.setAttribute("data-ma-math-editor-active", "true");
  }

  function positionMathEditorToolbox() {
    mathToolboxFrame = undefined;
    const toolboxes = [...document.querySelectorAll("#mathEditorToolbox")];
    if (!toolboxes.length) return;

    if (!appearance.isEnabled()) {
      for (const toolbox of toolboxes) {
        toolbox.removeAttribute("data-ma-math-toolbox-positioned");
        toolbox.style.removeProperty("--mag-math-toolbox-left");
        toolbox.style.removeProperty("--mag-math-toolbox-top");
      }
      return;
    }

    if (!activeMathEditor?.isConnected) {
      activeMathEditor = document.querySelector(
        ".matheditor-wrapper-answer .mq-editable-field.mq-focused"
      )?.closest(".matheditor-wrapper-answer");
    }

    if (!activeMathEditor) {
      for (const toolbox of toolboxes) {
        toolbox.removeAttribute("data-ma-math-toolbox-positioned");
        toolbox.style.removeProperty("--mag-math-toolbox-left");
        toolbox.style.removeProperty("--mag-math-toolbox-top");
      }
      return;
    }

    const wrappers = [...document.querySelectorAll(".matheditor-wrapper-answer")];
    const mappedToolbox = toolboxes[wrappers.indexOf(activeMathEditor)];
    const visibleToolboxes = toolboxes.filter(
      (toolbox) => getComputedStyle(toolbox).visibility === "visible"
    );
    const toolbox = visibleToolboxes.length === 1
      ? visibleToolboxes[0]
      : mappedToolbox || visibleToolboxes.at(-1) || toolboxes[0];
    for (const candidate of toolboxes) {
      if (candidate === toolbox) continue;
      candidate.removeAttribute("data-ma-math-toolbox-positioned");
      candidate.style.removeProperty("--mag-math-toolbox-left");
      candidate.style.removeProperty("--mag-math-toolbox-top");
    }

    const editorRect = activeMathEditor.getBoundingClientRect();
    const toolboxRect = toolbox.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 10;
    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - toolboxRect.width - viewportPadding
    );
    const left = Math.min(maxLeft, Math.max(viewportPadding, editorRect.left));
    const below = editorRect.bottom + gap;
    const above = editorRect.top - toolboxRect.height - gap;
    const editorIsOutsideViewport = editorRect.bottom <= 0 ||
      editorRect.top >= window.innerHeight;
    const top = editorIsOutsideViewport
      ? below
      : below + toolboxRect.height <= window.innerHeight - viewportPadding || above < viewportPadding
        ? Math.min(
          Math.max(viewportPadding, below),
          Math.max(viewportPadding, window.innerHeight - toolboxRect.height - viewportPadding)
        )
        : above;

    toolbox.style.setProperty("--mag-math-toolbox-left", `${left}px`);
    toolbox.style.setProperty("--mag-math-toolbox-top", `${top}px`);
    toolbox.setAttribute("data-ma-math-toolbox-positioned", "true");
  }

  function scheduleMathToolboxPosition() {
    if (mathToolboxFrame !== undefined) return;
    mathToolboxFrame = window.setTimeout(positionMathEditorToolbox, 0);
  }

  function startMathEditorEnhancer() {
    document.addEventListener("focusin", (event) => {
      const wrapper = getMathEditorWrapper(event.target);
      if (!wrapper) return;
      setActiveMathEditor(wrapper);
      scheduleMathToolboxPosition();
    });

    document.addEventListener("mousedown", (event) => {
      const wrapper = getMathEditorWrapper(event.target);
      const clickedToolbox = event.target instanceof Element &&
        event.target.closest("#mathEditorToolbox");
      if (wrapper) setActiveMathEditor(wrapper);
      if (wrapper || clickedToolbox) {
        scheduleMathToolboxPosition();
      }
    }, true);

    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("#mathEditorToolbox")) {
        scheduleMathToolboxPosition();
      }
    });

    window.addEventListener("resize", scheduleMathToolboxPosition);
    window.addEventListener("scroll", scheduleMathToolboxPosition, { passive: true });
  }

  namespace.register("mathEditor", {
    positionMathEditorToolbox,
    scheduleMathToolboxPosition,
    startMathEditorEnhancer
  });
})();

