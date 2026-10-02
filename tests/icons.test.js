"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_MATH_ICON_CLASSES = Object.freeze([
  "frac", "sqr", "exp", "sub", "sqrt", "cbrt", "nrt", "abs",
  "gt", "lt", "gte", "lte", "ne", "pm", "times", "cdot", "div",
  "cup", "cap", "null", "infty", "and", "or", "e", "pi",
  "sin", "cos", "tan", "csc", "sec", "cot",
  "asin", "acos", "atan", "acsc", "asec", "acot",
  "ln", "log", "logb",
  "alpha", "beta", "gamma", "theta", "phi", "lambda",
  "sinh", "cosh", "tanh", "csch", "sech", "coth"
]);

test("every Math Academy toolbox icon uses a registered standalone SVG", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const contentScripts = manifest.content_scripts || [];
  const controller = contentScripts
    .flatMap(({ js = [] }) => js)
    .filter((file) => file === "content/theme-controller.js" || file.startsWith("content/theme/"))
    .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n");
  const styles = contentScripts
    .flatMap(({ css = [] }) => css)
    .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n");
  const mappingBlock = controller.match(
    /const MATH_TOOLBOX_ICONS = Object\.freeze\(\[([\s\S]*?)\]\);/
  );

  assert.ok(mappingBlock, "MATH_TOOLBOX_ICONS mapping is present");
  const mappings = [...mappingBlock[1].matchAll(
    /\["([a-z]+)", "([a-z-]+)"\]/g
  )].map(([, iconClass, fileName]) => ({ iconClass, fileName }));

  assert.deepEqual(
    mappings.map(({ iconClass }) => iconClass),
    EXPECTED_MATH_ICON_CLASSES
  );

  for (const { iconClass, fileName } of mappings) {
    const svgPath = path.join(ROOT, `icons/math-${fileName}.svg`);
    const svg = fs.readFileSync(svgPath, "utf8");
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /<\/svg>\s*$/);
    assert.match(
      styles,
      new RegExp(`\\.${iconClass}Icon \\{ --mag-math-tool-icon: var\\(--mag-math-${iconClass}-icon\\); \\}`)
    );
  }

  const resources = manifest.web_accessible_resources.flatMap(({ resources }) => resources);
  assert.ok(resources.includes("icons/math-*.svg"));
  assert.doesNotMatch(styles, /\.gtIcon::before\s*\{\s*content:/);
  assert.doesNotMatch(styles, /\.fracIcon\s*\{[^}]*background-image:\s*linear-gradient/s);
});
