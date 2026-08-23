import {
  type App,
  MarkdownView,
  type MarkdownViewModeType,
  type WorkspaceLeaf,
  WorkspaceWindow,
} from "obsidian";

export type WorkspaceArea =
  | "main"
  | "left-sidebar"
  | "right-sidebar"
  | "popout-window"
  | "unknown";

export type LeafSource = "clicked-element" | "focused-element" | "active-leaf-event" | "none";

export interface ElementContext {
  tagName: string;
  inputType: string | null;
  role: string | null;
  classNames: string[];
  isContentEditable: boolean;
  isTextInput: boolean;
}

export interface WorkspaceContext {
  area: WorkspaceArea;
  viewType: string | null;
  viewLabel: string | null;
  mode: MarkdownViewModeType | null;
  leafSource: LeafSource;
  clickedElement: ElementContext;
  focusedElement: ElementContext | null;
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function asElement(event: Event): Element | null {
  for (const target of event.composedPath()) {
    const element = asDomElement(target);

    if (element !== null) {
      return element;
    }
  }

  return asDomElement(event.target);
}

function asDomElement(target: EventTarget | null): Element | null {
  if (target === null || typeof target !== "object") {
    return null;
  }

  if (!("tagName" in target) || !("ownerDocument" in target)) {
    return null;
  }

  return target as Element;
}

export function inspectWorkspaceContext(
  app: App,
  clickedElement: Element,
  activeLeaf: WorkspaceLeaf | null,
): WorkspaceContext {
  const focusedElement = findDeepestActiveElement(clickedElement.ownerDocument);
  const clickedLeaf = findContainingLeaf(app, clickedElement);
  const focusedLeaf = focusedElement === null ? null : findContainingLeaf(app, focusedElement);
  const sameDocumentActiveLeaf =
    activeLeaf?.view.containerEl.ownerDocument === clickedElement.ownerDocument ? activeLeaf : null;
  const leaf = clickedLeaf ?? focusedLeaf ?? sameDocumentActiveLeaf;

  return {
    area: leaf === null ? "unknown" : classifyArea(app, leaf),
    viewType: leaf?.view.getViewType() ?? null,
    viewLabel: leaf?.view.getDisplayText() ?? null,
    mode: leaf?.view instanceof MarkdownView ? leaf.view.getMode() : null,
    leafSource:
      clickedLeaf !== null
        ? "clicked-element"
        : focusedLeaf !== null
          ? "focused-element"
          : sameDocumentActiveLeaf !== null
            ? "active-leaf-event"
            : "none",
    clickedElement: inspectElement(clickedElement),
    focusedElement: focusedElement === null ? null : inspectElement(focusedElement),
  };
}

function findDeepestActiveElement(document: Document): Element | null {
  let focusedElement = document.activeElement;

  while (focusedElement !== null) {
    const shadowActiveElement = focusedElement.shadowRoot?.activeElement ?? null;

    if (shadowActiveElement === null) {
      return focusedElement;
    }

    focusedElement = shadowActiveElement;
  }

  return null;
}

export function formatStableCondition(context: WorkspaceContext): string {
  const lines = [`area: ${context.area}`];

  if (context.viewType !== null) {
    lines.push(`viewType: ${JSON.stringify(context.viewType)}`);
  }

  if (context.mode !== null) {
    lines.push(`mode: ${context.mode}`);
  }

  return lines.join("\n");
}

function findContainingLeaf(app: App, element: Element): WorkspaceLeaf | null {
  let match: WorkspaceLeaf | null = null;
  let matchContainer: HTMLElement | null = null;

  app.workspace.iterateAllLeaves((leaf) => {
    const container = leaf.view.containerEl;

    if (
      container.ownerDocument === element.ownerDocument &&
      container.contains(element) &&
      (matchContainer === null || matchContainer.contains(container))
    ) {
      match = leaf;
      matchContainer = container;
    }
  });

  return match;
}

function classifyArea(app: App, leaf: WorkspaceLeaf): WorkspaceArea {
  if (leaf.getContainer() instanceof WorkspaceWindow) {
    return "popout-window";
  }

  const root = leaf.getRoot();

  if (root === app.workspace.leftSplit) {
    return "left-sidebar";
  }

  if (root === app.workspace.rightSplit) {
    return "right-sidebar";
  }

  if (root === app.workspace.rootSplit) {
    return "main";
  }

  return "unknown";
}

function inspectElement(element: Element): ElementContext {
  const tagName = element.tagName.toLowerCase();
  const inputType =
    tagName === "input" ? (element.getAttribute("type")?.toLowerCase() ?? "text") : null;
  const isContentEditable =
    "isContentEditable" in element && element.isContentEditable === true;
  const role = element.getAttribute("role");
  const isTextInput =
    tagName === "textarea" ||
    (tagName === "input" && !NON_TEXT_INPUT_TYPES.has(inputType ?? "text")) ||
    role === "textbox" ||
    isContentEditable;

  return {
    tagName,
    inputType,
    role,
    classNames: Array.from(element.classList),
    isContentEditable,
    isTextInput,
  };
}
