# Math Academy Glass architecture

Math Academy Glass is a buildless Manifest V3 extension. Chrome loads every
checked-in content script and stylesheet in the exact order declared by
`manifest.json`; there is no generated bundle.

## Composition roots

The two controller files are intentionally small:

- `content/theme-controller.js` wires preferences, theme lifecycle, session
  readiness, global shortcuts, card-export cleanup, and dashboard startup.
- `content/tools-controller.js` mounts the study tools and owns page,
  navigation, viewport, and keyboard lifecycle.

Feature code belongs under `content/theme/` or `content/tools/`. A controller
may coordinate features, but it must not absorb their implementation again.

All files are classic scripts because Chrome does not declare manifest content
scripts as ES modules. Each file therefore runs inside an IIFE and communicates
through one non-enumerable namespace in Chrome's isolated world. Nothing is
injected into the host page's JavaScript world.

## Controller annotations

Both composition roots publish their internal lifecycle version on the page:
`data-ma-glass-controller="1.24"` and
`data-ma-glass-tools-controller="1.24"`. These internal versions advance
together and are independent of the extension's manifest release version.

## Theme subsystem

`content/theme/context.js` creates the private registry. Every later theme
module registers a frozen public API and keeps mutable state inside its own
closure.

| Module | Owns |
| --- | --- |
| `context.js` | Registry, route classification, shared DOM/color helpers, immediate root defaults |
| `extension-state.js` | Runtime safety, background-broker messages, tab-scoped state, legacy privacy migration |
| `appearance.js` | Synced settings, resolved theme, readiness, icon resources, root-state enforcement |
| `math-editor.js` | Active MathQuill editor and toolbox positioning |
| `daily-goal.js` | Goal annotation and its focused observer |
| `task-timer.js` | Current task timer, live display, and persisted timer snapshots |
| `task-completion.js` | Completion summary annotations and one-shot fireworks |
| `course-progress.js` | Topic totals, daily course statistics, and rollover scheduling |
| `card-export.js` | Eligible lesson-card controls, native print preparation, and idempotent cleanup |
| `dashboard.js` | One coalesced dashboard scan and compatibility annotations |

Dependency backedges are callbacks wired by the controller. Feature modules do
not reach into another module's private state.

## Lesson-card print lifecycle

`content/theme/card-export.js` adds a user-initiated export control to two exact
card families. Task lessons use `#steps > .step` with a direct `.tutorial` or
`.example` child. Numeric topic detail routes (`/topics/:id`, with an optional
trailing slash) use `#lessonContent > .step`; a topic step must contain both
`.stepHeader` and `.stepName` and must not contain `.question` or
`.questionWidget`. The control is mounted in `.stepHeader`, and the complete
`.step` is printed. The module does not automatically export reviewed answers,
compatibility-detected surfaces, topic indexes, or arbitrary page surfaces.

The extension does not construct or upload a PDF. Activating the control stages
the live selected card for Chrome's native print preview, where the user may
choose **Save as PDF**. During that print transaction the module temporarily
sets:

- `data-ma-glass-card-printing="true"` on the root element;
- `data-ma-glass-print-target="true"` on the selected card;
- `data-ma-glass-print-ancestor="true"` on the card's ancestor chain;
- `data-ma-glass-print-excluded="true"` on sibling roots pruned from the print
  tree; and
- `data-ma-glass-card-export-control="true"` on extension-owned export
  controls, which are excluded from the printed result.

These attributes are transient DOM state, not storage. Cleanup is idempotent:
after printing or cancellation, and on error, navigation, or extension disable,
the module removes every print marker and restores any temporarily changed page
state. The workflow adds no storage, network activity, backend, or Chrome
permission.

The print stylesheet removes layout boxes from marked ancestors with
`display: contents`, while retaining the body box for the named page size.
Ancestor pseudo-elements are suppressed separately because they are not DOM
siblings and cannot be excluded by the branch markers. This prevents screen
layout and generated decorations from reserving blank PDF pages without
changing the selected card's mathematical renderers or graphics.

## Study-tools subsystem

`content/tools/runtime.js` creates the private tools context. It contains three
explicit registries:

- `config` — frozen constants and static definitions;
- `elements` — mounted extension-owned DOM references;
- `state` — the single page-local pointer transaction plus activation/drawing
  state shared by gesture participants. Instrument positions stay private to
  their ruler, protractor, and compass modules.

Feature behavior is exposed through frozen entries in `modules`. Cross-feature
work goes through those APIs; files do not depend on global lexical bindings.

| Module | Owns |
| --- | --- |
| `runtime.js` | Module registration, pointer transaction, viewport/math helpers, shared configuration |
| `drawing.js` | Marks, undo snapshots, erasing, freehand input, styles, and canvas rendering |
| `ruler.js` | Ruler DOM, placement, edge projection, gestures, and keyboard control |
| `protractor-face.js` | Scale paths, ticks, labels, face rebuilding, and guide paths |
| `protractor.js` | Sweep mode, placement, readings, rays/arcs, gestures, and keyboard control |
| `compass.js` | Pivot/span geometry, placement, locus arcs, gestures, and keyboard control |
| `interface.js` | Launcher, persistent menu, segmented settings, descriptions, and tool-state presentation |

The pointer transaction stays centralized because drawing and all three
instruments can participate in one gesture. Tool state remains page-local and
is never written to Chrome storage or host-page storage.

## Stylesheet cascade

The former stylesheet is split into numbered, contiguous layers. The number is
part of the contract: manifest order preserves the original cascade exactly.

| Range | Responsibility |
| --- | --- |
| `00` | Theme tokens, page foundation, typography, and site chrome |
| `10`–`11` | Task flow, navigation, and legacy menus |
| `20`–`23` | Public marketing routes, navigation, login, recovery, and registration |
| `30` | Shared application components and math-renderer protection |
| `40`–`45` | Authenticated topic/reference and help routes |
| `50` | Settings route |
| `60`–`64` | Dashboard, lessons, math tools, learning content, and overlays |
| `65` | Late reading-comfort overrides |
| `66` | Lesson-card export control and selected-card print isolation |
| `70`–`71` | Geometry instruments and the study-tools interface |

Do not reorder these files or move a rule merely to group similar selectors.
Late route and study-tool rules intentionally override broader rules from
earlier layers, including high-specificity `:is()` selectors. The dedicated
`styles/66-card-export.css` layer follows reading typography so its print-only
tree isolation can override ordinary lesson layout without leaking into screen
layout.

## Change rules

1. Put new behavior in the module that owns its state.
2. Add a small public method when another feature needs that behavior; do not
   add feature representation to the shared state or create another namespace.
3. Wire cross-feature lifecycle in the relevant controller.
4. Keep content modules under 1,300 lines and controllers under 450 lines; the
   release tests enforce both limits.
5. Add new CSS to the narrowest existing layer. Introduce a new numbered layer
   only when it has a distinct cascade responsibility.
6. Update `manifest.json` whenever a module or stylesheet is added or removed.

Run the validation and packaging commands in `README.md` after every source
change.
