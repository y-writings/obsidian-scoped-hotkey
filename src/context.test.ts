// @vitest-environment happy-dom

import {
  type App,
  MarkdownView,
  type MarkdownViewModeType,
  type WorkspaceLeaf,
  WorkspaceWindow,
} from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import {
  asElement,
  describeCondition,
  findContainingLeaf,
  formatCondition,
  getDeepestActiveElement,
  getScopePresets,
  inspectCurrentWorkspaceContext,
  inspectSelectedWorkspaceContext,
  type WorkspaceArea,
  type WorkspaceContext,
} from "./context";

interface LeafOptions {
  area: WorkspaceArea;
  viewType: string;
  viewLabel?: string;
  mode?: MarkdownViewModeType;
  ownerDocument?: Document;
}

function createWorkspace() {
  const rootSplit = {};
  const leftSplit = {};
  const rightSplit = {};
  const unknownRoot = {};
  const leaves: WorkspaceLeaf[] = [];
  const app = {
    workspace: {
      rootSplit,
      leftSplit,
      rightSplit,
      iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
        for (const leaf of leaves) {
          callback(leaf);
        }
      },
    },
  } as unknown as App;

  function addLeaf({
    area,
    viewType,
    viewLabel = viewType,
    mode,
    ownerDocument = document,
  }: LeafOptions): WorkspaceLeaf {
    const containerEl = ownerDocument.createElement("div");
    containerEl.dataset.viewType = viewType;
    ownerDocument.body.append(containerEl);
    const viewProperties = {
      containerEl,
      getViewType: () => viewType,
      getDisplayText: () => viewLabel,
    };
    const view =
      mode === undefined
        ? viewProperties
        : Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, viewProperties, {
            getMode: () => mode,
          });
    const root =
      area === "main"
        ? rootSplit
        : area === "left-sidebar"
          ? leftSplit
          : area === "right-sidebar"
            ? rightSplit
            : unknownRoot;
    const container =
      area === "popout-window"
        ? (Object.create(WorkspaceWindow.prototype) as WorkspaceWindow)
        : {};
    const leaf = {
      view,
      getContainer: () => container,
      getRoot: () => root,
    } as unknown as WorkspaceLeaf;
    leaves.push(leaf);
    return leaf;
  }

  return { app, addLeaf };
}

function createContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    source: "current",
    area: "main",
    viewType: "markdown",
    viewLabel: "Markdown",
    mode: null,
    leafSource: "active-leaf-event",
    selectedElement: null,
    focusedElement: null,
    focusMatchesInspectedLeaf: null,
    activeLeafMatchesInspectedLeaf: true,
    ...overrides,
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("inspectCurrentWorkspaceContext", () => {
  it("uses the focused main editor instead of a different active leaf", () => {
    const { app, addLeaf } = createWorkspace();
    const mainLeaf = addLeaf({
      area: "main",
      viewType: "markdown",
      viewLabel: "Notes",
      mode: "source",
    });
    const rightLeaf = addLeaf({ area: "right-sidebar", viewType: "backlink" });
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    mainLeaf.view.containerEl.append(editor);

    const context = inspectCurrentWorkspaceContext(app, editor, rightLeaf);

    expect(context).toMatchObject({
      source: "current",
      area: "main",
      viewType: "markdown",
      viewLabel: "Notes",
      mode: "source",
      leafSource: "focused-element",
      selectedElement: null,
      focusMatchesInspectedLeaf: true,
      activeLeafMatchesInspectedLeaf: false,
    });
    expect(context?.focusedElement).toMatchObject({
      tagName: "div",
      isContentEditable: true,
      isTextInput: true,
    });
  });

  it.each([
    ["left-sidebar", "left-view"],
    ["right-sidebar", "right-view"],
  ] as const)("prefers a focused input in the %s", (area, viewType) => {
    const { app, addLeaf } = createWorkspace();
    const mainLeaf = addLeaf({ area: "main", viewType: "markdown", mode: "preview" });
    const sidebarLeaf = addLeaf({ area, viewType });
    const input = document.createElement("input");
    sidebarLeaf.view.containerEl.append(input);

    const context = inspectCurrentWorkspaceContext(app, input, mainLeaf);

    expect(context).toMatchObject({
      area,
      viewType,
      leafSource: "focused-element",
      activeLeafMatchesInspectedLeaf: false,
    });
  });

  it("falls back to the active leaf when modal focus is excluded by the caller", () => {
    const { app, addLeaf } = createWorkspace();
    const mainLeaf = addLeaf({ area: "main", viewType: "markdown", mode: "preview" });

    const context = inspectCurrentWorkspaceContext(app, null, mainLeaf);

    expect(context).toMatchObject({
      source: "current",
      area: "main",
      mode: "preview",
      leafSource: "active-leaf-event",
      focusedElement: null,
      focusMatchesInspectedLeaf: null,
      activeLeafMatchesInspectedLeaf: true,
    });
  });

  it("returns null when neither focused nor active leaf exists", () => {
    const { app } = createWorkspace();

    expect(inspectCurrentWorkspaceContext(app, null, null)).toBeNull();
  });

  it.each(["source", "preview"] as const)("reports Markdown %s mode", (mode) => {
    const { app, addLeaf } = createWorkspace();
    const leaf = addLeaf({ area: "main", viewType: "markdown", mode });

    expect(inspectCurrentWorkspaceContext(app, null, leaf)?.mode).toBe(mode);
  });
});

