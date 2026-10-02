"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const MATH_ACADEMY_MATCH = "https://*.mathacademy.com/*";
const STORAGE_BROKER_PATH = "background/storage-controller.js";
const RELEASE_ARCHIVE_PATH = path.join(ROOT, "math-academy-glass-extension.zip");
const RELEASE_FILES = Object.freeze([
  "manifest.json",
  "README.md",
  "PRIVACY.md",
  "ARCHITECTURE.md",
  "LICENSE"
]);
const RELEASE_DIRECTORIES = Object.freeze([
  "background",
  "content",
  "styles",
  "popup",
  "icons"
]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function contentScriptFiles(manifest = readManifest()) {
  return (manifest.content_scripts || []).flatMap(({ js = [] }) => js);
}

function readContentSubsystemSource(subsystem) {
  const prefix = `content/${subsystem}/`;
  const entrypoint = `content/${subsystem}-controller.js`;
  const files = contentScriptFiles().filter(
    (file) => file === entrypoint || file.startsWith(prefix)
  );

  assert.ok(files.length > 0, `${subsystem} content-script sources must be declared`);
  return files
    .map((file) => `\n/* Source: ${file} */\n${readUtf8(file)}`)
    .join("\n");
}

function readThemeSource() {
  return readContentSubsystemSource("theme");
}

function classifyThemePage(pathname) {
  const root = { dataset: {} };
  const sandbox = {
    document: { documentElement: root },
    location: { pathname }
  };
  const vmContext = vm.createContext(sandbox);
  vm.runInContext(readUtf8("content/theme/context.js"), vmContext, {
    filename: "content/theme/context.js"
  });
  return sandbox.__maGlassThemeModules.require("context").pageKind();
}

function readStudyToolsSource() {
  return readContentSubsystemSource("tools");
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function walkFiles(directory, baseDirectory = directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath, baseDirectory));
    } else if (entry.isFile()) {
      files.push(toPosixPath(path.relative(baseDirectory, absolutePath)));
    }
  }

  return files;
}

