![Math Academy Glass — A calmer space to study. Light and dark themes, drawing and geometry. Open source under MIT; unofficial study companion.](https://raw.githubusercontent.com/yarikleto/math-academy-glass/main/docs/assets/readme-banner.png)

# Math Academy Glass

Math Academy Glass is a free, open-source Chrome Manifest V3 extension that restyles Math
Academy with a calm, macOS-inspired glass interface and adds focused study
tools. Every feature is available immediately and works without creating a
separate account.

Math Academy Glass is an independent, unofficial project. It is not affiliated
with, endorsed by, or sponsored by Math Academy.

[Source code](https://github.com/yarikleto/math-academy-glass) ·
[Report an issue](https://github.com/yarikleto/math-academy-glass/issues) ·
[Privacy policy](PRIVACY.md) · [MIT license](LICENSE)

It supports light, dark, and automatic system appearance, synced through
Chrome storage. The authenticated `/learn` dashboard,
`/courses/*/progress`, and `/topics/*` pages receive route-specific glass
surfaces, controls, menus, and math-editor treatments while preserving the
meaning of progress, completion, and mathematical colors.

The floating study-tools button includes independent freehand drawing, ruler,
protractor, and compass controls. Each tool's settings sit directly under its
own switch and appear only while that tool is on. Drawing offers five
theme-aware pen colors, three line widths, an eraser, snapshot-based undo, and
clear. Marks are painted above the geometry tools so they remain visible.

The ruler is 20 CSS centimeters long with millimeter ticks. The clear-glass
protractor switches between 180° and 360° scales and can create snapped rays,
straight baselines, and arcs while drawing is active. The compass keeps its
radius when its pivot moves, snaps its span to millimeters, and can sweep arcs.
Tool state and drawings stay with the current page and reset after navigation
or reload.

The extension also adds local course-topic counters and task timers. These
values are derived from the current Math Academy page, kept in extension-owned
per-tab session storage, and are not transmitted by the extension.

Tutorial and worked-example cards on task lessons, plus noninteractive
instructional cards on numeric topic reference pages (`/topics/:id`), include a
**Save card as PDF** action. The action prepares only the selected card and
opens Chrome's native print preview, where **Save as PDF** can be chosen. The
extension does not upload or store the card, generate the PDF through a remote
service, or require another Chrome permission for this feature.

## Install in Chrome

Requires Chrome 111 or newer. Learning features require your own Math Academy
account and access to its lessons; this extension does not provide a subscription.

1. Clone this repository, or select **Code → Download ZIP** on GitHub and
   extract it. Keep the folder in a permanent location.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.
6. Open or refresh [Math Academy](https://www.mathacademy.com/).
7. Use the extension popup to choose an appearance or pause the extension.

The page-restyling and study-tool features run only on `mathacademy.com` and
its subdomains. The extension does not require a remote backend and makes no
network requests of its own.

## Controls

- **Light** — bright translucent panels and high-contrast text.
- **System** — follows the operating system appearance.
- **Dark** — deep low-glare panels with softened contrast.
- **On/off switch** — pauses both the custom theme and study tools without
  uninstalling the extension.
- **Keyboard shortcut** — `Command/Ctrl + Shift + L` switches directly between
  light and dark while viewing Math Academy.
- **Study tools button** — opens the in-page tools menu from the lower-right
  corner. The menu stays open until its launcher is clicked again.
- **Pen or eraser** — switches freehand input between drawing and whole-mark
  erasing. `Control/Command + Z` restores erased marks.
- **Pen style** — choose Ink, Blue, Red, Green, or Amber and Fine (1.5 px),
  Regular (2.75 px), or Bold (5 px). Existing marks keep their original style.
- **Ruler** — drag its clear body to move it and its round handle to rotate it.
  Hold `Shift` while rotating to snap to 15° steps. Arrow keys nudge it by 1 px,
  or 10 px with `Shift`.
- **Protractor** — switch between 180° and 360° scales. Drag the clear band to
  move it and the round handle to rotate it. With Draw enabled, the rim and
  opening edges create arcs, the vertex creates rays, and the 180° baseline
  creates straight marks. Readings and marks snap to whole degrees.
- **Compass** — drag the pivot without changing its radius, drag the radius
  knob to set a millimeter-snapped span, and drag the locus while Draw is on to
  sweep an arc.
- **Clear drawing** — removes every mark without changing any tool switch.
- **Save card as PDF** — on a task lesson or numeric topic reference page,
  opens Chrome's print preview with only the selected tutorial, worked example,
  or noninteractive reference card prepared for printing. Choose **Save as
  PDF** to select the filename and destination, or cancel to return to the page
  unchanged.

The ruler uses the browser's standardized CSS centimeter (`1cm = 96px / 2.54`).
Its physical size can vary with display scaling and browser zoom.

## Project layout

- `manifest.json` — extension permissions and entry points.
- `background/storage-controller.js` — validates content-script messages and
  keeps short-lived learning state in extension-owned per-tab session storage.
- `content/theme/` — isolated appearance, session, timer, progress, math-editor,
  card-export, and dashboard modules; `content/theme-controller.js` wires their
  lifecycle.
- `content/tools/` — drawing, ruler, protractor, compass, and menu modules;
  `content/tools-controller.js` handles mounting and page lifecycle.
- `styles/` — numbered, manifest-ordered layers for foundation, routes,
  learning surfaces, reading typography, selected-card printing, and study
  tools. `styles/66-card-export.css` owns the print-isolation layer.
- `popup/` — toolbar popup UI.
- `icons/` — extension artwork.
- `tests/icons.test.js` — icon coverage and manifest-resource checks.
- `tests/release.test.js` — security, manifest, packaged-resource, and release
  ZIP parity checks.
- `ARCHITECTURE.md` — module ownership, dependency direction, and cascade order.
- `PRIVACY.md` — local-data privacy disclosure.
- `CONTRIBUTING.md` — development, design, and testing guidelines.
- `LICENSE` — MIT license for the extension.
- `scripts/package-release.py` — reproducible extension packaging.
- `.github/workflows/validate.yml` — automated tests and release artifacts.

There is no build step. Chrome loads the checked-in source directly. After
changing source files, use the refresh button on the extension card in
`chrome://extensions` and reload Math Academy.

See `ARCHITECTURE.md` for module ownership, dependency direction, and the CSS
cascade contract.

## Validation and packaging

Development tools: Node.js 22+, Python 3, and `unzip`. No dependency install is
needed. Package before running archive-parity tests after source changes.

```sh
rg --files content background popup -g '*.js' -0 | xargs -0 -n1 node --check
python3 scripts/package-release.py
node --test tests/*.test.js
unzip -t math-academy-glass-extension.zip
```

The packaging script uses sorted entries, fixed timestamps and file modes, and
an explicit directory allowlist. It writes `release-metadata.json` with the
version, size, and SHA-256 checksum. CI generates a fresh package, verifies it
against the source, and attaches the release files as workflow artifacts.
Generated ZIPs, local test output, browser profiles, agent configuration, and
publisher-only materials are excluded from Git. The public repository contains
the source and tools needed to build and test the extension.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and bug reports and
[SECURITY.md](SECURITY.md) for private security reports.

## License

Released under the [MIT License](LICENSE). Math Academy's name, trademarks,
website, and lesson content remain the property of their respective owners.
The license covers this extension, not Math Academy's content or services.
