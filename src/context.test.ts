// @vitest-environment happy-dom

import type { App } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import {
  asElement,
  formatStableCondition,
  inspectWorkspaceContext,
  type WorkspaceContext,
} from "./context";

const app = {
  workspace: {
    iterateAllLeaves: () => undefined,
  },
} as unknown as App;

beforeEach(() => {
  document.body.replaceChildren();
});

describe("inspectWorkspaceContext", () => {
  it("reports plaintext-only content as editable", () => {
    const element = document.createElement("div");
    element.contentEditable = "plaintext-only";
    document.body.append(element);

    const context = inspectWorkspaceContext(app, element, null);

    expect(context.clickedElement.isContentEditable).toBe(true);
    expect(context.clickedElement.isTextInput).toBe(true);
  });

  it("respects contenteditable=false inside editable content", () => {
    const editableParent = document.createElement("div");
    editableParent.contentEditable = "true";
    const element = document.createElement("span");
    element.contentEditable = "false";
    editableParent.append(element);
    document.body.append(editableParent);

    const context = inspectWorkspaceContext(app, element, null);

    expect(context.clickedElement.isContentEditable).toBe(false);
    expect(context.clickedElement.isTextInput).toBe(false);
  });

  it("inspects the focused element inside an open shadow root", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadowRoot.append(input);
    document.body.append(host);
    input.focus();

    const context = inspectWorkspaceContext(app, host, null);

    expect(context.focusedElement?.tagName).toBe("input");
    expect(context.focusedElement?.isTextInput).toBe(true);
  });

  it("resolves a containing leaf through the shadow root host", () => {
    const rootSplit = {};
    const container = document.createElement("div");
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadowRoot.append(input);
    container.append(host);
    document.body.append(container);
    const leaf = {
      view: {
        containerEl: container,
        getViewType: () => "shadow-view",
        getDisplayText: () => "Shadow view",
      },
      getContainer: () => ({}),
      getRoot: () => rootSplit,
    };
    const shadowApp = {
      workspace: {
        rootSplit,
        leftSplit: {},
        rightSplit: {},
        iterateAllLeaves: (callback: (candidate: typeof leaf) => void) => callback(leaf),
      },
    } as unknown as App;

    const context = inspectWorkspaceContext(shadowApp, input, null);

    expect(context.area).toBe("main");
    expect(context.viewType).toBe("shadow-view");
    expect(context.leafSource).toBe("clicked-element");
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

describe("formatStableCondition", () => {
  it.each(["null", "true", "#hidden", "foo: bar", "[notes]"])(
    "quotes the view type %s as a YAML string",
    (viewType) => {
      const context = {
        area: "main",
        viewType,
        mode: null,
      } as WorkspaceContext;

      expect(formatStableCondition(context)).toBe(
        `area: main\nviewType: ${JSON.stringify(viewType)}`,
      );
    },
  );
});