function globToRegExp(pattern) {
  let expression = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "*") {
      if (pattern[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }

  return new RegExp(`${expression}$`);
}

function expandPackagedReference(reference) {
  if (!/[?*]/.test(reference)) return [reference];
  const matcher = globToRegExp(reference);
  return walkFiles(ROOT).filter((filePath) => matcher.test(filePath));
}

function addIconReferences(references, icons, owner) {
  if (typeof icons === "string") {
    references.push({ owner, reference: icons });
    return;
  }

  for (const [size, reference] of Object.entries(icons || {})) {
    references.push({ owner: `${owner}.${size}`, reference });
  }
}

function collectManifestReferences(manifest) {
  const references = [];
  const add = (owner, reference) => {
    if (typeof reference === "string") references.push({ owner, reference });
  };

  addIconReferences(references, manifest.icons, "icons");
  add("action.default_popup", manifest.action?.default_popup);
  addIconReferences(references, manifest.action?.default_icon, "action.default_icon");
  add("background.service_worker", manifest.background?.service_worker);
  for (const [index, script] of (manifest.background?.scripts || []).entries()) {
    add(`background.scripts[${index}]`, script);
  }

  for (const [scriptIndex, contentScript] of (manifest.content_scripts || []).entries()) {
    for (const [fileIndex, file] of (contentScript.js || []).entries()) {
      add(`content_scripts[${scriptIndex}].js[${fileIndex}]`, file);
    }
    for (const [fileIndex, file] of (contentScript.css || []).entries()) {
      add(`content_scripts[${scriptIndex}].css[${fileIndex}]`, file);
    }
  }

  for (const [groupIndex, group] of (manifest.web_accessible_resources || []).entries()) {
    for (const [fileIndex, file] of (group.resources || []).entries()) {
      add(`web_accessible_resources[${groupIndex}].resources[${fileIndex}]`, file);
    }
  }

  add("options_page", manifest.options_page);
  add("options_ui.page", manifest.options_ui?.page);
  add("devtools_page", manifest.devtools_page);
  add("side_panel.default_path", manifest.side_panel?.default_path);
  for (const [page, file] of Object.entries(manifest.chrome_url_overrides || {})) {
    add(`chrome_url_overrides.${page}`, file);
  }
  for (const [index, file] of (manifest.sandbox?.pages || []).entries()) {
    add(`sandbox.pages[${index}]`, file);
  }
  for (const [index, ruleset] of (manifest.declarative_net_request?.rule_resources || []).entries()) {
    add(`declarative_net_request.rule_resources[${index}].path`, ruleset.path);
  }

  return references;
}

function parseAttributes(tag) {
  const attributes = new Map();
  const openingTag = tag.replace(/^<\s*[^\s/>]+/i, "").replace(/\/?\s*>$/, "");
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of openingTag.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function htmlTags(html, tagName) {
  const pattern = new RegExp(`<\\s*${tagName}\\b[^>]*>`, "gi");
  return [...html.matchAll(pattern)].map(([tag]) => ({
    attributes: parseAttributes(tag),
    tag
  }));
}

function assertLocalAssetUrl(url, description) {
  assert.ok(url, `${description} must specify a packaged file`);
  assert.doesNotMatch(
    url,
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i,
    `${description} must be a relative packaged URL, received ${JSON.stringify(url)}`
  );
}

function removeJavaScriptComments(source) {
  let result = "";
  let state = "code";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") {
        state = "code";
        result += "\n";
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (character === "*" && nextCharacter === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "single-quote" || state === "double-quote" || state === "template") {
      result += character;
      if (character === "\\") {
        if (nextCharacter !== undefined) {
          result += nextCharacter;
          index += 1;
        }
      } else if (
        (state === "single-quote" && character === "'") ||
        (state === "double-quote" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
    } else if (character === "/" && nextCharacter === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
    } else {
      result += character;
      if (character === "'") state = "single-quote";
      if (character === '"') state = "double-quote";
      if (character === "`") state = "template";
    }
  }

  return result;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function findMatchingDelimiter(source, startIndex, opening, closing) {
  assert.equal(source[startIndex], opening, `expected ${opening} at index ${startIndex}`);
  let depth = 0;
  let state = "code";

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && nextCharacter === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state !== "code") {
      if (character === "\\") {
        index += 1;
      } else if (
        (state === "single-quote" && character === "'") ||
        (state === "double-quote" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      state = "line-comment";
      index += 1;
    } else if (character === "/" && nextCharacter === "*") {
      state = "block-comment";
      index += 1;
    } else if (character === "'") {
      state = "single-quote";
    } else if (character === '"') {
      state = "double-quote";
    } else if (character === "`") {
      state = "template";
    } else if (character === opening) {
      depth += 1;
    } else if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  assert.fail(`could not find ${closing} matching index ${startIndex}`);
}

function extractNamedFunction(source, functionName) {
  const escapedName = functionName.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  const declaration = new RegExp(`\\bfunction\\s+${escapedName}\\s*\\(`).exec(source);
  assert.ok(declaration, `function ${functionName} must be declared`);
  const parametersStart = source.indexOf("(", declaration.index);
  const parametersEnd = findMatchingDelimiter(source, parametersStart, "(", ")");
  const bodyStart = source.indexOf("{", parametersEnd);
  assert.ok(bodyStart >= 0, `function ${functionName} must have a body`);
  const bodyEnd = findMatchingDelimiter(source, bodyStart, "{", "}");
  return {
    end: bodyEnd + 1,
    source: source.slice(declaration.index, bodyEnd + 1),
    start: declaration.index
  };
}

function createManualTimers() {
  let nextId = 1;
  const timers = new Map();

  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    get delays() {
      return [...timers.values()].map(({ delay }) => delay);
    },
    runDelay(delay) {
      const match = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(match, `expected a pending ${delay}ms timer`);
      const [id, timer] = match;
      timers.delete(id);
      timer.callback();
    },
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    }
  };
}

function createCardExportHarness({
  pathname = "/tasks/13012181/topics/688/lesson"
} = {}) {
  const DATA_ATTRIBUTE_PREFIX = "data-";
  const toDataProperty = (attribute) => attribute
    .slice(DATA_ATTRIBUTE_PREFIX.length)
    .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  const toDataAttribute = (property) => `${DATA_ATTRIBUTE_PREFIX}${property
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

  class TestElement {
    constructor(tagName) {
      this.attributes = new Map();
      this.children = [];
      this.classList = new Set();
      this.listeners = new Map();
      this.parentElement = null;
      this.tagName = tagName.toUpperCase();
      this.textContent = "";

      const datasetValues = {};
      this.dataset = new Proxy(datasetValues, {
        deleteProperty: (target, property) => {
          delete target[property];
          this.attributes.delete(toDataAttribute(property));
          return true;
        },
        set: (target, property, value) => {
          const normalized = String(value);
          target[property] = normalized;
          this.attributes.set(toDataAttribute(property), normalized);
          return true;
        }
      });
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    append(...children) {
      for (const child of children) {
        if (child.parentElement) {
          const previousIndex = child.parentElement.children.indexOf(child);
          if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
        }
        child.parentElement = this;
        this.children.push(child);
      }
    }

    contains(candidate) {
      if (candidate === this) return true;
      return this.children.some((child) => child.contains(candidate));
    }

    emit(type, overrides = {}) {
      const event = {
        currentTarget: this,
        defaultPrevented: false,
        isTrusted: true,
        preventDefault() {
          this.defaultPrevented = true;
        },
        target: this,
        ...overrides
      };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }

    get isConnected() {
      let current = this;
      while (current) {
        if (current === documentElement) return true;
        current = current.parentElement;
      }
      return false;
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    matches(selector) {
      return selector.split(",").some((part) => {
        const candidate = part.trim();
        if (candidate === "*") return true;
        if (candidate.startsWith(".")) {
          return this.classList.has(candidate.slice(1));
        }
        if (candidate.startsWith("#")) return this.id === candidate.slice(1);

        const attributeMatch = candidate.match(
          /^(?:([a-z][a-z\d-]*)\s*)?\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/i
        );
        if (attributeMatch) {
          const [, tagName, attribute, expected] = attributeMatch;
          if (tagName && this.tagName !== tagName.toUpperCase()) return false;
          const actual = this.getAttribute(attribute);
          return expected === undefined ? actual !== null : actual === expected;
        }

        return this.tagName === candidate.toUpperCase();
      });
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const matches = [];
      const visit = (element) => {
        for (const child of element.children) {
          if (child.matches(selector)) matches.push(child);
          visit(child);
        }
      };
      visit(this);
      return matches;
    }

    remove() {
      if (!this.parentElement) return;
      const index = this.parentElement.children.indexOf(this);
      if (index >= 0) this.parentElement.children.splice(index, 1);
      this.parentElement = null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
      if (name.startsWith(DATA_ATTRIBUTE_PREFIX)) {
        delete this.dataset[toDataProperty(name)];
      }
    }

    setAttribute(name, value) {
      const normalized = String(value);
      this.attributes.set(name, normalized);
      if (name === "id") this.id = normalized;
      if (name === "class") {
        this.classList = new Set(normalized.split(/\s+/).filter(Boolean));
      }
      if (name.startsWith(DATA_ATTRIBUTE_PREFIX)) {
        this.dataset[toDataProperty(name)] = normalized;
      }
    }

    toggleAttribute(name, force) {
      const next = force === undefined ? !this.attributes.has(name) : Boolean(force);
      if (next) this.setAttribute(name, "");
      else this.removeAttribute(name);
      return next;
    }

    set className(value) {
      this.setAttribute("class", value);
    }

    get className() {
      return [...this.classList].join(" ");
    }
  }

  const documentElement = new TestElement("html");
  const body = new TestElement("body");
  const steps = new TestElement("main");
  steps.setAttribute("id", "steps");
  const lessonContent = new TestElement("main");
  lessonContent.setAttribute("id", "lessonContent");
  documentElement.append(body);
  body.append(steps, lessonContent);
  documentElement.dataset.maGlassEnabled = "true";

  function makeCard(kind, {
    direct = true,
    hasHeader = true,
    hasName = true,
    parent = steps
  } = {}) {
    const card = new TestElement("section");
    card.classList.add("step");
    if (hasHeader) {
      const header = new TestElement("header");
      header.classList.add("stepHeader");
      if (hasName) {
        const name = new TestElement("span");
        name.classList.add("stepName");
        name.textContent = `${kind} title`;
        header.append(name);
      }
      card.append(header);
    }

    const content = new TestElement("div");
    content.classList.add(kind);
    if (direct) {
      card.append(content);
    } else {
      const wrapper = new TestElement("div");
      wrapper.append(content);
      card.append(wrapper);
    }
    parent.append(card);
    return card;
  }

  const cards = {
    example: makeCard("example"),
    nestedTutorial: makeCard("tutorial", { direct: false }),
    question: makeCard("question"),
    topicExample: makeCard("example", { parent: lessonContent }),
    topicMissingHeader: makeCard("referenceContent", {
      hasHeader: false,
      parent: lessonContent
    }),
    topicMissingName: makeCard("referenceContent", {
      hasName: false,
      parent: lessonContent
    }),
    topicQuestion: makeCard("question", {
      direct: false,
      parent: lessonContent
    }),
    topicQuestionWidget: makeCard("questionWidget", {
      direct: false,
      parent: lessonContent
    }),
    topicReference: makeCard("referenceContent", { parent: lessonContent }),
    tutorial: makeCard("tutorial")
  };
  const outsideCard = makeCard("tutorial", { parent: body });
  const allCards = { ...cards, outside: outsideCard };
  const timers = createManualTimers();
  const documentListeners = new Map();
  const windowListeners = new Map();
  let printCalls = 0;
  let printHook = () => {};
  const printSnapshots = [];
  const windowMock = {
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    clearTimeout: (id) => timers.clearTimeout(id),
    print() {
      printCalls += 1;
      printSnapshots.push({
        rootPrinting: documentElement.dataset.maGlassCardPrinting,
        targets: Object.entries(allCards)
          .filter(([, card]) => card.getAttribute("data-ma-glass-print-target") === "true")
          .map(([name]) => name)
      });
      printHook();
    },
    setTimeout: (callback, delay) => timers.setTimeout(callback, delay)
  };
  const documentMock = {
    body,
    documentElement,
    hidden: false,
    title: "Acceleration lesson",
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    createElement: (tagName) => new TestElement(tagName),
    createElementNS: (_namespace, tagName) => new TestElement(tagName),
    querySelectorAll(selector) {
      const selectorParts = selector.split(",").map((part) => part.trim());
      const scopedCards = [];
      let hasScopedSelector = false;
      for (const selectorPart of selectorParts) {
        let container = null;
        if (selectorPart === "#steps > .step") container = steps;
        if (selectorPart === "#lessonContent > .step") container = lessonContent;
        if (!container) continue;
        hasScopedSelector = true;
        scopedCards.push(
          ...container.children.filter((child) => child.classList.has("step"))
        );
      }
      if (hasScopedSelector) return [...new Set(scopedCards)];
      return documentElement.querySelectorAll(selector);
    }
  };
  const isLearnPage = () => pathname === "/learn" ||
    pathname.startsWith("/learn/") ||
    pathname === "/tasks" ||
    pathname.startsWith("/tasks/") ||
    /^\/courses\/\d+\/progress\/?$/.test(pathname);
  const isTopicDetailPage = () => /^\/topics\/\d+\/?$/.test(pathname);
  const modules = new Map([
    ["context", Object.freeze({
      getRoot: () => documentElement,
      isCardExportPage: () => isLearnPage() || isTopicDetailPage(),
      isLearnPage,
      isTopicDetailPage,
      pageKind: () => isLearnPage() ? "learn" : isTopicDetailPage() ? "topic" : "other"
    })]
  ]);
  const namespace = Object.freeze({
    has: (name) => modules.has(name),
    register(name, api) {
      assert.equal(modules.has(name), false, `module ${name} must register once`);
      modules.set(name, Object.freeze(api));
    },
    require(name) {
      assert.ok(modules.has(name), `module ${name} must be available`);
      return modules.get(name);
    }
  });
  const sandbox = {
    __maGlassThemeModules: namespace,
    document: documentMock,
    Element: TestElement,
    location: { pathname },
    window: windowMock
  };
  vm.runInNewContext(readUtf8("content/theme/card-export.js"), sandbox, {
    filename: "content/theme/card-export.js"
  });

  const controlSelector = "[data-ma-glass-card-export-control='true']";
  const allElements = () => [documentElement, ...documentElement.querySelectorAll("*")];
  return {
    api: modules.get("cardExport"),
    cards: allCards,
    controls(card) {
      return card.querySelectorAll(controlSelector);
    },
    dispatchWindow(type) {
      for (const listener of windowListeners.get(type) || []) listener();
    },
    dispatchDocument(type) {
      for (const listener of documentListeners.get(type) || []) listener();
    },
    document: documentMock,
    printCalls: () => printCalls,
    printSnapshots,
    printMarkers() {
      return allElements().filter((element) => [
        "data-ma-glass-print-ancestor",
        "data-ma-glass-print-excluded",
        "data-ma-glass-print-target"
      ].some((attribute) => element.getAttribute(attribute) !== null));
    },
    root: documentElement,
    setDocumentHidden(hidden) {
      documentMock.hidden = Boolean(hidden);
    },
    setPrintHook(hook) {
      printHook = typeof hook === "function" ? hook : () => {};
    }
  };
}

function findShortcutHandler(source) {
  const shortcutMarker = /["']KeyL["']/g;
  const shortcutMatches = [...source.matchAll(shortcutMarker)];
  assert.equal(
    shortcutMatches.length,
    1,
    "theme controller must declare exactly one KeyL shortcut"
  );

  const keyIndex = shortcutMatches[0].index;
  const listenerPattern = /document\s*\.\s*addEventListener\s*\(\s*["']keydown["']/g;
  const listenerMatches = [...source.matchAll(listenerPattern)]
    .filter((match) => match.index < keyIndex);
  assert.ok(listenerMatches.length > 0, "KeyL shortcut must be registered as a keydown listener");

  const listenerIndex = listenerMatches.at(-1).index;
  const arrowIndex = source.indexOf("=>", listenerIndex);
  assert.ok(arrowIndex >= 0 && arrowIndex < keyIndex, "KeyL listener must have a callback");
  const bodyStart = source.indexOf("{", arrowIndex);
  assert.ok(bodyStart >= 0 && bodyStart < keyIndex, "KeyL listener callback must have a body");

  let depth = 0;
  let state = "code";
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && nextCharacter === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state !== "code") {
      if (character === "\\") {
        index += 1;
      } else if (
        (state === "single-quote" && character === "'") ||
        (state === "double-quote" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      state = "line-comment";
      index += 1;
    } else if (character === "/" && nextCharacter === "*") {
      state = "block-comment";
      index += 1;
    } else if (character === "'") {
      state = "single-quote";
    } else if (character === '"') {
      state = "double-quote";
    } else if (character === "`") {
      state = "template";
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }

  assert.fail("KeyL listener callback body is not balanced");
}

function runUnzip(argumentsList, encoding) {
  return childProcess.spawnSync("unzip", argumentsList, {
    cwd: ROOT,
    encoding,
    maxBuffer: 16 * 1024 * 1024
  });
}

function assertUnzipSucceeded(result, action) {
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${action} failed: ${String(result.stderr || "unknown unzip error").trim()}`
  );
}

function expectedReleaseEntries() {
  const packagedSources = RELEASE_DIRECTORIES.flatMap((directory) =>
    walkFiles(path.join(ROOT, directory), ROOT)
  ).filter((file) => !file.endsWith(".DS_Store"));
  return [...RELEASE_FILES, ...packagedSources].sort();
}

function createPopupHarness() {
  const timers = createManualTimers();
  let documentMock;

  function createClassList() {
    const classes = new Set();
    return {
      contains(name) {
        return classes.has(name);
      },
      toggle(name, force) {
        const next = force === undefined ? !classes.has(name) : Boolean(force);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      }
    };
  }

  function createElement(id, dataset = {}) {
    const attributes = new Map();
    const listeners = new Map();
    return {
      attributes,
      checked: false,
      classList: createClassList(),
      dataset: { ...dataset },
      disabled: false,
      id,
      isConnected: true,
      tabIndex: 0,
      textContent: "",
      addEventListener(type, listener) {
        const current = listeners.get(type) || [];
        current.push(listener);
        listeners.set(type, current);
      },
      click() {
        this.emit("click", { target: this });
      },
      emit(type, event = {}) {
        for (const listener of listeners.get(type) || []) listener(event);
      },
      focus() {
        documentMock.activeElement = this;
      },
      getAttribute(name) {
        return attributes.get(name) ?? null;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      }
    };
  }

  const popupWindow = createElement("window");
  const appearanceControls = createElement("appearance-controls");
  const enabledInput = createElement("enabled");
  const modeLabel = createElement("mode-label");
  const themeHint = createElement("theme-hint");
  const statusText = createElement("status-text");
  const segments = ["light", "system", "dark"]
    .map((theme) => createElement(`theme-${theme}`, { theme }));
  const body = createElement("body");
  const documentElement = createElement("html");
  const controlledElements = new Set([enabledInput, ...segments]);
  appearanceControls.contains = (element) => controlledElements.has(element);

  const elementsById = new Map([
    ["appearance-controls", appearanceControls],
    ["enabled", enabledInput],
    ["mode-label", modeLabel],
    ["theme-hint", themeHint],
    ["status-text", statusText]
  ]);
  documentMock = {
    activeElement: null,
    body,
    documentElement,
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelector(selector) {
      return selector === ".window" ? popupWindow : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-theme]" ? segments : [];
    }
  };

  const getCalls = [];
  const setCalls = [];
  let storageChangeListener;
  const chrome = {
    runtime: { lastError: null },
    storage: {
      onChanged: {
        addListener(listener) {
          storageChangeListener = listener;
        }
      },
      sync: {
        get(defaults, callback) {
          getCalls.push({ callback, defaults });
        },
        set(patch, callback) {
          setCalls.push({ callback, patch });
        }
      }
    }
  };
  const mediaListeners = [];
  const windowMock = {
    clearTimeout: (id) => timers.clearTimeout(id),
    matchMedia() {
      return {
        matches: false,
        addEventListener(type, listener) {
          if (type === "change") mediaListeners.push(listener);
        }
      };
    },
    setTimeout: (callback, delay) => timers.setTimeout(callback, delay)
  };
  const context = {
    URLSearchParams,
    chrome,
    document: documentMock,
    location: { search: "" },
    window: windowMock
  };

  vm.runInNewContext(readUtf8("popup/popup.js"), context, {
    filename: "popup/popup.js"
  });

  function invokeWithRuntimeError(callback, value, error) {
    chrome.runtime.lastError = error || null;
    callback(value);
    chrome.runtime.lastError = null;
  }

  return {
    appearanceControls,
    body,
    completeGet(settings, error = null) {
      assert.equal(getCalls.length, 1, "popup must issue one initial storage.get");
      invokeWithRuntimeError(getCalls[0].callback, settings, error);
    },
    completeSet(index, error = null) {
      assert.ok(setCalls[index], `popup storage.set call ${index} must exist`);
      invokeWithRuntimeError(setCalls[index].callback, undefined, error);
    },
    emitStorageChange(changes, areaName = "sync") {
      assert.ok(storageChangeListener, "popup must register storage.onChanged");
      storageChangeListener(changes, areaName);
    },
    enabledInput,
    modeLabel,
    popupWindow,
    segments,
    setCalls,
    statusText,
    timers
  };
}

test("manifest is a minimally scoped Manifest V3 package", () => {
  const manifest = readManifest();

  assert.equal(manifest.manifest_version, 3, "manifest_version must be exactly 3");
  assert.equal(typeof manifest.version, "string", "manifest.version must be a string");
  assert.match(
    manifest.version,
    /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/,
    "manifest.version must contain one to four dot-separated integers without leading zeroes"
  );

  const versionParts = manifest.version.split(".").map(Number);
  assert.ok(
    versionParts.some((part) => part !== 0),
    "manifest.version must not be entirely zero"
  );
  for (const part of versionParts) {
    assert.ok(part <= 65_535, `manifest.version component ${part} exceeds Chrome's 65535 limit`);
  }

  assert.deepEqual(
    [...(manifest.permissions || [])].sort(),
    ["storage"],
    "permissions must contain only storage"
  );
  assert.deepEqual(
    [...(manifest.optional_permissions || [])].sort(),
    [],
    "optional_permissions must stay empty"
  );
  assert.equal(
    Object.hasOwn(manifest, "host_permissions"),
    false,
    "host_permissions must be omitted; content-script matches already grant the required site access"
  );
  assert.deepEqual(
    manifest.optional_host_permissions || [],
    [],
    "optional_host_permissions must stay empty"
  );

  assert.ok(manifest.content_scripts?.length, "manifest must declare a content script");
  for (const [index, contentScript] of manifest.content_scripts.entries()) {
    assert.deepEqual(
      contentScript.matches,
      [MATH_ACADEMY_MATCH],
      `content_scripts[${index}].matches must use the single Math Academy scope`
    );
  }

  for (const [index, group] of (manifest.web_accessible_resources || []).entries()) {
    assert.deepEqual(
      group.matches,
      [MATH_ACADEMY_MATCH],
      `web_accessible_resources[${index}].matches must use the single Math Academy scope`
    );
  }
});

