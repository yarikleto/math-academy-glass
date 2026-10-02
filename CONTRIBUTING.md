# Contributing

Use Node.js 22 or newer, Python 3, and `unzip` for validation and packaging.
The extension itself has no dependencies or build step. Load the repository
folder as an unpacked extension in Chrome, then reload the extension and the
Math Academy page after changes.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before editing.

## Appearance and privacy

Preserve the reading-first appearance: near-white glass in light mode, deep
navy in dark mode, restrained shadows, and blue for meaningful interaction.
Reuse the tokens in `styles/00-foundation.css`. Keep theme rules gated by
`html[data-ma-glass-enabled="true"]`, so pausing restores the original site.
Preserve semantic status colors and the fonts and colors of mathematical
renderers. Desktop reading copy uses 17px/1.68; mobile uses 16px/1.64.
Keep the ruler and protractor clear and unblurred so content stays readable.

Test with synthetic content first. Math Academy's public and authenticated
applications have different DOM structures. Access another person's logged-in
browser only with explicit permission. Never copy profiles, credentials,
cookies, or account/lesson data into fixtures, issues, commits, or logs. Close
test browsers and remove their temporary profiles when finished.

## Before opening a pull request

1. Describe the problem, resulting behavior, and how you verified it.
2. Keep permissions, processing, and storage within the documented purpose.
3. Add regression coverage for functional bugs. Use synthetic examples; never
   commit account information, real lessons, answers, cookies, or browser profiles.
4. Check both themes, keyboard interaction, pause/resume, and responsive layout
   for affected controls. Browser fixtures do not prove authenticated-site compatibility.
5. Run `python3 scripts/package-release.py`, then `node --test tests/*.test.js`.
   Check runtime syntax with the command in the README. ZIPs are generated
   locally and by CI; do not commit generated archives or publisher materials.

Only the publisher should advance release versions and tags. Do not publish
packages or upload store assets as part of an ordinary contribution.

## Bug reports

Use [GitHub Issues](https://github.com/yarikleto/math-academy-glass/issues).
Include Chrome version, operating system,
extension version, route type, selected theme, and concise reproduction steps.
Remove names, progress data, lesson content, and account details from screenshots.
Do not share authentication material or use another person's browser session.

For a suspected security issue, follow [SECURITY.md](SECURITY.md).

## Optional browser checks

With Playwright installed in your development environment and its Chromium
browser available, run `node tests/browser-smoke.cjs`. Use `NODE_PATH` if the
package is installed outside this repository. `CHROME_PATH` may point to a local
Chrome executable instead. Each run uses a disposable headless profile, blocks
external requests, and closes its browser in `finally`.

The test uses synthetic content and mocked Chrome APIs, loads all manifest
scripts and styles, and writes screenshots to ignored `test-results/`.
It does not inspect an authenticated session, install the extension, or open
real print preview. Complete those separate publisher checks before release.
