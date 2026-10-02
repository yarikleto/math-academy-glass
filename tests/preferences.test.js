"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function bootstrap() {
  let settings = { enabled: true, theme: "system" };
  let loaded = false;
  let readCallback;
  let changeListener;
  let timeout;
  const noop = () => {};
  const appearance = {
    getDefaults: () => ({ enabled: true, theme: "system" }),
    getSettings: () => ({ ...settings }),
    applySettings(value) {
      settings = {
        enabled: typeof value.enabled === "boolean" ? value.enabled : true,
        theme: ["light", "dark", "system"].includes(value.theme) ? value.theme : "system"
      };
    },
    finishLoading: () => { loaded = true; },
    isLoaded: () => loaded,
    isEnabled: () => loaded && settings.enabled,
    registerIconResources: noop,
    setLifecycleHandler: noop,
    startRootStateObserver: noop,
    startSystemThemeListener: noop
  };
  const extensionState = {
    runExtensionOperation(operation) { operation(); return { ok: true }; },
    readRuntimeLastError: () => null,
    clearLegacyHostSessionData: noop,
    loadTabState: noop
  };
  const modules = {
    appearance, extensionState,
    context: { getRoot: () => ({ dataset: {} }), extensionRequestTimeout: 1500 },
    mathEditor: { startMathEditorEnhancer: noop },
    courseProgress: { setDayRolloverHandler: noop },
    dashboard: { scheduleDashboardScan: noop }
  };
  const sandbox = {
    __maGlassThemeModules: {
      has: () => false,
      require: (name) => modules[name] || {},
      register: noop
    },
    document: { readyState: "loading", addEventListener: noop },
    window: { setTimeout(callback) { timeout = callback; return 1; }, clearTimeout: noop },
    chrome: { storage: {
      sync: { get(_defaults, callback) { readCallback = callback; } },
      local: { clear: (callback) => callback() },
      onChanged: { addListener(callback) { changeListener = callback; } }
    } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../content/theme-controller.js"), "utf8"), sandbox);
  return {
    appearance,
    complete: (value) => readCallback(value),
    change: (value, area = "sync") => changeListener(value, area),
    expire: () => timeout()
  };
}

test("initial settings read preserves newer popup changes and unrelated stored fields", () => {
  const app = bootstrap();
  app.change({ enabled: { newValue: false } });
  app.change({ theme: { newValue: "dark" } });
  app.complete({ enabled: true, theme: "light" });
  assert.deepEqual(app.appearance.getSettings(), { enabled: false, theme: "dark" });
  assert.equal(app.appearance.isLoaded(), true);
  assert.equal(app.appearance.isEnabled(), false);
  app.change({ enabled: { newValue: true } });
  assert.equal(app.appearance.isEnabled(), true);

  const partial = bootstrap();
  partial.change({ theme: { newValue: "dark" } });
  partial.complete({ enabled: false, theme: "light" });
  assert.deepEqual(partial.appearance.getSettings(), { enabled: false, theme: "dark" });
});

test("startup timeout keeps recent changes, ignores late reads, and normalizes removals", () => {
  const app = bootstrap();
  app.change({ enabled: { newValue: false } });
  app.change({ theme: { newValue: "dark" } });
  app.change({ theme: { oldValue: "dark" } });
  app.change({ enabled: { newValue: true } }, "session");
  app.expire();
  app.complete({ enabled: true, theme: "light" });
  assert.deepEqual(app.appearance.getSettings(), { enabled: false, theme: "system" });
  assert.equal(app.appearance.isLoaded(), true);
});