test("content architecture stays modular and manifest-ordered", () => {
  const manifest = readManifest();
  assert.equal(
    manifest.content_scripts?.length,
    1,
    "one ordered content-script composition root is expected"
  );

  const [{ js = [], css = [] }] = manifest.content_scripts;
  for (const subsystem of ["theme", "tools"]) {
    const prefix = `content/${subsystem}/`;
    const entrypoint = `content/${subsystem}-controller.js`;
    const moduleFiles = js.filter((file) => file.startsWith(prefix));
    const entrypointIndex = js.indexOf(entrypoint);

    assert.ok(
      moduleFiles.length >= 4,
      `${subsystem} must be composed from feature modules, not a monolith`
    );
    assert.ok(entrypointIndex >= 0, `${entrypoint} must be declared`);
    assert.ok(
      moduleFiles.every((file) => js.indexOf(file) < entrypointIndex),
      `${subsystem} modules must load before their bootstrap controller`
    );
    assert.ok(
      readUtf8(entrypoint).split("\n").length <= 450,
      `${entrypoint} must stay a thin composition/bootstrap layer`
    );
  }

  for (const file of js.filter((file) => file.startsWith("content/"))) {
    assert.ok(
      readUtf8(file).split("\n").length <= 1_300,
      `${file} is too large; split it at a feature boundary`
    );
  }

  assert.ok(css.length >= 8, "appearance rules must be split by route and component");
  assert.equal(
    css.includes("styles/math-academy-glass.css"),
    false,
    "the legacy stylesheet monolith must not return"
  );
  assert.deepEqual(css, [...css].sort(), "numbered stylesheets must preserve cascade order");
  for (const file of css) {
    assert.ok(
      readUtf8(file).split("\n").length <= 1_300,
      `${file} is too large; split it at a route or component boundary`
    );
  }
});