describe("inspectSelectedWorkspaceContext", () => {
  it("does not replace an invalid selected target with another focused leaf", () => {
    const { app, addLeaf } = createWorkspace();
    const rightLeaf = addLeaf({ area: "right-sidebar", viewType: "right-view" });
    const ribbonButton = document.createElement("button");
    const focusedInput = document.createElement("input");
    rightLeaf.view.containerEl.append(focusedInput);
    document.body.append(ribbonButton);

    expect(
      inspectSelectedWorkspaceContext(app, ribbonButton, focusedInput, rightLeaf),
    ).toBeNull();
  });

  it("reports when selected, focused, and active leaves differ", () => {
    const { app, addLeaf } = createWorkspace();
    const mainLeaf = addLeaf({ area: "main", viewType: "markdown", mode: "source" });
    const rightLeaf = addLeaf({ area: "right-sidebar", viewType: "right-view" });
    const leftLeaf = addLeaf({ area: "left-sidebar", viewType: "left-view" });
    const selected = document.createElement("button");
    const focused = document.createElement("input");
    rightLeaf.view.containerEl.append(selected);
    leftLeaf.view.containerEl.append(focused);

    const context = inspectSelectedWorkspaceContext(app, selected, focused, mainLeaf);

    expect(context).toMatchObject({
      source: "selected-pane",
      area: "right-sidebar",
      viewType: "right-view",
      leafSource: "selected-element",
      focusMatchesInspectedLeaf: false,
      activeLeafMatchesInspectedLeaf: false,
    });
    expect(context?.selectedElement).toMatchObject({ tagName: "button", isTextInput: false });
    expect(context?.focusedElement).toMatchObject({ tagName: "input", isTextInput: true });
  });

  it("compares distinct leaves by identity when their metadata is identical", () => {
    const { app, addLeaf } = createWorkspace();
    const options = {
      area: "main",
      viewType: "markdown",
      viewLabel: "Notes",
      mode: "source",
    } as const;
    const selectedLeaf = addLeaf(options);
    const focusedLeaf = addLeaf(options);
    const activeLeaf = addLeaf(options);
    const selected = document.createElement("button");
    const focused = document.createElement("input");
    selectedLeaf.view.containerEl.append(selected);
    focusedLeaf.view.containerEl.append(focused);

    const context = inspectSelectedWorkspaceContext(app, selected, focused, activeLeaf);

    expect(context).toMatchObject({
      area: "main",
      viewType: "markdown",
      mode: "source",
      focusMatchesInspectedLeaf: false,
      activeLeafMatchesInspectedLeaf: false,
    });
  });

  it("compares focused and selected leaves across documents", () => {
    const { app, addLeaf } = createWorkspace();
    const popoutDocument = document.implementation.createHTMLDocument("Pop-out");
    const selectedLeaf = addLeaf({
      area: "popout-window",
      viewType: "markdown",
      mode: "source",
      ownerDocument: popoutDocument,
    });
    const focusedLeaf = addLeaf({ area: "main", viewType: "markdown", mode: "source" });
    const selected = popoutDocument.createElement("button");
    const focused = document.createElement("input");
    selectedLeaf.view.containerEl.append(selected);
    focusedLeaf.view.containerEl.append(focused);

    const context = inspectSelectedWorkspaceContext(app, selected, focused, focusedLeaf);

    expect(context).toMatchObject({
      area: "popout-window",
      focusMatchesInspectedLeaf: false,
      activeLeafMatchesInspectedLeaf: false,
    });
  });

  it.each([
    ["popout-window", "popout-view"],
    ["unknown", "unknown-view"],
  ] as const)("classifies a selected leaf in the %s area", (area, viewType) => {
    const { app, addLeaf } = createWorkspace();
    const leaf = addLeaf({ area, viewType });
    const selected = document.createElement("div");
    leaf.view.containerEl.append(selected);

    expect(inspectSelectedWorkspaceContext(app, selected, null, null)).toMatchObject({
      area,
      viewType,
    });
  });
});

