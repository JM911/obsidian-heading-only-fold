"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const notices = [];
class MarkdownView {}
class Plugin { register() {} addRibbonIcon() { throw Error("Left ribbon must not be registered"); } addStatusBarItem() { return { createEl() { return { addEventListener() {} }; } }; } addCommand(command) { (this.commands ??= []).push(command); } }
const sandbox = {
  module: { exports: {} }, console,
  require: (name) => {
    assert.equal(name, "obsidian");
    return { Plugin, setIcon() {}, Modal: class {}, MarkdownView, Notice: class { constructor(text) { notices.push(text); } } };
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../main.js"), "utf8") + ";globalThis.HeadingPanelForTests = HeadingPanel;", sandbox);
const HeadingOnlyFold = sandbox.module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const lines = [
    "# Root", "intro", "## Section", "section text", "### Alpha",
    "- parent", "  - child", "#### Detail", "detail text",
    "### Beta", "beta text", "```md", "### Code example", "```",
    "## Next", "next text", "### Empty",
  ];
  const offsets = [];
  let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
  const ranges = [
    [0, 16], [2, 13], [4, 8], [5, 6], [7, 8], [9, 13], [11, 13], [14, 16],
  ];
  const view = new MarkdownView();
  view.file = { path: "fixture.md" };
  view.getMode = () => "source";
  view.editor = {
    lineCount: () => lines.length,
    getLine: (line) => lines[line],
    getAllFoldableLines: () => ranges.map(([a, b]) => ({ from: offsets[a] + lines[a].length, to: offsets[b] + lines[b].length })),
    offsetToPos: (pos) => {
      let line = offsets.length - 1;
      while (offsets[line] > pos) line--;
      return { line, ch: pos - offsets[line] };
    },
  };
  let folds = [{ from: 5, to: 6 }, { from: 7, to: 8 }, { from: 11, to: 13 }];
  view.editMode = {
    getFoldInfo: () => ({ folds }),
    applyFoldInfo: (info) => { assert.equal(info.lines, lines.length); folds = plain(info.folds); },
  };
  view.onMarkdownFold = () => { view.saved = true; };
  const headings = [[0, 1], [2, 2], [4, 3], [7, 4], [9, 3], [14, 2], [16, 3]]
    .map(([line, level]) => ({ level, position: { start: { line } } }));
  const plugin = new HeadingOnlyFold();
  plugin.app = {
    workspace: { getActiveViewOfType: () => view },
    metadataCache: { getFileCache: () => ({ headings }) },
  };
  return { plugin, view, lines, headings, get: () => folds, set: (value) => { folds = value; } };
}

test("registers only one panel command", () => {
 const f = fixture(); f.plugin.onload();
 assert.equal(f.plugin.commands.length, 1);
 assert.equal(f.plugin.commands[0].id, "open-panel");
});

test("H3 commands preserve lists, H4, code folds, and document text", () => {
  const f = fixture();
  const text = f.lines.join("\n");
  const original = plain(f.get());
  f.plugin.run(f.view, 3, "fold");
  assert.deepEqual(f.get(), [{ from: 4, to: 8 }, ...original.slice(0, 2), { from: 9, to: 13 }, original[2]]);
  f.plugin.run(f.view, 3, "fold");
  assert.equal(f.get().length, 5, "repeated fold must not duplicate ranges");
  f.plugin.run(f.view, 3, "unfold");
  assert.deepEqual(f.get(), original);
  assert.equal(f.lines.join("\n"), text);
  assert.equal(f.view.saved, true);
});

test("all-heading round trip retains nested list and fenced-code folds", () => {
  const f = fixture();
  f.plugin.run(f.view, 0, "fold");
  assert.deepEqual(f.get().map((r) => r.from), [0, 2, 4, 5, 7, 9, 11, 14]);
  f.plugin.run(f.view, 0, "unfold");
  assert.deepEqual(f.get(), [{ from: 5, to: 6 }, { from: 11, to: 13 }]);
});

test("toggle normalizes a mixed target state, then unfolds all targets", () => {
  const f = fixture();
  f.set([{ from: 2, to: 13 }, { from: 4, to: 8 }, { from: 5, to: 6 }]);
  f.plugin.run(f.view, 3, "toggle");
  assert.deepEqual(f.get().map((r) => r.from), [2, 4, 5, 9]);
  f.plugin.run(f.view, 3, "toggle");
  assert.deepEqual(f.get().map((r) => r.from), [2, 5], "folded ancestor remains folded");
});

test("stale metadata cannot turn a current list line into a heading fold", () => {
  const f = fixture();
  f.headings.push({ level: 3, position: { start: { line: 5 } } });
  f.plugin.run(f.view, 3, "unfold");
  assert.ok(f.get().some((r) => r.from === 5));
});

test("an absent heading level and unavailable internal API leave folds alone", () => {
  const f = fixture();
  const original = plain(f.get());
  assert.throws(() => f.plugin.run(f.view, 6, "toggle"));
  assert.deepEqual(f.get(), original);
  f.view.editor.getAllFoldableLines = undefined;
  assert.throws(() => f.plugin.run(f.view, 0, "unfold"));
  assert.deepEqual(f.get(), original);
});


test("finds the most recent Markdown leaf when palette focus removes active view", () => {
 const f = fixture(); const leaf = {view:f.view}; f.view.getViewType=()=>"markdown";
 f.plugin.app.workspace.getActiveViewOfType=()=>null;
 f.plugin.app.workspace.getMostRecentLeaf=()=>leaf;
 assert.equal(f.plugin.resolveLeaf(),leaf);
});
test("recovers the active file from a sidebar leaf", () => {
 const f = fixture(); const leaf = {view:f.view};
 f.plugin.app.workspace.getMostRecentLeaf=()=>({view:{getViewType:()=>"file-explorer"}});
 f.plugin.app.workspace.getActiveFile=()=>f.view.file;
 f.plugin.app.workspace.getLeavesOfType=()=>[leaf];
 assert.equal(f.plugin.resolveLeaf(),leaf);
});

test("heading colors follow rendered text, scoped theme variables, and CSS changes", () => {
  const Panel = sandbox.HeadingPanelForTests;
  let tokenColor = "rgb(20, 100, 40)";
  let themeColor = "rgb(210, 150, 30)";
  const applied = new Map();
  let queued, cssChanged;
  const content = {};
  const textParent = { closest: () => null };
  const text = { textContent: "Heading", parentElement: textParent };
  const token = { getClientRects: () => [1], closest: () => null };
  const scope = { querySelectorAll: selector => selector === ".cm-header-3" ? [token] : [] };
  const fake = Object.create(Panel.prototype);
  fake.root = { isConnected: true, style: {
    setProperty: (key, value) => applied.set(key, value),
    removeProperty: key => applied.delete(key),
  }};
  fake.leaf = { view: { contentEl: content, getMode: () => "source", editor: { cm: { scrollDOM: scope } } } };
  fake.listeners = { signal: {} };
  fake.doc = {
    body: {}, addEventListener() {},
    createTreeWalker() { let read = false; return { nextNode: () => read ? null : (read = true, text) }; },
  };
  fake.win = {
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame(callback) { queued = callback; return 1; },
    cancelAnimationFrame() {},
    getComputedStyle: element => element === content
      ? { getPropertyValue: () => themeColor }
      : { color: tokenColor },
  };
  fake.plugin = { app: { workspace: { on(event, callback) { assert.equal(event,"css-change"); cssChanged=callback; return {}; } } } };
  fake.watchHeadingColors();
  assert.equal(applied.get("--hof-h3-color"), tokenColor, "rendered color wins over theme variable");
  assert.equal(applied.get("--hof-h2-color"), themeColor, "unrendered level follows scoped variable");
  tokenColor = "rgb(190, 40, 70)";
  themeColor = "rgb(30, 80, 180)";
  cssChanged();
  queued();
  assert.equal(applied.get("--hof-h3-color"), tokenColor, "rendered color updates after theme change");
  assert.equal(applied.get("--hof-h2-color"), themeColor, "fallback updates after theme change");
});

function readingFixture() {
  const f = fixture();
  f.view.getMode = () => "preview";
  const renderer = {
    text: f.lines.join("\n"),
    onRendered: callback => callback(),
  };
  f.view.previewMode = {
    renderer,
    getFoldInfo: () => ({ folds: f.get() }),
    applyFoldInfo: info => {
      assert.equal(info.lines, f.lines.length);
      f.set(plain(info.folds));
    },
  };
  f.view.leaf = { view: f.view, setViewState: () => { throw Error("Mode switch forbidden"); } };
  Object.defineProperty(f.view, "editor", { get() { throw Error("Reading must not access editor"); } });
  Object.defineProperty(f.view, "editMode", { get() { throw Error("Reading must not access edit mode"); } });
  return f;
}

test("Reading folds and unfolds H3 without changing mode or list/H4/code folds", async () => {
  const f = readingFixture();
  const original = plain(f.get());
  assert.equal(await f.plugin.execute(3, "fold", f.view.leaf), 2);
  assert.deepEqual(f.get().map(range => range.from), [4, 5, 7, 9, 11]);
  await f.plugin.execute(3, "fold", f.view.leaf);
  assert.equal(f.get().length, 5, "no duplicates after repeated fold");
  await f.plugin.execute(3, "unfold", f.view.leaf);
  assert.deepEqual(f.get(), original);
  assert.equal(f.view.getMode(), "preview");
  assert.equal(f.view.saved, true);
});

test("Reading all-heading round trip preserves unrelated list and code folds", async () => {
  const f = readingFixture();
  await f.plugin.execute(0, "fold", f.view.leaf);
  assert.deepEqual(f.get().map(range => range.from), [0, 2, 4, 5, 7, 9, 11, 14]);
  await f.plugin.execute(0, "unfold", f.view.leaf);
  assert.deepEqual(f.get(), [{ from: 5, to: 6 }, { from: 11, to: 13 }]);
  assert.equal(f.view.getMode(), "preview");
});

test("Reading handles deferred rendering before saving native folds", async () => {
  const f = readingFixture();
  const pending = [];
  f.view.previewMode.renderer.onRendered = callback => pending.push(callback);
  let saved = false;
  f.view.onMarkdownFold = () => { saved = true; };
  const task = f.plugin.runReading(f.view, 3, "fold");
  assert.equal(pending.length, 1);
  pending.shift()();
  await Promise.resolve();
  assert.equal(saved, false);
  assert.equal(pending.length, 1);
  pending.shift()();
  await task;
  assert.equal(saved, true);
});
