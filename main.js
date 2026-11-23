"use strict";
const { Plugin, Notice, setIcon } = require("obsidian");

class HeadingPanel {
  constructor(plugin, leaf, anchor) {
    this.plugin = plugin;
    this.leaf = leaf;
    this.anchor = anchor;
    this.doc = anchor.ownerDocument;
    this.win = this.doc.defaultView;
    this.listeners = new this.win.AbortController();
    this.busy = false;
  }

  open() {
    const root = this.doc.createElement("div");
    this.root = root;
    root.className = "hof-popover";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "헤딩 접기");
    const top = root.createDiv({ cls: "hof-top" });
    top.createSpan({ text: "헤딩", attr: { title: this.leaf.view.file.basename } });
    const close = top.createEl("button", { cls: "hof-close", attr: { type: "button", "aria-label": "닫기" } });
    setIcon(close, "x");
    close.addEventListener("click", () => this.close());
    const grid = root.createDiv({ cls: "hof-grid" });
    grid.createSpan();
    grid.createSpan({ text: "접기", cls: "hof-column" });
    grid.createSpan({ text: "펼치기", cls: "hof-column" });
    this.buttons = [];
    const headings = this.plugin.app.metadataCache.getFileCache(this.leaf.view.file)?.headings || [];
    for (let level = 0; level <= 6; level++) {
      const label = level ? "H" + level : "전체";
      const present = headings.some(h => !level || h.level === level);
      const color = level ? "var(--hof-h" + level + "-color, var(--h" + level + "-color, var(--text-normal)))" : "var(--interactive-accent)";
      const rowLabel = grid.createSpan({ text: label, cls: "hof-row-label" + (present ? "" : " is-empty") });
      rowLabel.style.setProperty("--hof-color", color);
      for (const [action, title, icon] of [
        ["fold", "접기", "chevrons-down-up"],
        ["unfold", "펼치기", "chevrons-up-down"],
      ]) {
        const button = grid.createEl("button", {
          cls: "hof-action hof-" + action,
          attr: { type: "button", "aria-label": label + " " + title, title: label + " " + title },
        });
        button.style.setProperty("--hof-color", color);
        setIcon(button, icon);
        button.disabled = !present;
        this.buttons.push({ button, present });
        button.addEventListener("click", async () => {
          if (this.busy) return;
          this.busy = true;
          for (const item of this.buttons) item.button.disabled = true;
          try {
            await this.plugin.execute(level, action, this.leaf);
            for (const item of this.buttons) item.button.removeClass("is-used");
            button.addClass("is-used");
          } catch (error) {
            new Notice(error.message || String(error));
          } finally {
            this.busy = false;
            if (this.root?.isConnected) {
              for (const item of this.buttons) item.button.disabled = !item.present;
              button.focus({ preventScroll: true });
            }
          }
        });
      }
    }
    this.doc.body.appendChild(root);
    this.watchHeadingColors();
    this.position();
    const signal = this.listeners.signal;
    this.doc.addEventListener("pointerdown", event => {
      if (!root.contains(event.target) && !this.anchor.contains(event.target)) this.close();
    }, { capture: true, signal });
    this.doc.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
      }
    }, { capture: true, signal });
    this.win.addEventListener("resize", () => this.position(), { signal });
    close.focus({ preventScroll: true });
  }

  watchHeadingColors() {
    this.sampledColors = new Map();
    const refresh = (reset = false) => {
      if (reset) this.sampledColors.clear();
      if (this.colorFrame) this.win.cancelAnimationFrame(this.colorFrame);
      this.colorFrame = this.win.requestAnimationFrame(() => {
        this.colorFrame = null;
        if (this.root?.isConnected) this.syncHeadingColors();
      });
    };
    this.syncHeadingColors();
    this.cssEvent = this.plugin.app.workspace.on("css-change", () => refresh(true));
    this.bodyObserver = new this.win.MutationObserver(() => refresh(true));
    this.bodyObserver.observe(this.doc.body, { attributes: true, attributeFilter: ["class", "style"] });
    const content = this.leaf.view.contentEl;
    this.headingObserver = new this.win.MutationObserver(() => refresh());
    this.headingObserver.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
    this.doc.addEventListener("scroll", () => refresh(), { capture: true, passive: true, signal: this.listeners.signal });
  }

  syncHeadingColors() {
    const view = this.leaf.view;
    const content = view.contentEl;
    const preview = view.getMode() === "preview";
    const scope = preview ? (view.previewMode?.containerEl || content) : (view.editor?.cm?.scrollDOM || content);
    const colors = this.win.getComputedStyle(content);
    for (let level = 1; level <= 6; level++) {
      const selector = preview ? "h" + level : ".cm-header-" + level;
      const candidates = scope.querySelectorAll(selector);
      for (const element of candidates) {
        if (!element.getClientRects().length || element.closest(".markdown-embed, .cm-formatting, .shl-bar")) continue;
        const walker = this.doc.createTreeWalker(element, this.win.NodeFilter.SHOW_TEXT);
        let text, found = false;
        while ((text = walker.nextNode())) {
          if (!text.textContent.trim() || text.parentElement.closest(".cm-formatting, .collapse-indicator, .heading-collapse-indicator, svg")) continue;
          const color = this.win.getComputedStyle(text.parentElement).color;
          if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
            this.sampledColors.set(level, color);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      const property = "--hof-h" + level + "-color";
      const scopedColor = colors.getPropertyValue("--h" + level + "-color").trim();
      const color = this.sampledColors.get(level) || (scopedColor !== "inherit" ? scopedColor : "");
      if (color) this.root.style.setProperty(property, color);
      else this.root.style.removeProperty(property);
    }
  }

  position() {
    if (!this.anchor.isConnected) { this.close(); return; }
    const rect = this.anchor.getBoundingClientRect();
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const gap = 8;
    let left, top;
    if (rect.left < 80 && rect.right + width + gap < this.win.innerWidth) {
      left = rect.right + gap;
      top = rect.top;
    } else {
      left = rect.right - width;
      top = rect.top - height - gap;
      if (top < gap) top = rect.bottom + gap;
    }
    left = Math.max(gap, Math.min(left, this.win.innerWidth - width - gap));
    top = Math.max(gap, Math.min(top, this.win.innerHeight - height - gap));
    this.root.style.left = left + "px";
    this.root.style.top = top + "px";
  }

  close(restoreFocus = false) {
    this.listeners.abort();
    this.bodyObserver?.disconnect();
    this.headingObserver?.disconnect();
    if (this.cssEvent) this.plugin.app.workspace.offref(this.cssEvent);
    if (this.colorFrame) this.win.cancelAnimationFrame(this.colorFrame);
    this.root?.remove();
    if (restoreFocus && this.anchor.isConnected) this.anchor.focus({ preventScroll: true });
    if (this.plugin.panel === this) this.plugin.panel = null;
  }
}

module.exports = class HeadingOnlyFold extends Plugin {
  onload() {
    this.addCommand({ id: "open-panel", name: "헤딩 접기 패널 열기", callback: () => this.openPanel(this.statusButton) });
    const status = this.addStatusBarItem();
    this.statusButton = status.createEl("button", {
      cls: "hof-status-button", attr: { type: "button", "aria-label": "헤딩 접기", title: "헤딩 접기" },
    });
    setIcon(this.statusButton, "list-tree");
    this.statusButton.addEventListener("click", event => this.openPanel(event.currentTarget));
    this.register(() => this.panel?.close());
  }

  resolveLeaf() {
    const ws = this.app.workspace;
    const isMarkdown = leaf => leaf && (leaf.view?.getViewType?.() === "markdown" ||
      leaf.getViewState?.().type === "markdown");
    const recent = ws.getMostRecentLeaf?.();
    if (isMarkdown(recent)) return recent;
    if (isMarkdown(ws.activeLeaf)) return ws.activeLeaf;
    const file = ws.getActiveFile?.();
    if (file) return (ws.getLeavesOfType("markdown") || []).find(leaf =>
      (leaf.view?.file?.path || leaf.getViewState?.().state?.file) === file.path) || null;
    return null;
  }

  async openPanel(anchor = this.statusButton) {
    if (this.panel) { this.panel.close(); return; }
    try {
      const leaf = this.resolveLeaf();
      if (!leaf) throw new Error("Markdown 노트를 열어 주세요.");
      await leaf.loadIfDeferred?.();
      if (!leaf.view?.file) throw new Error("노트를 불러오는 중입니다.");
      this.panel = new HeadingPanel(this, leaf, anchor);
      this.panel.open();
    } catch (error) {
      this.panel?.close();
      new Notice(error.message || String(error));
    }
  }

  async execute(level, action, leaf = this.resolveLeaf()) {
    if (!leaf) throw new Error("대상 노트를 찾을 수 없습니다.");
    await leaf.loadIfDeferred?.();
    if (!leaf.view?.file) throw new Error("대상 노트가 닫혔습니다.");
    if (leaf.view.getMode() === "preview") return this.runReading(leaf.view, level, action);
    return this.run(leaf.view, level, action);
  }

  async runReading(view, level, action) {
    const mode = view.previewMode;
    const renderer = mode?.renderer;
    if (typeof mode?.getFoldInfo !== "function" ||
        typeof mode?.applyFoldInfo !== "function" ||
        typeof renderer?.onRendered !== "function") {
      throw new Error("Reading 모드의 접기 API를 사용할 수 없습니다.");
    }
    const file = view.file;
    await new Promise(resolve => renderer.onRendered(resolve));
    if (view.file !== file || view.getMode() !== "preview") {
      throw new Error("대상 노트나 모드가 변경됐습니다. 패널을 다시 열어 주세요.");
    }
    const text = renderer.text;
    if (typeof text !== "string") throw new Error("노트를 불러오는 중입니다.");
    const lines = text.split("\n");
    const headings = this.app.metadataCache.getFileCache(file)?.headings;
    if (!headings) throw new Error("헤딩 정보가 없습니다. 잠시 뒤 다시 실행해 주세요.");
    const targets = new Map();
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      if (level && heading.level !== level) continue;
      const from = heading.position.start.line;
      const headingEnd = heading.position.end?.line ?? from;
      let to = lines.length - 1;
      for (let j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= heading.level) {
          to = headings[j].position.start.line - 1;
          break;
        }
      }
      if (from < 0 || from >= lines.length || to <= headingEnd ||
          !lines.slice(headingEnd + 1, to + 1).some(line => line.trim())) continue;
      targets.set(from, { from, to });
    }
    if (!targets.size) throw new Error("본문을 접을 수 있는 대상 헤딩이 없습니다.");
    const current = mode.getFoldInfo()?.folds ?? [];
    const foldedLines = new Set(current.map(range => range.from));
    const shouldFold = action === "fold" || (action === "toggle" &&
      !Array.from(targets.keys()).every(line => foldedLines.has(line)));
    const next = current.filter(range => !targets.has(range.from));
    if (shouldFold) next.push(...targets.values());
    next.sort((a, b) => a.from - b.from || b.to - a.to);
    mode.applyFoldInfo({ folds: next, lines: lines.length });
    // Native Reading folds are applied after rendering, including virtualized sections.
    // Save only after that pass; never instantiate or switch to an editor.
    await new Promise(resolve => renderer.onRendered(resolve));
    if (view.file === file && view.getMode() === "preview" &&
        typeof view.onMarkdownFold === "function") view.onMarkdownFold();
    return targets.size;
  }

  run(view, level, action) {
    const editor = view.editor;
    const mode = view.editMode;
    if (typeof mode?.getFoldInfo !== "function" ||
        typeof mode?.applyFoldInfo !== "function" ||
        typeof editor.getAllFoldableLines !== "function") {
      throw new Error("접기 API를 사용할 수 없습니다. Obsidian 버전을 확인해 주세요.");
    }

    try {
      const headings = this.app.metadataCache.getFileCache(view.file)?.headings;
      if (!headings) {
        throw new Error("헤딩 정보가 없습니다. 잠시 뒤 다시 실행해 주세요.");
      }

      // Ask Obsidian for its actual foldable ranges rather than inventing
      // section boundaries. This also excludes headings with nothing to fold.
      const foldable = new Map();
      for (const range of editor.getAllFoldableLines()) {
        const from = editor.offsetToPos(range.from).line;
        const to = editor.offsetToPos(range.to).line;
        foldable.set(from, { from, to });
      }

      const targets = new Map();
      for (const heading of headings) {
        if (level !== 0 && heading.level !== level) continue;
        const line = heading.position.start.line;
        if (line < 0 || line >= editor.lineCount()) continue;
        // Metadata may briefly lag behind typing. Never apply a stale heading
        // entry to a line which is now a list, paragraph, or another level.
        const text = editor.getLine(line);
        const atx = /^ {0,3}(#{1,6})(?:[\t ]+|$)/.exec(text);
        const underline = line + 1 < editor.lineCount()
          ? editor.getLine(line + 1) : "";
        const setextLevel = /^ {0,3}=+[\t ]*$/.test(underline) ? 1
          : /^ {0,3}-+[\t ]*$/.test(underline) ? 2 : 0;
        if (atx ? atx[1].length !== heading.level
          : !text.trim() || setextLevel !== heading.level) continue;
        const range = foldable.get(line);
        if (range) targets.set(line, range);
      }

      if (targets.size === 0) {
        throw new Error("본문을 접을 수 있는 대상 헤딩이 없습니다.");
      }

      const current = mode.getFoldInfo()?.folds ?? [];
      const foldedLines = new Set(current.map((range) => range.from));
      const shouldFold = action === "fold" || (action === "toggle" &&
        !Array.from(targets.keys()).every((line) => foldedLines.has(line)));

      // Preserve EVERY non-target fold, including nested lists, code blocks,
      // callouts and headings of other levels. Deduplicate target folds.
      const next = current.filter((range) => !targets.has(range.from));
      if (shouldFold) next.push(...targets.values());
      next.sort((a, b) => a.from - b.from || b.to - a.to);
      mode.applyFoldInfo({ folds: next, lines: editor.lineCount() });
      if (typeof view.onMarkdownFold === "function") view.onMarkdownFold();
      return targets.size;
    } catch (error) {
      console.error("Heading Only Fold", error);
      throw error;
    }
  }
};