describe("element and shadow-root diagnostics", () => {
  it("reports plaintext-only content as editable", () => {
    const { app, addLeaf } = createWorkspace();
    const leaf = addLeaf({ area: "main", viewType: "markdown" });
    const element = document.createElement("div");
    element.contentEditable = "plaintext-only";
    leaf.view.containerEl.append(element);

    const context = inspectSelectedWorkspaceContext(app, element, null, null);

    expect(context?.selectedElement).toMatchObject({
      isContentEditable: true,
      isTextInput: true,
    });
  });

  it("respects contenteditable=false inside editable content", () => {
    const { app, addLeaf } = createWorkspace();
    const leaf = addLeaf({ area: "main", viewType: "markdown" });
    const editableParent = document.createElement("div");
    editableParent.contentEditable = "true";
    const element = document.createElement("span");
    element.contentEditable = "false";
    editableParent.append(element);
    leaf.view.containerEl.append(editableParent);

    const context = inspectSelectedWorkspaceContext(app, element, null, null);

    expect(context?.selectedElement).toMatchObject({
      isContentEditable: false,
      isTextInput: false,
    });
  });

  it.each([
    ["input", null, true],
    ["input", "checkbox", false],
    ["textarea", null, true],
    ["div", "textbox", true],
  ] as const)("classifies %s with type or role %s", (tagName, typeOrRole, isTextInput) => {
    const { app, addLeaf } = createWorkspace();
    const leaf = addLeaf({ area: "main", viewType: "test-view" });
    const element = document.createElement(tagName);
    if (tagName === "input" && typeOrRole !== null) {
      element.setAttribute("type", typeOrRole);
    } else if (typeOrRole !== null) {
      element.setAttribute("role", typeOrRole);
    }
    leaf.view.containerEl.append(element);

    const context = inspectSelectedWorkspaceContext(app, element, null, null);

    expect(context?.selectedElement?.isTextInput).toBe(isTextInput);
  });

  it("finds focus and a containing leaf through an open shadow root", () => {
    const { app, addLeaf } = createWorkspace();
    const leaf = addLeaf({ area: "main", viewType: "shadow-view" });
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadowRoot.append(input);
    leaf.view.containerEl.append(host);
    input.focus();

    expect(getDeepestActiveElement(document)).toBe(input);
    expect(findContainingLeaf(app, input)).toBe(leaf);
    expect(inspectCurrentWorkspaceContext(app, input, null)).toMatchObject({
      viewType: "shadow-view",
      leafSource: "focused-element",
    });
  });
});

