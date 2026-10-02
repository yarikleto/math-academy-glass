// Optional browser QA: NODE_PATH=/path/to/playwright/node_modules node tests/browser-smoke.cjs
// Uses synthetic content and mocked extension APIs, never a signed-in profile.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json")));
const output = path.join(ROOT, "test-results");
fs.mkdirSync(output, { recursive: true });
const scripts = manifest.content_scripts.flatMap(entry => entry.js);
const css = manifest.content_scripts.flatMap(entry => entry.css);
const origin = "https://www.mathacademy.com";
const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic QA</title>
<style>body{margin:0;background:white;font:16px Arial}#steps{max-width:820px;margin:80px auto;padding:24px}
.step{margin-bottom:24px;padding:24px;border:1px solid #ddd;background:white}.stepHeader{display:flex;align-items:center;gap:16px}
.tutorialContent{padding-top:20px}.MathJax{font-family:"Times New Roman"}svg{max-width:100%}
.mq-math-mode{display:inline-block;font-family:"Times New Roman";font-size:42px;line-height:1}.mq-math-mode .mq-non-leaf,.mq-math-mode .mq-scaled{display:inline-block}
.mq-math-mode .mq-fraction{display:inline-block;padding:0 .2em;font-size:90%;text-align:center;vertical-align:-.4em}.mq-math-mode .mq-numerator,.mq-math-mode .mq-denominator{display:block}.mq-math-mode .mq-denominator{width:100%;border-top:1px solid;float:right;padding:.1em}
.mq-math-mode .mq-paren{padding:0 .1em;vertical-align:top;transform-origin:center .06em}.mq-math-mode .mq-supsub{display:inline-block;font-size:90%;vertical-align:-.5em}.mq-math-mode .mq-supsub.mq-sup-only{vertical-align:.5em}.mq-math-mode .mq-supsub.mq-sup-only .mq-sup{display:inline-block;vertical-align:text-bottom}.mq-math-mode .mq-supsub .mq-sub{display:block;float:left}
@media(max-width:760px){#steps{margin:20px auto;padding:16px}.step{padding:16px}}</style>
${css.map(file => `<link rel="stylesheet" href="/${file}">`).join("")}
${scripts.map(file => `<script src="/${file}" defer></script>`).join("")}</head><body>
<main id="steps"><section class="step"><div class="questionWidget"><div class="questionWidget-header"><span class="questionWidget-title">Question 1</span></div>
<div class="questionWidget-calculatorInstructions">A graphing calculator is required to answer this question.</div>
<div class="questionWidget-body"><div class="questionWidget-text">Compare the sequence with <span class="MathJax">aₙ₊₂ = aₙ₊₁ + aₙ</span>.</div></div></div></section>
<section class="step"><div class="stepHeader"><span class="stepName">Explore a circle</span></div>
<div class="tutorial"><div class="tutorialContent">Move the compass pivot while keeping its radius. Use the ruler and protractor to compare lengths and angles.
<p>For a circle of radius <span class="MathJax">r</span>, the area is <span class="MathJax">A = πr²</span>.</p>
<svg width="500" height="180" viewBox="0 0 500 180" aria-label="Synthetic circle diagram"><circle cx="220" cy="90" r="65" fill="none" stroke="#198866" stroke-width="2"/><path d="M220 90h65" stroke="#0a74d9" stroke-width="2"/><text x="245" y="80" fill="currentColor">r</text></svg>
</div></div></section><section class="step"><div class="stepHeader"><span class="stepName">Practice</span></div><div class="question"><div class="questionText">Write your own expression.</div>
<div id="math-editor-fixture" class="matheditor-wrapper-answer" data-ma-math-editor-active="true"><div class="mq-editable-field mq-math-mode"><span class="mq-root-block"><span>9</span><span class="mq-binary-operator">·</span><span class="mq-non-leaf"><span class="mq-scaled mq-paren" style="transform:scale(1.2,2.44444)">(</span><span class="mq-non-leaf"><span class="mq-fraction mq-non-leaf"><span class="mq-numerator"><span>3</span></span><span class="mq-denominator"><span>10</span></span><span style="display:inline-block;width:0">&#8203;</span></span></span><span class="mq-scaled mq-paren" style="transform:scale(1.2,2.44444)">)</span></span><span class="mq-supsub mq-non-leaf mq-sup-only"><span class="mq-sup"><var>n</var><span class="mq-binary-operator">−</span><span>1</span></span></span></span></div></div>
<div id="math-editor-subscript-fixture" class="matheditor-wrapper-answer" data-ma-math-editor-active="true"><div class="mq-editable-field mq-math-mode"><span class="mq-root-block"><span class="mq-non-leaf"><span class="mq-scaled mq-paren" style="transform:scale(1.2,2.44444)">(</span><span class="mq-non-leaf"><span class="mq-fraction mq-non-leaf"><span class="mq-numerator"><span>3</span></span><span class="mq-denominator"><span>10</span></span><span style="display:inline-block;width:0">&#8203;</span></span></span><span class="mq-scaled mq-paren" style="transform:scale(1.2,2.44444)">)</span></span><span class="mq-supsub mq-non-leaf"><span class="mq-sub"><var>n</var><span class="mq-binary-operator">−</span><span>1</span></span><span style="display:inline-block;width:0">&#8203;</span></span></span></div></div>
<span id="simple-power-fixture" class="mq-math-mode"><var>x</var><span class="mq-supsub mq-non-leaf mq-sup-only"><span class="mq-sup">2</span></span></span><span id="simple-subscript-fixture" class="mq-math-mode"><var>a</var><span class="mq-supsub mq-non-leaf"><span class="mq-sub"><var>n</var></span><span style="display:inline-block;width:0">&#8203;</span></span></span></div></section></main></body></html>`;

const completionFixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic completion QA</title>
<style>body{margin:0;background:white;font:16px Arial}#finalScreen{max-width:780px;margin:80px auto;padding:48px}
#finalScreen-completionMessage::before{background-clip:content-box}</style>
${css.map(file => `<link rel="stylesheet" href="/${file}">`).join("")}
${scripts.map(file => `<script src="/${file}" defer></script>`).join("")}</head><body>
<main id="finalScreen"><div id="finalScreen-completionMessage" style="color:green">Congratulations! You've completed the lesson.</div>
<div id="finalScreen-pointsMessage">You've been awarded all of the task's 10 XP.</div><hr>
<div id="finalScreen-buttonBar"><a id="finalScreen-doneButton" href="/learn">Done</a></div></main></body></html>`;

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const errors = [];
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/learn") return route.fulfill({ contentType: "text/html", body: fixture });
      if (url.pathname === "/learn/completion") return route.fulfill({ contentType: "text/html", body: completionFixture });
      const file = path.resolve(ROOT, `.${url.pathname}`);
      if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file)) return route.abort();
      const type = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".html": "text/html", ".png": "image/png" }[path.extname(file)];
      await route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });
    await context.addInitScript(() => {
      const settings = { enabled: true, theme: "light" };
      const listeners = [];
      window.chrome = {
        runtime: { getURL: file => `${location.origin}/${file}`, lastError: null,
          sendMessage: (_message, callback) => callback({ ok: true, state: { taskTimer: null, topicStates: {} } }) },
        storage: { sync: {
          get: (_defaults, callback) => callback({ ...settings }),
          set(patch, callback) {
            const changes = Object.fromEntries(Object.entries(patch).map(([key, newValue]) => [key, { newValue }]));
            Object.assign(settings, patch);
            for (const listener of listeners) listener(changes, "sync");
            callback?.();
          }
        }, local: { clear: callback => callback() }, onChanged: { addListener: listener => listeners.push(listener) } }
      };
      window.print = () => {
        window.printSnapshot = {
          targets: document.querySelectorAll('[data-ma-glass-print-target="true"]').length,
          printing: document.documentElement.dataset.maGlassCardPrinting
        };
      };
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/learn`);
    await page.waitForSelector('html[data-ma-glass-ready="true"]');
    await page.waitForSelector('#ma-glass-study-tools-launcher');
    assert.equal(await page.locator('[data-ma-glass-card-export-control="true"]').count(), 1);
    const structuredPower = await page.locator('#math-editor-fixture').evaluate(editor => {
      const exponent = editor.querySelector('.mq-root-block > .mq-supsub');
      return {
        fontSize: getComputedStyle(exponent).fontSize,
        verticalAlign: getComputedStyle(exponent).verticalAlign
      };
    });
    assert.ok(Math.abs(parseFloat(structuredPower.verticalAlign) / parseFloat(structuredPower.fontSize) - 1) < 0.05);
    const ordinaryPowerRatio = await page.locator('#simple-power-fixture .mq-supsub').evaluate(element => {
      const style = getComputedStyle(element);
      return parseFloat(style.verticalAlign) / parseFloat(style.fontSize);
    });
    assert.ok(Math.abs(ordinaryPowerRatio - 0.5) < 0.05);
    const structuredSubscript = await page.locator('#math-editor-subscript-fixture').evaluate(editor => {
      const subscript = editor.querySelector('.mq-root-block > .mq-supsub');
      return {
        fontSize: getComputedStyle(subscript).fontSize,
        verticalAlign: getComputedStyle(subscript).verticalAlign
      };
    });
    assert.ok(Math.abs(parseFloat(structuredSubscript.verticalAlign) / parseFloat(structuredSubscript.fontSize) + 1) < 0.05);
    const ordinarySubscriptRatio = await page.locator('#simple-subscript-fixture .mq-supsub').evaluate(element => {
      const style = getComputedStyle(element);
      return parseFloat(style.verticalAlign) / parseFloat(style.fontSize);
    });
    assert.ok(Math.abs(ordinarySubscriptRatio + 0.5) < 0.05);
    results.push("structured MathQuill scripts align with tall-base edges without moving ordinary powers or subscripts");
    await page.locator('[data-ma-glass-card-export-control="true"]').click();
    assert.deepEqual(await page.evaluate(() => window.printSnapshot), { targets: 1, printing: "true" });
    assert.equal(await page.locator('[data-ma-glass-print-target]').count(), 0);
    assert.equal(await page.title(), "Synthetic QA");
    results.push("eligible-card discovery, print staging and cleanup");

    const launcher = page.locator('#ma-glass-study-tools-launcher');
    await launcher.click();
    const toggleIds = await page.locator('[id^="ma-glass-"][aria-pressed]').evaluateAll(elements => elements.map(e => e.id).filter(id => /toggle$/.test(id)));
    assert.equal(toggleIds.length, 4);
    for (let mask = 0; mask < 16; mask++) {
      for (let index = 0; index < toggleIds.length; index++) {
        const toggle = page.locator(`#${toggleIds[index]}`);
        const desired = Boolean(mask & (1 << index));
        if ((await toggle.getAttribute("aria-pressed") === "true") !== desired) await toggle.click();
        assert.equal(await toggle.getAttribute("aria-pressed"), String(desired));
      }
      assert.equal(await launcher.getAttribute("aria-expanded"), "true");
    }
    results.push("all sixteen tool combinations; menu remains open");
    await page.keyboard.press("Escape");
    for (const id of toggleIds) assert.equal(await page.locator(`#${id}`).getAttribute("aria-pressed"), "false");
    await page.locator('#ma-glass-draw-toggle').click();
    const hasMarks = () => page.evaluate(() => __maGlassStudyTools.modules.drawing.hasMarks());
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(600, 300, { steps: 10 });
    await page.mouse.up();
    assert.equal(await hasMarks(), true);
    await page.locator('[data-draw-mode="eraser"]').click();
    await page.mouse.move(500, 280);
    await page.mouse.down();
    await page.mouse.move(500, 320, { steps: 5 });
    await page.mouse.up();
    assert.equal(await hasMarks(), false);
    await page.keyboard.press("ControlOrMeta+z");
    assert.equal(await hasMarks(), true);
    await page.locator('#ma-glass-drawing-clear').click();
    assert.equal(await hasMarks(), false);
    await page.keyboard.press("ControlOrMeta+z");
    assert.equal(await hasMarks(), true);
    await page.keyboard.press("Escape");
    results.push("real pointer freehand, whole-stroke eraser, undo erase and undo clear");
    await launcher.click();

    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => chrome.storage.sync.set({ theme }), theme);
      await page.waitForTimeout(250); // Wait past the material/color transition.
      const typography = await page.locator('.tutorialContent').evaluate(e => {
        const s = getComputedStyle(e); return { size: s.fontSize, leading: s.lineHeight };
      });
      assert.deepEqual(typography, { size: "17px", leading: "28.56px" });
      const calculatorNote = await page.locator('.questionWidget-calculatorInstructions').evaluate(e => {
        const s = getComputedStyle(e); return {
          size: s.fontSize,
          leading: s.lineHeight,
          color: s.color,
          background: s.backgroundColor,
          marginBottom: s.marginBottom
        };
      });
      assert.equal(calculatorNote.size, "13px");
      assert.equal(calculatorNote.leading, "18.85px");
      assert.equal(calculatorNote.background, "rgba(0, 0, 0, 0)");
      assert.equal(calculatorNote.marginBottom, "22px");
      assert.match(await page.locator('.MathJax').first().evaluate(e => getComputedStyle(e).fontFamily), /Times New Roman/);
      await page.screenshot({ path: path.join(output, `lesson-${theme}.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator('.tutorialContent').evaluate(e => getComputedStyle(e).fontSize), "16px");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, `lesson-${theme}-mobile.png`) });
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    results.push("light/dark desktop and mobile reading, math font, no mobile overflow");
    await page.goto(`${origin}/learn/completion`);
    await page.waitForSelector('html[data-ma-glass-task-state="complete"]');
    const completionTitle = page.locator('#finalScreen-completionMessage');
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => chrome.storage.sync.set({ theme }), theme);
      await page.waitForTimeout(250);
      assert.equal(
        await completionTitle.evaluate(element => getComputedStyle(element, "::before").backgroundClip),
        "border-box"
      );
      await page.screenshot({ path: path.join(output, `completion-${theme}.png`) });
    }
    results.push("light/dark completion badge keeps its gradient clipped to the circular border box");
    await page.evaluate(() => chrome.storage.sync.set({ enabled: false }));
    await page.waitForSelector('html[data-ma-glass-enabled="false"]');
    assert.equal(await page.locator('[data-ma-glass-card-export-control]').count(), 0);
    assert.equal(await launcher.isVisible(), false);
    await page.evaluate(() => chrome.storage.sync.set({ enabled: true, theme: "system" }));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForSelector('html[data-ma-glass-theme="dark"]');
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForSelector('html[data-ma-glass-theme="light"]');
    results.push("pause/resume and system-theme changes");

    await page.goto(`${origin}/popup/popup.html`);
    await page.waitForSelector('#enabled:not([disabled])');
    for (const theme of ["light", "dark"]) {
      await page.locator(`[data-theme="${theme}"]`).click();
      assert.equal(await page.locator(`[data-theme="${theme}"]`).getAttribute("aria-checked"), "true");
      await page.waitForTimeout(250);
      await page.locator('main').screenshot({ path: path.join(output, `popup-${theme}.png`) });
    }
    await page.locator('#enabled-switch').click();
    assert.equal(await page.locator('#enabled').isChecked(), false);
    assert.equal(await page.locator('#status-text').textContent(), "Extension is paused");
    results.push("popup theme and pause controls");
    assert.deepEqual(errors, [], "no browser JavaScript exceptions");
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