test("the help hub has a dedicated route and responsive style layer", () => {
  for (const pathname of ["/help", "/help/", "/help/contact"]) {
    assert.equal(classifyThemePage(pathname), "help", `${pathname} must use the help route`);
  }
  assert.equal(classifyThemePage("/helpful"), "other", "nearby paths must not use help styles");

  const [{ css = [] }] = readManifest().content_scripts;
  const stylesheetPath = "styles/45-help.css";
  const stylesheetIndex = css.indexOf(stylesheetPath);
  assert.ok(stylesheetIndex >= 0, `${stylesheetPath} must be declared by the manifest`);
  assert.equal(css[stylesheetIndex - 1], "styles/40-topics.css");
  assert.equal(css[stylesheetIndex + 1], "styles/50-settings.css");

  const stylesheet = readUtf8(stylesheetPath);
  assert.match(stylesheet, /\[data-ma-glass-page=["']help["']\]/);
  assert.match(stylesheet, /#help-table/);
  assert.match(stylesheet, /\.help-td-description/);
  assert.match(
    stylesheet,
    /td\.help-td\[colspan\]:not\(\[colspan=["']1["']\]\)\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/s,
    "authored full-row help cards must keep spanning the grid"
  );
  assert.match(
    stylesheet,
    /td\.help-td\s*\{[^}]*width\s*:\s*100%\s*!important[^}]*max-width\s*:\s*100%\s*!important/s,
    "help cards must fill their responsive grid track"
  );
  assert.match(
    stylesheet,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    "the help grid must collapse to two columns"
  );
  assert.match(
    stylesheet,
    /@media\s*\(max-width:\s*620px\)[\s\S]*?grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/,
    "the help grid must collapse to one column"
  );
});

test("manifest content scripts bootstrap in their declared order", () => {
  class Element {}
  class MutationObserver {
    disconnect() {}
    observe() {}
  }

  const listeners = new Map();
  const addListener = (type, listener) => {
    const registered = listeners.get(type) || [];
    registered.push(listener);
    listeners.set(type, registered);
  };
  const root = new Element();
  root.dataset = {};
  root.style = {
    colorScheme: "",
    removeProperty() {},
    setProperty() {}
  };
  const document = {
    body: null,
    documentElement: root,
    readyState: "loading",
    addEventListener: addListener,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const media = { matches: false, addEventListener() {} };
  const window = {
    addEventListener: addListener,
    clearInterval() {},
    clearTimeout() {},
    innerHeight: 900,
    innerWidth: 1_440,
    matchMedia: () => media,
    requestAnimationFrame: () => 1,
    scrollX: 0,
    scrollY: 0,
    sessionStorage: {
      length: 0,
      key: () => null,
      removeItem() {}
    },
    setInterval: () => 1,
    setTimeout: () => 1,
    visualViewport: null
  };
  const chrome = {
    runtime: {
      getURL: (file) => `chrome-extension://test/${file}`,
      lastError: null,
      sendMessage(message, callback) {
        callback(
          message.type === "ma-glass:tab-state:load"
            ? { ok: true, state: { taskTimer: null, topicStates: {} } }
            : { ok: true }
        );
      }
    },
    storage: {
      local: { clear: (callback) => callback() },
      onChanged: { addListener() {} },
      sync: {
        get: (defaults, callback) => callback(defaults),
        set: (_patch, callback) => callback?.()
      }
    }
  };
  const sandbox = {
    chrome,
    document,
    Element,
    getComputedStyle: () => ({
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(0, 0, 0)",
      display: "block",
      opacity: "1",
      visibility: "visible"
    }),
    location: {
      href: "https://www.mathacademy.com/learn",
      pathname: "/learn"
    },
    MutationObserver,
    Node: { TEXT_NODE: 3 },
    window
  };
  const vmContext = vm.createContext(sandbox);

  for (const file of contentScriptFiles()) {
    vm.runInContext(readUtf8(file), vmContext, { filename: file });
  }

  const theme = sandbox.__maGlassThemeModules;
  const tools = sandbox.__maGlassStudyTools;
  for (const moduleName of [
    "context",
    "extensionState",
    "appearance",
    "mathEditor",
    "dailyGoal",
    "taskTimer",
    "taskCompletion",
    "courseProgress",
    "cardExport",
    "dashboard",
    "controller"
  ]) {
    assert.equal(theme?.has(moduleName), true, `theme module ${moduleName} must register`);
  }
  for (const moduleName of [
    "runtime",
    "drawing",
    "ruler",
    "protractorFace",
    "protractor",
    "compass",
    "interface",
    "controller"
  ]) {
    assert.ok(tools?.modules[moduleName], `tools module ${moduleName} must register`);
  }

  assert.equal(root.dataset.maGlassReady, "true");
  assert.equal(root.dataset.maGlassEnabled, "true");
  assert.equal(root.dataset.maGlassController, "1.24");
  assert.equal(root.dataset.maGlassToolsController, "1.24");
  assert.ok(
    (listeners.get("DOMContentLoaded") || []).length >= 2,
    "theme and tools bootstraps must defer DOM work until the document is ready"
  );
});

test("study-tool modules own instrument state behind public APIs", () => {
  const runtime = readUtf8("content/tools/runtime.js");
  const controller = removeJavaScriptComments(readUtf8("content/tools-controller.js"));

  assert.doesNotMatch(
    runtime,
    /\b(?:rulerState|protractorState|compassState)\b/,
    "instrument positions must not leak into the shared runtime state"
  );
  assert.doesNotMatch(
    controller,
    /\bstate\s*\./,
    "the composition root must use module commands and queries, not shared representation"
  );

  for (const [file, stateName] of [
    ["content/tools/ruler.js", "rulerState"],
    ["content/tools/protractor.js", "protractorState"],
    ["content/tools/compass.js", "compassState"]
  ]) {
    assert.match(
      readUtf8(file),
      new RegExp(`const\\s+${stateName}\\s*=\\s*Object\\.seal\\s*\\(`),
      `${file} must own and seal ${stateName}`
    );
  }

  assert.match(controller, /drawing\s*\.\s*resetDrawingSession\s*\(/);
  assert.match(controller, /drawing\s*\.\s*hasMarks\s*\(/);
  assert.match(controller, /interfaceModule\s*\.\s*getToolState\s*\(/);
});

test("manifest declares the extension-owned session-storage broker", () => {
  const manifest = readManifest();
  assert.equal(
    manifest.background?.service_worker,
    STORAGE_BROKER_PATH,
    `background.service_worker must be ${STORAGE_BROKER_PATH}`
  );

  const broker = readUtf8(STORAGE_BROKER_PATH);
  assert.match(
    broker,
    /chrome\s*\.\s*runtime\s*\.\s*onMessage\s*\.\s*addListener\s*\(/,
    `${STORAGE_BROKER_PATH} must receive validated content-script messages`
  );
  assert.match(
    broker,
    /chrome\s*\.\s*storage\s*\.\s*session\s*\.\s*(?:get|set)\s*\(/,
    `${STORAGE_BROKER_PATH} must store transient state in chrome.storage.session`
  );
  assert.match(
    broker,
    /sender\s*\?\.\s*id\s*!==\s*chrome\s*\.\s*runtime\s*\.\s*id/,
    `${STORAGE_BROKER_PATH} must reject messages from another extension`
  );
  assert.match(
    broker,
    /!\s*isMathAcademyUrl\s*\(\s*sender\s*\.\s*url\s*\)/,
    `${STORAGE_BROKER_PATH} must validate the sender's Math Academy URL`
  );

  const messagePattern = /["'](ma-glass:tab-state:[a-z-]+)["']/g;
  const brokerMessages = new Set(
    [...broker.matchAll(messagePattern)].map((match) => match[1])
  );
  const contentMessages = new Set();
  for (const contentScript of manifest.content_scripts || []) {
    for (const file of contentScript.js || []) {
      for (const match of readUtf8(file).matchAll(messagePattern)) {
        contentMessages.add(match[1]);
      }
    }
  }

  assert.ok(contentMessages.size > 0, "content scripts must use the tab-state broker");
  assert.deepEqual(
    [...brokerMessages].sort(),
    [...contentMessages].sort(),
    "background broker and content scripts must agree on every tab-state message type"
  );
});

test("storage broker normalizes topic state relationships, recency, and limits", () => {
  const now = 2_000_000_000_000;
  const chrome = {
    runtime: {
      id: "test-extension-id",
      onMessage: { addListener() {} }
    },
    storage: {
      session: {
        async get() {
          return {};
        },
        async remove() {},
        async set() {}
      }
    },
    tabs: {
      onRemoved: { addListener() {} },
      onReplaced: { addListener() {} }
    }
  };
  const context = { chrome, URL };

  vm.runInNewContext(
    `${readUtf8(STORAGE_BROKER_PATH)}\n` +
      "globalThis.testNormalizeTabState = normalizeTabState;",
    context,
    { filename: STORAGE_BROKER_PATH }
  );

  const normalize = (value) =>
    JSON.parse(JSON.stringify(context.testNormalizeTabState(value, now)));
  const topic = (courseKey, overrides = {}) => ({
    barCompleted: 2,
    courseKey,
    dayKey: "2033-05-18",
    displayCompleted: 3,
    loadedLessonCount: 6,
    todayLessonCount: 1,
    total: 10,
    updatedAt: now - 10_000,
    ...overrides
  });

  const normalized = normalize({
    taskTimer: {
      finishedAt: null,
      startedAt: now - 12 * 60 * 60 * 1000 - 1,
      taskId: "expired-task"
    },
    topicStates: {
      duplicateNewest: topic("shared-course", {
        barCompleted: 8,
        updatedAt: now - 1_000
      }),
      invalidBarCount: topic("invalid-bar", { barCompleted: 11 }),
      invalidDisplayCount: topic("invalid-display", { displayCompleted: 11 }),
      invalidLoadedCount: topic("invalid-loaded", { loadedLessonCount: 11 }),
      invalidTodayCount: topic("invalid-today", {
        loadedLessonCount: 4,
        todayLessonCount: 5
      }),
      invalidTotal: topic("invalid-total", { total: 0 }),
      expired: topic("expired-course", {
        updatedAt: now - 36 * 60 * 60 * 1000 - 1
      }),
      duplicateOlder: topic("shared-course", {
        barCompleted: 1,
        updatedAt: now - 5_000
      })
    }
  });

  assert.equal(normalized.taskTimer, null, "expired task timers must be rejected");
  assert.deepEqual(
    Object.keys(normalized.topicStates),
    ["shared-course"],
    "malformed and expired topic states must be rejected"
  );
  assert.equal(
    normalized.topicStates["shared-course"].barCompleted,
    8,
    "the newest duplicate course state must win"
  );

  const manyTopics = {};
  for (let index = 0; index < 35; index += 1) {
    const suffix = String(index).padStart(2, "0");
    manyTopics[`entry-${suffix}`] = topic(`course-${suffix}`, {
      updatedAt: now - (34 - index) * 1_000
    });
  }

  const limited = normalize({ topicStates: manyTopics });
  const retainedCourses = Object.keys(limited.topicStates);
  assert.equal(retainedCourses.length, 32, "at most 32 unique courses may be retained");
  assert.deepEqual(
    retainedCourses,
    Array.from(
      { length: 32 },
      (_unused, index) => `course-${String(34 - index).padStart(2, "0")}`
    ),
    "the 32 newest unique course states must be retained in recency order"
  );
});

test("storage broker rejects closing tabs and removes state after accepted writes", async () => {
  let messageListener;
  let removedListener;
  let replacedListener;
  let resolveRead;
  let markReadStarted;
  let markRemoved;
  const readGate = new Promise((resolve) => {
    resolveRead = resolve;
  });
  const readStarted = new Promise((resolve) => {
    markReadStarted = resolve;
  });
  const removalFinished = new Promise((resolve) => {
    markRemoved = resolve;
  });
  const operations = [];

  const chrome = {
    runtime: {
      id: "test-extension-id",
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    },
    storage: {
      session: {
        async get(key) {
          operations.push(`get:${key}`);
          markReadStarted();
          return readGate;
        },
        async remove(key) {
          operations.push(`remove:${key}`);
          markRemoved();
        },
        async set(update) {
          operations.push(`set:${Object.keys(update)[0]}`);
        }
      }
    },
    tabs: {
      onRemoved: {
        addListener(listener) {
          removedListener = listener;
        }
      },
      onReplaced: {
        addListener(listener) {
          replacedListener = listener;
        }
      }
    }
  };

  vm.runInNewContext(readUtf8(STORAGE_BROKER_PATH), { chrome, URL }, {
    filename: STORAGE_BROKER_PATH
  });
  assert.equal(typeof messageListener, "function", "broker must register onMessage");
  assert.equal(typeof removedListener, "function", "broker must register tabs.onRemoved");
  assert.equal(typeof replacedListener, "function", "broker must register tabs.onReplaced");

  const tabId = 27;
  const sender = {
    frameId: 0,
    id: chrome.runtime.id,
    tab: { id: tabId },
    url: "https://www.mathacademy.com/learn"
  };
  const acceptedResponse = new Promise((resolve) => {
    const keepsChannelOpen = messageListener(
      {
        timer: {
          finishedAt: null,
          startedAt: Date.now(),
          taskId: "task-27"
        },
        type: "ma-glass:tab-state:set-task"
      },
      sender,
      resolve
    );
    assert.equal(keepsChannelOpen, true, "accepted async write must keep the response channel open");
  });
  await readStarted;

  removedListener(tabId);
  assert.deepEqual(
    operations,
    [`get:ma-glass-tab-state:${tabId}`],
    "cleanup must wait behind the already accepted write"
  );

  let rejectedResponse;
  const rejectedReturn = messageListener(
    { type: "ma-glass:tab-state:load" },
    sender,
    (response) => {
      rejectedResponse = response;
    }
  );
  assert.equal(rejectedReturn, false, "closing tab must reject new messages synchronously");
  assert.equal(rejectedResponse?.ok, false, "closing tab must receive an explicit failure response");

  resolveRead({});
  const accepted = await acceptedResponse;
  assert.equal(accepted?.ok, true, "write accepted before tab closure must finish normally");
  await removalFinished;
  assert.deepEqual(
    operations,
    [
      `get:ma-glass-tab-state:${tabId}`,
      `set:ma-glass-tab-state:${tabId}`,
      `remove:ma-glass-tab-state:${tabId}`
    ],
    "tab-state removal must be serialized after its pending write"
  );
});

test("one-release Web Storage migration is narrowly confined", () => {
  const themeSource = readThemeSource();
  const migration = extractNamedFunction(themeSource, "clearLegacyHostSessionData");
  const migrationCode = removeJavaScriptComments(migration.source);
  const outsideMigration = removeJavaScriptComments(
    themeSource.slice(0, migration.start) + themeSource.slice(migration.end)
  );
  const toolsCode = removeJavaScriptComments(readStudyToolsSource());

  assert.match(
    themeSource,
    /const\s+LEGACY_TASK_TIMER_KEY\s*=\s*["']ma-glass-task-timer-v1["']\s*;/,
    "legacy migration must target only the exact 2.0.3 task-timer key"
  );
  assert.match(
    themeSource,
    /const\s+LEGACY_TOPIC_STATS_PREFIX\s*=\s*["']ma-glass-topic-progress-v1:["']\s*;/,
    "legacy migration must target only the exact 2.0.3 topic-state prefix"
  );
  assert.equal(
    [...migrationCode.matchAll(/\bwindow\s*\.\s*sessionStorage\b/g)].length,
    1,
    "migration must acquire window.sessionStorage exactly once"
  );

  const storageMembers = new Set(
    [...migrationCode.matchAll(/\bstorage\s*\.\s*([A-Za-z_$][\w$]*)/g)]
      .map((match) => match[1])
  );
  assert.deepEqual(
    [...storageMembers].sort(),
    ["key", "length", "removeItem"],
    "migration may use only sessionStorage.length, key(), and removeItem()"
  );
  assert.doesNotMatch(
    migrationCode,
    /\bstorage\s*\[/,
    "migration must not bypass the method allowlist with computed property access"
  );
  assert.doesNotMatch(
    migrationCode,
    /\.\s*(?:getItem|setItem|values)\b/,
    "migration must never read values or write host-page Web Storage"
  );
  assert.doesNotMatch(
    outsideMigration,
    /\b(?:localStorage|sessionStorage)\b/,
    "theme controller may use Web Storage only inside clearLegacyHostSessionData"
  );
  assert.doesNotMatch(
    toolsCode,
    /\b(?:localStorage|sessionStorage)\b/,
    "tools controller must never access host-page Web Storage"
  );
});

test("legacy migration removes namespaced keys without reading stored values", () => {
  const migration = extractNamedFunction(
    readThemeSource(),
    "clearLegacyHostSessionData"
  ).source;
  const keys = [
    "unrelated-site-state",
    "ma-glass-task-timer-v1",
    "ma-glass-task-timer-v10",
    "ma-glass-topic-progress-v1",
    "ma-glass-topic-progress-v1:course-42",
    "ma-glass-topic-progress-v2:course-42"
  ];
  const removed = [];
  const memberAccesses = [];
  const sessionStorage = new Proxy({}, {
    get(_target, property) {
      memberAccesses.push(String(property));
      if (property === "length") return keys.length;
      if (property === "key") return (index) => keys[index] ?? null;
      if (property === "removeItem") {
        return (key) => {
          removed.push(key);
          const index = keys.indexOf(key);
          if (index >= 0) keys.splice(index, 1);
        };
      }
      throw new Error(`unexpected sessionStorage member: ${String(property)}`);
    }
  });

  vm.runInNewContext(
    `
      const LEGACY_TASK_TIMER_KEY = "ma-glass-task-timer-v1";
      const LEGACY_TOPIC_STATS_PREFIX = "ma-glass-topic-progress-v1:";
      ${migration}
      clearLegacyHostSessionData();
    `,
    { window: { sessionStorage } },
    { filename: "legacy-session-migration.test.js" }
  );

  assert.deepEqual(
    removed.sort(),
    ["ma-glass-task-timer-v1", "ma-glass-topic-progress-v1:course-42"].sort()
  );
  assert.deepEqual(
    keys,
    [
      "unrelated-site-state",
      "ma-glass-task-timer-v10",
      "ma-glass-topic-progress-v1",
      "ma-glass-topic-progress-v2:course-42"
    ]
  );
  assert.deepEqual(
    [...new Set(memberAccesses)].sort(),
    ["key", "length", "removeItem"],
    "migration must not inspect stored values"
  );
});

test("tab-state timeout falls back to memory without blocking appearance readiness", () => {
  const source = readThemeSource();
  const sendTabStateMessage = extractNamedFunction(source, "sendTabStateMessage").source;
  const loadTabState = extractNamedFunction(source, "loadTabState").source;
  const finishLoading = extractNamedFunction(source, "finishLoading").source;
  const timers = createManualTimers();
  let runtimeCallback;
  const sentMessages = [];
  const root = {
    dataset: {
      maGlassReady: "false",
      maGlassSessionPersistence: "pending"
    }
  };
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        sentMessages.push(message);
        runtimeCallback = callback;
      }
    }
  };
  const context = {
    chrome,
    document: { body: {} },
    root,
    window: {
      clearTimeout: (id) => timers.clearTimeout(id),
      setTimeout: (callback, delay) => timers.setTimeout(callback, delay)
    }
  };

  vm.runInNewContext(
    `
      const context = { extensionRequestTimeout: 1500 };
      let extensionContextInvalidated = false;
      let tabStateLoaded = false;
      let hasLoaded = false;
      let effectiveEnabled = false;
      let preferencesLoaded = false;
      let storageReady = false;
      let settings = { enabled: true, theme: "system" };
      let hydrated = 0;
      let dashboardScans = 0;

      function runExtensionOperation(operation) {
        if (extensionContextInvalidated) return { ok: false, value: undefined };
        try {
          return { ok: true, value: operation() };
        } catch (_error) {
          extensionContextInvalidated = true;
          return { ok: false, value: undefined };
        }
      }
      function readRuntimeLastError() {
        return chrome.runtime.lastError || null;
      }
      function hydrateTabState() {
        hydrated += 1;
      }
      function scheduleDashboardScan() {
        dashboardScans += 1;
      }
      function handleTabStateLoaded() {
        if (hasLoaded && effectiveEnabled && document.body) {
          scheduleDashboardScan();
        }
      }
      function applySettings(nextSettings) {
        effectiveEnabled = Boolean(storageReady && nextSettings.enabled);
      }

      ${sendTabStateMessage}
      ${loadTabState}
      ${finishLoading}

      globalThis.testApi = {
        finishPreferences() {
          preferencesLoaded = true;
          finishLoading();
        },
        loadTabState() {
          loadTabState(handleTabStateLoaded);
        },
        state() {
          return {
            dashboardScans,
            effectiveEnabled,
            hasLoaded,
            hydrated,
            storageReady,
            tabStateLoaded
          };
        }
      };
    `,
    context,
    { filename: "tab-state-readiness.test.js" }
  );

  context.testApi.loadTabState();
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "ma-glass:tab-state:load");
  assert.deepEqual(timers.delays, [1500], "tab-state request must have a bounded timeout");
  assert.equal(context.testApi.state().tabStateLoaded, false);

  context.testApi.finishPreferences();
  assert.equal(root.dataset.maGlassReady, "true", "appearance readiness must not await tab state");
  assert.equal(context.testApi.state().effectiveEnabled, true);
  assert.equal(context.testApi.state().tabStateLoaded, false);

  timers.runDelay(1500);
  assert.equal(root.dataset.maGlassSessionPersistence, "memory-only");
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.testApi.state())),
    {
      dashboardScans: 1,
      effectiveEnabled: true,
      hasLoaded: true,
      hydrated: 0,
      storageReady: true,
      tabStateLoaded: true
    }
  );

  runtimeCallback({ ok: true, state: { topicStates: {} } });
  assert.equal(
    root.dataset.maGlassSessionPersistence,
    "memory-only",
    "late broker response must not overwrite the timeout fallback"
  );
  assert.equal(context.testApi.state().hydrated, 0, "late broker state must be ignored");
});

test("theme shortcut accepts one trusted key press and changes only the theme", () => {
  const handler = removeJavaScriptComments(
    findShortcutHandler(readThemeSource())
  );

  assert.match(
    handler,
    /!\s*event\s*\.\s*isTrusted\b/,
    "KeyL shortcut must reject synthetic keyboard events"
  );
  assert.match(
    handler,
    /\bevent\s*\.\s*repeat\b/,
    "KeyL shortcut must ignore repeated keydown events"
  );

  const storageWritePattern = /chrome\s*\.\s*storage\s*\.\s*sync\s*\.\s*set\s*\(\s*\{([\s\S]*?)\}\s*(?:,|\))/g;
  const storageWrites = [...handler.matchAll(storageWritePattern)];
  assert.ok(storageWrites.length > 0, "KeyL shortcut must persist its theme change");
  for (const write of storageWrites) {
    assert.match(write[1], /\btheme\s*:/, "KeyL shortcut storage write must contain theme");
    assert.doesNotMatch(
      write[1],
      /(?:\benabled\b|["']enabled["'])\s*:?/,
      "KeyL shortcut must never change the user's enabled/paused preference"
    );
  }
});

test("card export annotates eligible task lesson cards once and prints only from a trusted action", () => {
  const harness = createCardExportHarness();

  assert.deepEqual(
    Object.keys(harness.api).sort(),
    ["annotateLessonCards", "setEnabled"],
    "card export must expose commands without leaking its print transaction"
  );

  harness.api.setEnabled(true);
  harness.api.annotateLessonCards();
  harness.api.annotateLessonCards();

  assert.equal(harness.controls(harness.cards.tutorial).length, 1);
  assert.equal(harness.controls(harness.cards.example).length, 1);
  assert.equal(
    harness.controls(harness.cards.question).length,
    0,
    "interactive question cards are outside the PDF export scope"
  );
  assert.equal(
    harness.controls(harness.cards.nestedTutorial).length,
    0,
    "tutorial content must be a direct child of the lesson card"
  );
  assert.equal(
    harness.controls(harness.cards.outside).length,
    0,
    "cards outside the direct #steps hierarchy must not be annotated"
  );
  assert.equal(
    harness.controls(harness.cards.topicReference).length,
    0,
    "topic-reference cards must not be discovered through the task route family"
  );

  const control = harness.controls(harness.cards.tutorial)[0];
  assert.equal(control.tagName, "A", "the export action must keep native link semantics");
  assert.ok(control.getAttribute("href"), "the export link must be keyboard actionable");
  assert.equal(control.getAttribute("aria-label"), "Save this card as PDF");

  const syntheticClick = control.emit("click", { isTrusted: false });
  assert.equal(syntheticClick.defaultPrevented, true);
  assert.equal(harness.printCalls(), 0, "synthetic host-page events must not open print preview");
  assert.equal(harness.root.dataset.maGlassCardPrinting, undefined);
  assert.equal(harness.printMarkers().length, 0);

  const trustedClick = control.emit("click", { isTrusted: true });
  assert.equal(trustedClick.defaultPrevented, true);
  assert.equal(harness.printCalls(), 1, "one trusted activation must open one native print preview");
  assert.deepEqual(
    harness.printSnapshots[0],
    { rootPrinting: "true", targets: ["tutorial"] },
    "native print must see exactly the card that owns the activated link"
  );
  assert.equal(harness.root.dataset.maGlassCardPrinting, undefined);
  assert.equal(harness.printMarkers().length, 0, "the synchronous print return must clean its state");
  assert.equal(harness.document.title, "Acceleration lesson", "printing must restore the page title");
  assert.equal(control.getAttribute("aria-disabled"), null);

  harness.setPrintHook(() => harness.dispatchWindow("afterprint"));
  control.emit("click", { isTrusted: true });
  assert.equal(harness.printCalls(), 2);
  harness.dispatchWindow("afterprint");
  assert.equal(harness.root.dataset.maGlassCardPrinting, undefined);
  assert.equal(harness.printMarkers().length, 0, "afterprint must remove every transient marker");
  assert.equal(harness.document.title, "Acceleration lesson", "afterprint must restore the page title");
  assert.equal(control.getAttribute("aria-disabled"), null);

  harness.setPrintHook(() => harness.api.setEnabled(false));
  control.emit("click", { isTrusted: true });
  assert.equal(harness.printCalls(), 3);
  assert.equal(harness.root.dataset.maGlassCardPrinting, undefined);
  assert.equal(harness.printMarkers().length, 0, "disabling must clean an active print transaction");
  assert.equal(harness.controls(harness.cards.tutorial).length, 0);
  assert.equal(harness.controls(harness.cards.example).length, 0);
});

test("card export revalidates that a mounted card still belongs to its authoritative container", () => {
  const harness = createCardExportHarness();
  harness.api.setEnabled(true);
  harness.api.annotateLessonCards();

  const card = harness.cards.tutorial;
  const control = harness.controls(card)[0];
  assert.ok(control, "the task card must begin as eligible");

  harness.document.body.append(card);
  const trustedClick = control.emit("click", { isTrusted: true });

  assert.equal(trustedClick.defaultPrevented, true);
  assert.equal(
    harness.printCalls(),
    0,
    "a stale control must not print after its card leaves #steps"
  );
  assert.equal(harness.root.dataset.maGlassCardPrinting, undefined);
  assert.equal(harness.printMarkers().length, 0);
  assert.equal(harness.document.title, "Acceleration lesson");
});

test("card export cleans an active print transaction when the document becomes hidden", () => {
  const harness = createCardExportHarness();
  harness.api.setEnabled(true);
  harness.api.annotateLessonCards();

  const control = harness.controls(harness.cards.tutorial)[0];
  let stateBeforeVisibilityChange;
  let stateAfterVisibilityChange;
  harness.setPrintHook(() => {
    stateBeforeVisibilityChange = {
      busy: control.getAttribute("aria-disabled"),
      markerCount: harness.printMarkers().length,
      printing: harness.root.dataset.maGlassCardPrinting,
      title: harness.document.title
    };
    harness.setDocumentHidden(true);
    harness.dispatchDocument("visibilitychange");
    stateAfterVisibilityChange = {
      busy: control.getAttribute("aria-disabled"),
      markerCount: harness.printMarkers().length,
      printing: harness.root.dataset.maGlassCardPrinting,
      title: harness.document.title
    };
  });

  control.emit("click", { isTrusted: true });

  assert.equal(harness.printCalls(), 1);
  assert.equal(stateBeforeVisibilityChange.printing, "true");
  assert.ok(stateBeforeVisibilityChange.markerCount > 0);
  assert.equal(stateBeforeVisibilityChange.busy, "true");
  assert.notEqual(stateBeforeVisibilityChange.title, "Acceleration lesson");
  assert.deepEqual(stateAfterVisibilityChange, {
    busy: null,
    markerCount: 0,
    printing: undefined,
    title: "Acceleration lesson"
  });
  assert.equal(harness.root.dataset.maGlassCardPrinting, undefined);
  assert.equal(harness.printMarkers().length, 0);
  assert.equal(control.getAttribute("aria-disabled"), null);
  assert.equal(harness.document.title, "Acceleration lesson");
});

test("card export annotates only complete non-question cards on numeric topic routes", () => {
  const harness = createCardExportHarness({ pathname: "/topics/688" });

  harness.api.setEnabled(true);
  harness.api.annotateLessonCards();
  harness.api.annotateLessonCards();

  assert.equal(harness.controls(harness.cards.topicReference).length, 1);
  assert.equal(harness.controls(harness.cards.topicExample).length, 1);
  assert.equal(
    harness.controls(harness.cards.topicQuestion).length,
    0,
    "a topic step containing .question must never receive an export action"
  );
  assert.equal(
    harness.controls(harness.cards.topicQuestionWidget).length,
    0,
    "a topic step containing .questionWidget must never receive an export action"
  );
  assert.equal(
    harness.controls(harness.cards.topicMissingHeader).length,
    0,
    "a topic step without .stepHeader is not a complete exportable card"
  );
  assert.equal(
    harness.controls(harness.cards.topicMissingName).length,
    0,
    "a topic step without .stepName is not a complete exportable card"
  );
  assert.equal(
    harness.controls(harness.cards.tutorial).length,
    0,
    "task cards must not be discovered through the topic route family"
  );
  assert.equal(harness.controls(harness.cards.example).length, 0);
  assert.equal(harness.controls(harness.cards.outside).length, 0);

  const control = harness.controls(harness.cards.topicReference)[0];
  const syntheticClick = control.emit("click", { isTrusted: false });
  assert.equal(syntheticClick.defaultPrevented, true);
  assert.equal(harness.printCalls(), 0, "synthetic topic-card events must not open print preview");

  const trustedClick = control.emit("click", { isTrusted: true });
  assert.equal(trustedClick.defaultPrevented, true);
  assert.equal(harness.printCalls(), 1);
  assert.deepEqual(
    harness.printSnapshots[0],
    { rootPrinting: "true", targets: ["topicReference"] },
    "topic printing must isolate exactly the selected reference card"
  );
  assert.equal(harness.root.dataset.maGlassCardPrinting, undefined);
  assert.equal(harness.printMarkers().length, 0);
  assert.equal(harness.document.title, "Acceleration lesson");
  assert.equal(control.getAttribute("aria-disabled"), null);
});

test("card export accepts only exact numeric topic detail routes", () => {
  const trailingSlash = createCardExportHarness({ pathname: "/topics/688/" });
  trailingSlash.api.setEnabled(true);
  trailingSlash.api.annotateLessonCards();
  assert.equal(
    trailingSlash.controls(trailingSlash.cards.topicReference).length,
    1,
    "a numeric topic detail route may have one trailing slash"
  );

  for (const pathname of [
    "/topics",
    "/topics/",
    "/topics/not-an-id",
    "/topics/688/more",
    "/settings"
  ]) {
    const harness = createCardExportHarness({ pathname });
    harness.api.setEnabled(true);
    harness.api.annotateLessonCards();
    assert.equal(
      Object.values(harness.cards).reduce(
        (count, card) => count + harness.controls(card).length,
        0
      ),
      0,
      `${pathname} must not be treated as a topic detail route`
    );
  }
});

test("card export uses native local print with an isolated, flowing card stylesheet", () => {
  const manifest = readManifest();
  const [{ js = [], css = [] }] = manifest.content_scripts || [];
  const modulePath = "content/theme/card-export.js";
  const stylesheetPath = "styles/66-card-export.css";
  const moduleIndex = js.indexOf(modulePath);
  const stylesheetIndex = css.indexOf(stylesheetPath);

  assert.ok(moduleIndex >= 0, `${modulePath} must be declared by the manifest`);
  assert.ok(
    moduleIndex < js.indexOf("content/theme/dashboard.js") &&
      moduleIndex < js.indexOf("content/theme-controller.js"),
    "card export must register before its dashboard and controller consumers"
  );
  assert.ok(stylesheetIndex >= 0, `${stylesheetPath} must be declared by the manifest`);
  assert.equal(css[stylesheetIndex - 1], "styles/65-reading.css");
  assert.equal(css[stylesheetIndex + 1], "styles/70-study-instruments.css");

  const code = removeJavaScriptComments(readUtf8(modulePath));
  assert.match(code, /!\s*event\s*\.\s*isTrusted\b/);
  assert.match(code, /\bwindow\s*\.\s*print\s*\(\s*\)/);
  assert.match(code, /data-ma-glass-card-export-control/);
  assert.match(code, /data-ma-glass-print-target/);
  assert.match(code, /data-ma-glass-print-ancestor/);
  assert.match(code, /data-ma-glass-print-excluded/);

  const nonLocalExportPaths = [
    { label: "downloads API", pattern: /\bchrome\s*\.\s*downloads\b/ },
    { label: "Blob PDF generation", pattern: /(?:\bnew\s+)?\bBlob\s*\(/ },
    { label: "object URL generation", pattern: /\bcreateObjectURL\s*\(/ },
    { label: "canvas rasterization", pattern: /\bcreateElement\s*\(\s*["']canvas["']\s*\)|\bgetContext\s*\(/ },
    { label: "canvas data URL", pattern: /\btoDataURL\s*\(/ },
    { label: "canvas Blob conversion", pattern: /\btoBlob\s*\(/ },
    { label: "download attribute", pattern: /(?:\.\s*download\s*=|setAttribute\s*\(\s*["']download["'])/ },
    { label: "third-party raster/PDF helper", pattern: /\b(?:html2canvas|jsPDF)\b/i }
  ];
  for (const { label, pattern } of nonLocalExportPaths) {
    assert.doesNotMatch(code, pattern, `${modulePath} must not use ${label}`);
  }

  const stylesheet = readUtf8(stylesheetPath);
  const printStart = stylesheet.indexOf("@media print");
  assert.ok(printStart >= 0, `${stylesheetPath} must define a print-only composition`);
  const screenStyles = stylesheet.slice(0, printStart);
  const printStyles = stylesheet.slice(printStart);
  for (const route of ["learn", "topic"]) {
    assert.match(
      screenStyles,
      new RegExp(`\\[data-ma-glass-page=["']${route}["']\\]`),
      `${route} pages must opt into the on-screen export control styles`
    );
  }
  for (const container of ["#steps", "#lessonContent"]) {
    assert.match(
      screenStyles,
      new RegExp(container),
      `${container} must be represented by the on-screen card styles`
    );
  }
  assert.match(screenStyles, /\.ma-glass-card-export-link/);
  assert.match(
    screenStyles,
    /#lessonContent\s*>\s*\.step:has\(\s*\.stepHeader\s*>\s*\.ma-glass-card-export-link\s*\)\s*\.stepHeader\s+\.stepName\s*\{[^}]*max-width\s*:\s*100%\s*!important/s,
    "topic card titles must release the site's narrow max-width when export controls are mounted"
  );
  assert.match(printStyles, /\[data-ma-glass-card-printing=["']true["']\]/);
  assert.match(
    printStyles,
    /\[data-ma-glass-page=["']topic["']\]/,
    "numeric topic exports must enter the same isolated print transaction"
  );
  for (const marker of [
    "data-ma-glass-card-printing",
    "data-ma-glass-print-target",
    "data-ma-glass-print-ancestor",
    "data-ma-glass-print-excluded"
  ]) {
    assert.match(printStyles, new RegExp(`\\[${marker}=["']true["']\\]`));
  }
  assert.match(
    printStyles,
    /\[data-ma-glass-print-excluded=["']true["']\][^{]*\{[^}]*display\s*:\s*none\s*!important/s,
    "non-target print branches must be removed from layout"
  );
  assert.match(
    printStyles,
    /\[data-ma-glass-print-target=["']true["']\][^{]*\{[^}]*height\s*:\s*auto\s*!important[^}]*overflow\s*:\s*visible\s*!important/s,
    "the selected card must remain able to flow across PDF pages"
  );
  const topicTargetRule = printStyles.match(
    /(?:#lessonContent|:is\([^)]*#lessonContent[^)]*\))\s*>\s*\.step\[data-ma-glass-print-target=["']true["']\]\s*\{([^}]*)\}/s
  );
  assert.ok(topicTargetRule, "topic printing must style the exact #lessonContent card family");
  assert.match(topicTargetRule[1], /height\s*:\s*auto\s*!important/);
  assert.match(topicTargetRule[1], /overflow\s*:\s*visible\s*!important/);
  assert.match(topicTargetRule[1], /break-inside\s*:\s*auto\s*!important/);
  assert.match(printStyles, /break-inside\s*:\s*auto\s*!important/);
  assert.match(
    printStyles,
    /\[data-ma-glass-print-target=["']true["']\][\s\S]*\[data-ma-glass-card-export-control=["']true["']\][\s\S]*display\s*:\s*none\s*!important/,
    "the export and help controls must not appear in the saved card"
  );
  assert.match(
    printStyles,
    /(?:#lessonContent|:is\([^)]*#lessonContent[^)]*\))\s*>\s*\.step\[data-ma-glass-print-target=["']true["']\][\s\S]*\[data-ma-glass-card-export-control=["']true["']\][\s\S]*display\s*:\s*none\s*!important/,
    "topic-card export and help controls must not appear in the saved card"
  );
});

test("discarded tool gestures preserve a full undo history until a commit", () => {
  const source = readStudyToolsSource();
  const pushUndoSnapshot = extractNamedFunction(source, "pushUndoSnapshot").source;
  const trimUndoStack = extractNamedFunction(source, "trimUndoStack").source;
  const endActivePointer = extractNamedFunction(source, "endActivePointer").source;
  const context = {};

  vm.runInNewContext(
    `
      const MAX_UNDO_STEPS = 3;
      const strokes = [];
      const undoStack = [
        { action: "oldest", strokes: [] },
        { action: "middle", strokes: [] },
        { action: "newest", strokes: [] }
      ];
      const state = {
        activeInteraction: null,
        activePointerId: null,
        activePointerTarget: null,
        activeStroke: null,
        strokes,
        undoStack
      };
      const elements = { compass: null, protractor: null, ruler: null };

      function isMarkInteraction() { return false; }
      function removeStroke() {}
      function updateClearButton() {}

      ${pushUndoSnapshot}
      ${trimUndoStack}
      ${endActivePointer}

      const modules = {
        drawing: { removeStroke, trimUndoStack, updateClearButton }
      };

      globalThis.testApi = {
        actions() { return undoStack.map(({ action }) => action); },
        commit() {
          state.activeInteraction = { kind: "erase" };
          pushUndoSnapshot("committed");
          endActivePointer();
        },
        discard() {
          state.activeInteraction = { kind: "erase" };
          pushUndoSnapshot("discarded");
          endActivePointer({ discardUndoSnapshot: true });
        }
      };
    `,
    context,
    { filename: "tools-undo-history.test.js" }
  );

  context.testApi.discard();
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.testApi.actions())),
    ["oldest", "middle", "newest"],
    "a no-op gesture must remove only its provisional snapshot"
  );

  context.testApi.commit();
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.testApi.actions())),
    ["middle", "newest", "committed"],
    "the oldest snapshot may be evicted only after a committed mutation"
  );
});

test("eraser hit-tests the swept capsule without subdividing long moves", () => {
  const source = readStudyToolsSource();
  const eraseAlongPath = extractNamedFunction(source, "eraseAlongPath").source;
  const geometryFunctions = [
    "distanceToSegment",
    "strokeHitsPoint",
    "arcContainsAngle",
    "pointOnSegment",
    "segmentCrossProduct",
    "segmentsIntersect",
    "distanceBetweenSegments",
    "getSegmentCircleIntersectionAngles",
    "arcHitsSegment",
    "strokeHitsSegment"
  ].map((name) => extractNamedFunction(source, name).source).join("\n");
  const eraseCode = removeJavaScriptComments(eraseAlongPath);

  assert.equal(
    [...eraseCode.matchAll(/\bstrokes\s*\.\s*filter\s*\(/g)].length,
    1,
    "one pointer path must filter the stroke list exactly once"
  );
  assert.match(
    eraseCode,
    /\bstrokeHitsSegment\s*\(/,
    "eraser must hit-test the complete segment swept between pointer samples"
  );
  assert.doesNotMatch(
    eraseCode,
    /\bMath\s*\.\s*ceil\s*\(/,
    "eraser must not create an unbounded distance-based subdivision loop"
  );

  const context = {};
  vm.runInNewContext(
    `
      function clampValue(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
      }
      function normalizePositiveAngle(angle) {
        const fullTurn = Math.PI * 2;
        return ((angle % fullTurn) + fullTurn) % fullTurn;
      }
      function resolveStrokeWidth(stroke) {
        return stroke.style?.width || 0;
      }
      const runtime = { clampValue, normalizePositiveAngle };

      ${geometryFunctions}

      globalThis.testApi = {
        hits(stroke, from, to, radius) {
          return strokeHitsSegment(stroke, from, to, radius);
        }
      };
    `,
    context,
    { filename: "tools-eraser-geometry.test.js" }
  );

  const straightStroke = {
    kind: "freehand",
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    style: { width: 2 }
  };
  assert.equal(
    context.testApi.hits(
      straightStroke,
      { x: 50, y: -1_000 },
      { x: 50, y: 1_000 },
      1
    ),
    true,
    "a long pointer jump must erase a stroke crossed between its endpoints"
  );

  const quarterArc = {
    arc: {
      center: { x: 0, y: 0 },
      radius: 20,
      startAngle: 0,
      sweep: Math.PI / 2
    },
    kind: "arc",
    style: { width: 2 }
  };
  assert.equal(
    context.testApi.hits(quarterArc, { x: 14, y: 10 }, { x: 14, y: 18 }, 1),
    true,
    "the swept capsule must erase the drawn part of an arc"
  );
  assert.equal(
    context.testApi.hits(quarterArc, { x: -14, y: 10 }, { x: -14, y: 18 }, 1),
    false,
    "the swept capsule must not erase an undrawn part of the same circle"
  );
});

test("trusted Escape disables tools and restores focus to the owning control", () => {
  const handler = extractNamedFunction(
    readStudyToolsSource(),
    "handleKeydown"
  ).source;
  const context = {};

  vm.runInNewContext(
    `
      class Element {}
      class TestElement extends Element {
        constructor(owner = null) {
          super();
          this.owner = owner;
          this.focused = false;
        }
        contains(element) { return element?.owner === this; }
        focus() { this.focused = true; }
      }

      const protractor = new TestElement();
      const protractorSettings = new TestElement();
      const ruler = new TestElement();
      const compass = new TestElement();
      const drawingOptions = new TestElement();
      const protractorToggle = new TestElement();
      const rulerToggle = new TestElement();
      const compassToggle = new TestElement();
      const drawToggle = new TestElement();
      const launcher = new TestElement();
      const toggles = {
        compass: compassToggle,
        drawing: drawToggle,
        protractor: protractorToggle,
        ruler: rulerToggle
      };
      const owners = { compass, drawing: drawingOptions, protractor, ruler };
      const document = { activeElement: null };
      let active = true;
      let stateChanges = [];
      const state = { menuOpen: true };
      const elements = {
        compass,
        compassToggle,
        drawingOptions,
        drawToggle,
        launcher,
        protractor,
        protractorSettings,
        protractorToggle,
        ruler,
        rulerToggle
      };
      const interfaceModule = {
        getToolState() { return { menuOpen: state.menuOpen }; },
        hasActiveTools() { return active; },
        setToolState(nextState) { stateChanges.push(nextState); }
      };
      ${handler}

      function resetFocus() {
        for (const control of [...Object.values(toggles), launcher]) {
          control.focused = false;
        }
      }
      function event(overrides = {}) {
        return {
          defaultPrevented: false,
          isComposing: false,
          isTrusted: true,
          key: "Escape",
          preventDefault() { this.prevented = true; },
          repeat: false,
          stopPropagation() { this.stopped = true; },
          ...overrides
        };
      }

      globalThis.testApi = {
        syntheticIsIgnored() {
          stateChanges = [];
          handleKeydown(event({ isTrusted: false }));
          return stateChanges.length === 0;
        },
        run(ownerName, isMenuOpen = true) {
          resetFocus();
          stateChanges = [];
          state.menuOpen = isMenuOpen;
          const focusTarget = new TestElement(owners[ownerName]);
          document.activeElement = focusTarget;
          const escapeEvent = event();
          handleKeydown(escapeEvent);
          return {
            disabled: stateChanges.length === 1 &&
              Object.values(stateChanges[0]).every((value) => value === false),
            focusedOwner: toggles[ownerName].focused,
            launcherFocused: launcher.focused,
            prevented: escapeEvent.prevented === true,
            stopped: escapeEvent.stopped === true
          };
        }
      };
    `,
    context,
    { filename: "tools-escape-focus.test.js" }
  );

  assert.equal(context.testApi.syntheticIsIgnored(), true);
  for (const owner of ["drawing", "ruler", "protractor", "compass"]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.testApi.run(owner))),
      {
        disabled: true,
        focusedOwner: true,
        launcherFocused: false,
        prevented: true,
        stopped: true
      },
      `Escape must return focus from ${owner} UI to its toggle`
    );
  }
  assert.equal(
    context.testApi.run("ruler", false).launcherFocused,
    true,
    "when the menu is closed, Escape must restore focus to the launcher"
  );
});

test("BFCache lifecycle clears page-local tools and restores the idle status", () => {
  const source = readStudyToolsSource();
  const resetPageSession = extractNamedFunction(source, "resetPageSession").source;
  const handlePageHide = extractNamedFunction(source, "handlePageHide").source;
  const handlePageShow = extractNamedFunction(source, "handlePageShow").source;
  const context = {};

  vm.runInNewContext(
    `
      const location = { href: "https://www.mathacademy.com/learn" };
      let currentUrl = "https://www.mathacademy.com/old";
      const state = {
        strokes: ["stroke"],
        undoStack: ["snapshot"]
      };
      const elements = { status: { textContent: "Drawing active." } };
      let toolState = null;
      let closed = false;

      function cancelActivePointer() {}
      function setToolState(nextState) { toolState = nextState; }
      function updateClearButton() {}
      function updateProtractorReading() {}
      function updateCompassSweepReading() {}
      function renderCanvas() {}
      function resetDrawingSession() {
        state.strokes.length = 0;
        state.undoStack.length = 0;
        updateClearButton();
        renderCanvas();
      }
      function resetRuler() {}
      function resetProtractor() {}
      function resetCompass() {}
      function closeMenu() { closed = true; }
      const runtime = { cancelActivePointer };
      const interfaceModule = { closeMenu, setToolState };
      const drawing = { renderCanvas, resetDrawingSession, updateClearButton };
      const protractorModule = { resetProtractor, updateProtractorReading };
      const compassModule = { resetCompass, updateCompassSweepReading };
      const rulerModule = { resetRuler };

      ${resetPageSession}
      ${handlePageHide}
      ${handlePageShow}

      globalThis.testApi = {
        dirty() {
          state.strokes.push("stroke");
          state.undoStack.push("snapshot");
          elements.status.textContent = "Drawing active.";
          toolState = null;
          closed = false;
        },
        hide(persisted) { handlePageHide({ persisted }); },
        show(persisted) { handlePageShow({ persisted }); },
        state() {
          return {
            closed,
            currentUrl,
            status: elements.status.textContent,
            strokeCount: state.strokes.length,
            toolState,
            undoCount: state.undoStack.length
          };
        }
      };
    `,
    context,
    { filename: "tools-bfcache-reset.test.js" }
  );

  context.testApi.hide(false);
  assert.equal(
    context.testApi.state().status,
    "Drawing active.",
    "ordinary pagehide must not erase the live document session"
  );

  context.testApi.hide(true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.testApi.state())),
    {
      closed: true,
      currentUrl: "https://www.mathacademy.com/old",
      status: "Choose a tool to start.",
      strokeCount: 0,
      toolState: {
        compass: false,
        drawing: false,
        protractor: false,
        ruler: false
      },
      undoCount: 0
    }
  );

  context.testApi.dirty();
  context.testApi.show(false);
  assert.equal(context.testApi.state().status, "Drawing active.");
  context.testApi.show(true);
  assert.equal(context.testApi.state().currentUrl, "https://www.mathacademy.com/learn");
  assert.equal(context.testApi.state().status, "Choose a tool to start.");
  assert.equal(context.testApi.state().strokeCount, 0);
  assert.equal(context.testApi.state().undoCount, 0);
});

test("controller version annotations agree with project documentation", () => {
  const themeController = readUtf8("content/theme-controller.js");
  const toolsController = readUtf8("content/tools-controller.js");
  const themeVersion = themeController.match(
    /root\s*\.\s*dataset\s*\.\s*maGlassController\s*=\s*["']([^"']+)["']/
  )?.[1];
  const toolsVersion = toolsController.match(
    /const\s+CONTROLLER_VERSION\s*=\s*["']([^"']+)["']/
  )?.[1];

  assert.ok(themeVersion, "theme controller must expose data-ma-glass-controller");
  assert.ok(toolsVersion, "tools controller must declare CONTROLLER_VERSION");
  assert.match(themeVersion, /^\d+\.\d+$/, "theme controller version must use major.minor form");
  assert.equal(
    toolsVersion,
    themeVersion,
    "theme and tools controller versions must advance together"
  );
  assert.match(
    toolsController,
    /root\s*\.\s*dataset\s*\.\s*maGlassToolsController\s*=\s*CONTROLLER_VERSION\b/,
    "tools controller must publish CONTROLLER_VERSION on the root element"
  );

  const documentedVersions = [];
  const documentationFiles = fs.readdirSync(ROOT)
    .filter((file) => file.endsWith(".md"));
  const annotationPattern = /data-ma-glass-(controller|tools-controller)\s*=\s*["']([^"']+)["']/g;
  for (const file of documentationFiles) {
    for (const match of readUtf8(file).matchAll(annotationPattern)) {
      documentedVersions.push({
        annotation: match[1],
        file,
        version: match[2]
      });
    }
  }

  assert.ok(
    documentedVersions.length > 0,
    "project documentation must describe the controller version annotations"
  );
  for (const { annotation, file, version } of documentedVersions) {
    assert.equal(
      version,
      themeVersion,
      `${file} documents data-ma-glass-${annotation}=${version}; expected ${themeVersion}`
    );
  }
});

test("every file referenced by the manifest is packaged", () => {
  const references = collectManifestReferences(readManifest());
  assert.ok(references.length > 0, "manifest must reference at least one packaged file");

  for (const { owner, reference } of references) {
    assert.equal(
      path.posix.normalize(reference),
      reference,
      `${owner} must use a normalized package-relative path: ${reference}`
    );
    assert.ok(
      !path.posix.isAbsolute(reference) && !reference.includes("\\"),
      `${owner} must use a package-relative POSIX path: ${reference}`
    );

    const matches = expandPackagedReference(reference);
    assert.ok(matches.length > 0, `${owner} does not match a packaged file: ${reference}`);
    for (const match of matches) {
      assert.ok(
        fs.statSync(path.join(ROOT, match)).isFile(),
        `${owner} must reference a file: ${match}`
      );
    }
  }
});

test("popup loads scripts and styles only from the extension package", () => {
  const manifest = readManifest();
  const popupPath = manifest.action?.default_popup;
  assert.ok(popupPath, "action.default_popup must be configured");
  const popupHtml = readUtf8(popupPath);
  const popupDirectory = path.posix.dirname(popupPath);

  const scriptTags = htmlTags(popupHtml, "script");
  assert.ok(scriptTags.length > 0, `${popupPath} must load its behavior from a script file`);
  for (const { attributes } of scriptTags) {
    const source = attributes.get("src");
    assertLocalAssetUrl(source, `${popupPath} script src`);
    const packagedPath = path.posix.normalize(path.posix.join(popupDirectory, source));
    assert.ok(fs.existsSync(path.join(ROOT, packagedPath)), `popup script is missing: ${packagedPath}`);
  }

  const stylesheetLinks = htmlTags(popupHtml, "link").filter(({ attributes }) =>
    (attributes.get("rel") || "").toLowerCase().split(/\s+/).includes("stylesheet")
  );
  assert.ok(stylesheetLinks.length > 0, `${popupPath} must load a packaged stylesheet`);
  for (const { attributes } of stylesheetLinks) {
    const source = attributes.get("href");
    assertLocalAssetUrl(source, `${popupPath} stylesheet href`);
    const packagedPath = path.posix.normalize(path.posix.join(popupDirectory, source));
    assert.ok(fs.existsSync(path.join(ROOT, packagedPath)), `popup stylesheet is missing: ${packagedPath}`);
    assert.doesNotMatch(
      readUtf8(packagedPath),
      /@import\s+(?:url\(\s*)?["']?(?:https?:)?\/\//i,
      `${packagedPath} must not import a remote stylesheet`
    );
  }
});

test("popup persists one-field patches and replays buffered storage changes", () => {
  const popupCode = removeJavaScriptComments(readUtf8("popup/popup.js"));
  const storageArguments = [
    ...popupCode.matchAll(/\bsyncedStorage\s*\.\s*set\s*\(\s*([A-Za-z_$][\w$]*)/g)
  ].map((match) => match[1]);
  assert.deepEqual(
    storageArguments,
    ["patch"],
    "popup storage.set must receive only the normalized one-field patch"
  );

  const popup = createPopupHarness();
  assert.equal(popup.popupWindow.getAttribute("aria-busy"), "true");
  assert.equal(popup.enabledInput.disabled, true);

  popup.emitStorageChange({ theme: { newValue: "dark" } });
  assert.equal(popup.modeLabel.textContent, "System", "loading change must stay buffered");
  popup.completeGet({ enabled: false, theme: "light" });
  assert.equal(popup.modeLabel.textContent, "Dark", "buffered loading change must win");
  assert.equal(popup.enabledInput.checked, false);
  assert.equal(popup.popupWindow.getAttribute("aria-busy"), "false");
  assert.equal(popup.enabledInput.disabled, false);

  popup.enabledInput.focus();
  popup.enabledInput.checked = true;
  popup.enabledInput.emit("change");
  assert.deepEqual(
    JSON.parse(JSON.stringify(popup.setCalls[0].patch)),
    { enabled: true },
    "enabled gesture must not overwrite theme"
  );
  assert.equal(popup.popupWindow.getAttribute("aria-busy"), "true");
  assert.equal(popup.enabledInput.disabled, true);

  popup.emitStorageChange({ theme: { newValue: "system" } });
  assert.equal(popup.modeLabel.textContent, "Dark", "saving change must stay buffered");
  popup.completeSet(0);
  assert.equal(popup.modeLabel.textContent, "System", "buffered saving change must replay");
  assert.equal(popup.enabledInput.checked, true);
  assert.equal(popup.popupWindow.getAttribute("aria-busy"), "false");

  const lightSegment = popup.segments.find(({ dataset }) => dataset.theme === "light");
  lightSegment.focus();
  lightSegment.click();
  assert.deepEqual(
    JSON.parse(JSON.stringify(popup.setCalls[1].patch)),
    { theme: "light" },
    "theme gesture must not overwrite enabled"
  );
  popup.emitStorageChange({ enabled: { newValue: false } });
  popup.completeSet(1);
  assert.equal(popup.modeLabel.textContent, "Light");
  assert.equal(popup.enabledInput.checked, false, "buffered enabled change must replay");
  assert.equal(popup.statusText.textContent, "Extension is paused");
});

test("popup clears aria-busy in terminal load and save errors", () => {
  const loadFailure = createPopupHarness();
  assert.equal(loadFailure.popupWindow.getAttribute("aria-busy"), "true");
  loadFailure.timers.runDelay(1500);
  assert.equal(loadFailure.popupWindow.getAttribute("aria-busy"), "false");
  assert.equal(loadFailure.enabledInput.disabled, true, "load error must remain noninteractive");
  assert.equal(loadFailure.body.classList.contains("is-error"), true);
  assert.equal(loadFailure.statusText.textContent, "Couldn’t load settings. Reopen to retry.");

  loadFailure.completeGet({ enabled: false, theme: "dark" });
  assert.equal(
    loadFailure.statusText.textContent,
    "Couldn’t load settings. Reopen to retry.",
    "late load callback must not escape the terminal error state"
  );

  const saveFailure = createPopupHarness();
  saveFailure.completeGet({ enabled: true, theme: "system" });
  const darkSegment = saveFailure.segments.find(({ dataset }) => dataset.theme === "dark");
  darkSegment.focus();
  darkSegment.click();
  assert.equal(saveFailure.popupWindow.getAttribute("aria-busy"), "true");
  assert.deepEqual(
    JSON.parse(JSON.stringify(saveFailure.setCalls[0].patch)),
    { theme: "dark" }
  );

  saveFailure.emitStorageChange({ enabled: { newValue: false } });
  saveFailure.timers.runDelay(1500);
  assert.equal(saveFailure.popupWindow.getAttribute("aria-busy"), "false");
  assert.equal(saveFailure.enabledInput.disabled, false, "save error must permit retry");
  assert.equal(saveFailure.body.classList.contains("is-error"), true);
  assert.equal(saveFailure.enabledInput.checked, false, "save failure must replay buffered changes");
  assert.equal(saveFailure.modeLabel.textContent, "System", "failed draft theme must roll back");
  assert.equal(
    saveFailure.statusText.textContent,
    "Couldn’t confirm saved settings. Try again."
  );

  saveFailure.completeSet(0);
  assert.equal(
    saveFailure.statusText.textContent,
    "Couldn’t confirm saved settings. Try again.",
    "late save callback must not escape the terminal error state"
  );
});

test("runtime JavaScript avoids dynamic code, network APIs, and HTML injection sinks", () => {
  const manifest = readManifest();
  const runtimeFiles = new Set();

  for (const contentScript of manifest.content_scripts || []) {
    for (const file of contentScript.js || []) runtimeFiles.add(file);
  }
  if (manifest.background?.service_worker) runtimeFiles.add(manifest.background.service_worker);
  for (const file of manifest.background?.scripts || []) runtimeFiles.add(file);

  const popupPath = manifest.action?.default_popup;
  if (popupPath) {
    const popupDirectory = path.posix.dirname(popupPath);
    for (const { attributes } of htmlTags(readUtf8(popupPath), "script")) {
      const source = attributes.get("src");
      if (source && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) {
        runtimeFiles.add(path.posix.normalize(path.posix.join(popupDirectory, source)));
      }
    }
  }

  assert.ok(runtimeFiles.size > 0, "manifest and popup must reference runtime JavaScript");
  const forbidden = [
    { label: "eval()", pattern: /\beval\s*\(/ },
    { label: "Function constructor", pattern: /(?:\bnew\s+)?\bFunction\s*\(/ },
    { label: "fetch()", pattern: /\bfetch\s*\(/ },
    { label: "XMLHttpRequest", pattern: /\bXMLHttpRequest\s*\(/ },
    { label: "WebSocket", pattern: /\bWebSocket\s*\(/ },
    { label: "EventSource", pattern: /\bEventSource\s*\(/ },
    { label: "navigator.sendBeacon()", pattern: /\bsendBeacon\s*\(/ },
    { label: "innerHTML", pattern: /(?:\.\s*innerHTML\b|\[\s*["']innerHTML["']\s*\])/ },
    { label: "outerHTML", pattern: /(?:\.\s*outerHTML\b|\[\s*["']outerHTML["']\s*\])/ },
    { label: "insertAdjacentHTML()", pattern: /\binsertAdjacentHTML\s*\(/ },
    { label: "document.write()", pattern: /\bdocument\s*\.\s*write(?:ln)?\s*\(/ }
  ];

  for (const file of runtimeFiles) {
    const source = readUtf8(file);
    const code = removeJavaScriptComments(source);
    for (const { label, pattern } of forbidden) {
      const match = pattern.exec(code);
      assert.equal(
        match,
        null,
        `${file}:${match ? lineNumberAt(code, match.index) : 1} uses forbidden ${label}`
      );
    }
  }
});

test("web-accessible SVGs contain no executable or external content", () => {
  const manifest = readManifest();
  const svgFiles = new Set();

  for (const group of manifest.web_accessible_resources || []) {
    for (const reference of group.resources || []) {
      for (const file of expandPackagedReference(reference)) {
        if (path.posix.extname(file).toLowerCase() === ".svg") svgFiles.add(file);
      }
    }
  }

  assert.ok(svgFiles.size > 0, "web_accessible_resources must expose at least one SVG");
  for (const file of svgFiles) {
    const svg = readUtf8(file);
    assert.doesNotMatch(svg, /<\s*script\b/i, `${file} must not contain <script>`);
    assert.doesNotMatch(svg, /<\s*foreignObject\b/i, `${file} must not contain <foreignObject>`);
    assert.doesNotMatch(svg, /<\s*(?:iframe|object|embed)\b/i, `${file} must not embed active content`);
    assert.doesNotMatch(svg, /<\s*!(?:DOCTYPE|ENTITY)\b/i, `${file} must not declare external entities`);
    assert.doesNotMatch(
      svg,
      /\son[a-z][\w:.-]*\s*=/i,
      `${file} must not contain inline event-handler attributes`
    );

    const hrefPattern = /\b(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    for (const match of svg.matchAll(hrefPattern)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      assert.match(value, /^#[A-Za-z_][\w:.-]*$/, `${file} has an external href: ${value}`);
    }

    const urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'\"]+))\s*\)/gi;
    for (const match of svg.matchAll(urlPattern)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      assert.match(value, /^#[A-Za-z_][\w:.-]*$/, `${file} has an external url() reference: ${value}`);
    }
  }
});

test("release ZIP contains only the current allowlisted package", () => {
  assert.ok(
    fs.existsSync(RELEASE_ARCHIVE_PATH),
    "release ZIP has not been built; rebuild it before publishing"
  );

  const archivedManifestResult = runUnzip(
    ["-p", RELEASE_ARCHIVE_PATH, "manifest.json"],
    "utf8"
  );
  if (archivedManifestResult.error?.code === "ENOENT") {
    assert.fail("system unzip is unavailable; install it to verify the release archive");
  }
  assertUnzipSucceeded(archivedManifestResult, "reading manifest.json from release ZIP");

  let archivedManifest;
  try {
    archivedManifest = JSON.parse(archivedManifestResult.stdout);
  } catch (error) {
    assert.fail(`release ZIP contains an invalid manifest.json: ${error.message}`);
  }

  const sourceManifest = readManifest();
  assert.equal(
    archivedManifest.version,
    sourceManifest.version,
    `release ZIP is stale (${archivedManifest.version || "no version"} vs ` +
      `${sourceManifest.version}); rebuild it before publishing`
  );

  const listingResult = runUnzip(["-Z1", RELEASE_ARCHIVE_PATH], "utf8");
  assertUnzipSucceeded(listingResult, "listing release ZIP");
  const rawEntries = listingResult.stdout
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, ""))
    .filter(Boolean);

  for (const rawEntry of rawEntries) {
    const entry = rawEntry.endsWith("/") ? rawEntry.slice(0, -1) : rawEntry;
    assert.equal(
      path.posix.normalize(entry),
      entry,
      `release ZIP contains a non-normalized path: ${entry}`
    );
    assert.ok(
      !path.posix.isAbsolute(entry) && !entry.startsWith("../") && !entry.includes("\\"),
      `release ZIP contains an unsafe path: ${entry}`
    );
  }
  assert.equal(
    new Set(rawEntries).size,
    rawEntries.length,
    "release ZIP must not contain duplicate entries"
  );

  const expectedEntries = expectedReleaseEntries();
  const expectedDirectories = new Set();
  for (const entry of expectedEntries) {
    let directory = path.posix.dirname(entry);
    while (directory !== ".") {
      expectedDirectories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }

  const listedDirectories = rawEntries
    .filter((entry) => entry.endsWith("/"))
    .map((entry) => entry.slice(0, -1));
  for (const directory of listedDirectories) {
    assert.ok(
      expectedDirectories.has(directory),
      `release ZIP contains a non-allowlisted directory: ${directory}/`
    );
  }

  const listedEntries = rawEntries.filter((entry) => !entry.endsWith("/"));
  assert.deepEqual(
    [...listedEntries].sort(),
    expectedEntries,
    "release ZIP entries differ from the publish allowlist"
  );

  for (const entry of expectedEntries) {
    const archivedFileResult = runUnzip(["-p", RELEASE_ARCHIVE_PATH, entry]);
    assertUnzipSucceeded(archivedFileResult, `reading ${entry} from release ZIP`);
    assert.deepEqual(
      archivedFileResult.stdout,
      fs.readFileSync(path.join(ROOT, entry)),
      `release ZIP contains a stale copy of ${entry}`
    );
  }
});