describe("asElement", () => {
  it("returns the original element from the composed event path", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadowRoot.append(input);
    const event = {
      target: host,
      composedPath: () => [input, shadowRoot, host],
    } as unknown as MouseEvent;

    expect(asElement(event)).toBe(input);
  });
});

describe("scope conditions", () => {
  it("offers presets only when their fields are available", () => {
    const context = createContext({ area: "main", mode: "source" });

    expect(getScopePresets(context)).toEqual([
      { id: "view", label: "View type" },
      { id: "view-and-mode", label: "View type and mode" },
      { id: "exact", label: "Exact location" },
    ]);
  });

  it("formats view, mode, and exact scopes as AND fields", () => {
    const context = createContext({ area: "main", mode: "preview" });

    expect(formatCondition(context, "view")).toBe('viewType: "markdown"');
    expect(formatCondition(context, "view-and-mode")).toBe(
      'viewType: "markdown"\nmode: preview',
    );
    expect(formatCondition(context, "exact")).toBe(
      'area: main\nviewType: "markdown"\nmode: preview',
    );
  });

  it("describes each scope in human terms", () => {
    const context = createContext({ area: "right-sidebar", mode: "source" });

    expect(describeCondition(context, "view")).toBe(
      "Matches Markdown regardless of workspace area or Markdown mode.",
    );
    expect(describeCondition(context, "view-and-mode")).toBe(
      "Matches Markdown in source mode, regardless of workspace area.",
    );
    expect(describeCondition(context, "exact")).toBe(
      "Matches Markdown in source mode in the right-sidebar area.",
    );
  });

  it("does not offer an exact scope for an unknown area", () => {
    const context = createContext({
      area: "unknown",
      viewType: "custom-view",
      viewLabel: "Custom view",
      mode: "source",
    });

    expect(getScopePresets(context).map(({ id }) => id)).toEqual(["view", "view-and-mode"]);
  });

  it("omits mode scopes when the view has no mode", () => {
    const context = createContext({ area: "main", viewType: "search", mode: null });

    expect(getScopePresets(context).map(({ id }) => id)).toEqual(["view", "exact"]);
    expect(formatCondition(context, "exact")).toBe('area: main\nviewType: "search"');
  });

  it.each([
    ["view-and-mode", createContext({ mode: null })],
    ["exact", createContext({ area: "unknown", mode: "source" })],
  ] as const)("rejects unavailable %s formatting", (preset, context) => {
    expect(() => formatCondition(context, preset)).toThrow(
      new RangeError(`Scope preset "${preset}" is unavailable for this context.`),
    );
  });

  it.each([
    ["view-and-mode", createContext({ mode: null })],
    ["exact", createContext({ area: "unknown", mode: "source" })],
  ] as const)("rejects unavailable %s descriptions", (preset, context) => {
    expect(() => describeCondition(context, preset)).toThrow(
      new RangeError(`Scope preset "${preset}" is unavailable for this context.`),
    );
  });

  it.each(["null", "true", "#hidden", "foo: bar", "[notes]"])(
    "quotes the view type %s as a YAML string",
    (viewType) => {
      const context = createContext({ viewType });

      expect(formatCondition(context, "view")).toBe(`viewType: ${JSON.stringify(viewType)}`);
    },
  );

  it("JSON-quotes view types containing a quote, backslash, and newline", () => {
    const viewType = 'quoted "value" with \\ slash\nand newline';
    const context = createContext({ viewType });

    expect(formatCondition(context, "view")).toBe(`viewType: ${JSON.stringify(viewType)}`);
  });
});
