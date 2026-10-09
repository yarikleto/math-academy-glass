// Optional PDF regression QA: requires Playwright and pdfjs-dist (NODE_PATH).
// Uses synthetic lessons, blocked network requests, and a disposable browser.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const css = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"))).content_scripts[0].css;
const output = path.join(ROOT, "test-results", process.env.MA_PRINT_BASELINE_CSS ? "card-print-baseline" : "card-print");
fs.mkdirSync(output, { recursive: true });
const origin = "https://www.mathacademy.com";

function fixture(family, long) {
  const host = family === "task" ? "steps" : "lessonContent";
  const paragraphs = Array.from({ length: long ? 55 : 2 }, (_, i) =>
    `<p>Lesson paragraph ${i + 1}: Compare a radius with the diameter of a circle.</p>`
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Synthetic PDF QA</title>
    <style>
      body { margin:70px 0 0; font:16px Arial; }
      #wrap { padding:40px; }
      #stepsFrame { margin-top:100px; text-align:center; }
      #${host} { display:inline-block; width:730px; }
      .step { margin:50px 0; padding:24px; text-align:left; }
      #selected p { margin:18px 0; }
      .MathJax { font-family:"Times New Roman"; }
      /* Screen-only wrappers and generated content must never reserve PDF pages. */
      #wrap::after { content:""; display:block; height:3000px; }
      #wrap #stepsFrame { min-height:4000px !important; backdrop-filter:blur(2px); }
      #wrap { break-after:page; }
      #selected .exampleExplanation::after { content:"End of instruction"; }
    </style></head><body><div id="header">Unselected navigation</div>
    <div id="wrap"><div id="stepsFrame"><div id="${host}">
      <div class="step" style="height:2500px">Unselected previous card</div>
      <div id="selected" class="step"><div class="stepHeader"><span class="stepName">Synthetic lesson</span><a class="helpButton">Help</a></div>
        <div class="example"><div class="exampleExplanation">
          <p>Start of instruction. <span class="MathJax">x² + 1 = 0</span></p>
          <svg width="300" height="120" viewBox="0 0 300 120"><circle cx="90" cy="60" r="45" fill="none" stroke="#077a5e" stroke-width="2"/><text x="150" y="60" font-size="12">Diagram label</text></svg>
          ${paragraphs}
        </div></div>
      </div><div class="step"><div class="questionWidget">Unselected question</div></div>
    </div></div></div></body></html>`;
}

async function main() {
  const { getDocument } = await import(require.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const results = [];
  try {
    for (const family of ["task", "topic"]) {
      for (const theme of ["light", "dark"]) {
        for (const long of [false, true]) {
          const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
          const errors = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", route => {
            if (new URL(route.request().url()).origin !== origin) return route.abort();
            return route.fulfill({ contentType: "text/html", body: fixture(family, long) });
          });
          await page.goto(`${origin}${family === "task" ? "/tasks/1/topics/1/lesson" : "/topics/1"}`);
          for (const file of css) {
            const source = file === "styles/66-card-export.css" && process.env.MA_PRINT_BASELINE_CSS
              ? process.env.MA_PRINT_BASELINE_CSS : path.join(ROOT, file);
            await page.addStyleTag({ content: fs.readFileSync(source, "utf8") });
          }
          for (const file of ["content/theme/context.js", "content/theme/card-export.js"]) {
            await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
          }
          await page.evaluate(theme => {
            document.documentElement.dataset.maGlassEnabled = "true";
            document.documentElement.dataset.maGlassTheme = theme;
            __maGlassThemeModules.require("cardExport").setEnabled(true);
            window.print = () => {
              window.stagedPrint = {
                title: document.title,
                nodes: [...document.querySelectorAll("html,[data-ma-glass-print-target],[data-ma-glass-print-ancestor],[data-ma-glass-print-excluded]")].map(node => ({
                  node,
                  attributes: [...node.attributes].filter(a => /^(data-ma-glass-card-printing|data-ma-glass-print-(target|ancestor|excluded))$/.test(a.name)).map(a => [a.name, a.value])
                }))
              };
            };
          }, theme);
          const screenHeight = await page.locator("#stepsFrame").evaluate(e => e.getBoundingClientRect().height);
          await page.locator("#selected .ma-glass-card-export-link").click();
          assert.equal(await page.title(), "Synthetic PDF QA");
          assert.equal(await page.locator("[data-ma-glass-print-target],[data-ma-glass-print-ancestor],[data-ma-glass-print-excluded],[data-ma-glass-card-printing]").count(), 0);
          // Restore precisely the markers captured during the trusted activation.
          // The native call is stubbed only to let the test inspect its PDF bytes.
          await page.evaluate(() => {
            for (const { node, attributes } of stagedPrint.nodes) {
              for (const [name, value] of attributes) node.setAttribute(name, value);
            }
            document.title = stagedPrint.title;
          });
          await page.emulateMedia({ media: "print" });
          assert.equal(await page.locator(".ma-glass-card-export-link").isVisible(), false);
          assert.equal(await page.locator(".helpButton").isVisible(), false);
          assert.match(await page.locator(".MathJax").evaluate(e => getComputedStyle(e).fontFamily), /Times New Roman/);
          assert.equal(await page.locator("circle").evaluate(e => getComputedStyle(e).stroke), "rgb(7, 122, 94)");
          const name = `${family}-${theme}-${long ? "long" : "short"}`;
          const bytes = await page.pdf({ path: path.join(output, `${name}.pdf`), preferCSSPageSize: true, printBackground: theme === "dark", displayHeaderFooter: long });
          const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
          const texts = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const text = (await (await pdf.getPage(i)).getTextContent()).items.map(item => item.str).join(" ");
            assert.match(text, /instruction|Lesson paragraph|Synthetic lesson/, `${name}: page ${i} must contain instruction, not just a background`);
            texts.push(text);
          }
          if (long) assert.ok(pdf.numPages > 1, `${name}: long lessons must flow across pages`);
          else assert.equal(pdf.numPages, 1, `${name}: short lessons must not generate blank pages`);
          const text = texts.join(" ");
          for (const expected of ["Start of instruction", "End of instruction", "Diagram label", "x² + 1 = 0"]) assert.ok(text.includes(expected), `${name}: missing ${expected}`);
          for (let i = 1; i <= (long ? 55 : 2); i++) assert.ok(text.includes(`Lesson paragraph ${i}:`), `${name}: missing paragraph ${i}`);
          assert.doesNotMatch(text, /Unselected|Help|PDF/);
          await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
          results.push({ name, pages: pdf.numPages });
          await pdf.destroy();
          await page.evaluate(() => {
            for (const { node, attributes } of stagedPrint.nodes) {
              for (const [name] of attributes) node.removeAttribute(name);
            }
            document.title = "Synthetic PDF QA";
          });
          await page.emulateMedia({ media: "screen" });
          assert.equal(await page.locator("#stepsFrame").evaluate(e => e.getBoundingClientRect().height), screenHeight, "print overrides must not change screen layout after cleanup");
          assert.equal(await page.locator("#selected .ma-glass-card-export-link").isVisible(), true);
          assert.deepEqual(errors, []);
          await page.close();
        }
      }
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
