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

export type ContextSource = "current" | "selected-pane";
export type LeafSource = "focused-element" | "active-leaf-event" | "selected-element";

export interface ElementContext {
  tagName: string;
  inputType: string | null;
  role: string | null;
  classNames: string[];
  isContentEditable: boolean;
  isTextInput: boolean;
}

export interface WorkspaceContext {
  source: ContextSource;
  area: WorkspaceArea;
  viewType: string;
  viewLabel: string;
  mode: MarkdownViewModeType | null;
  leafSource: LeafSource;
  selectedElement: ElementContext | null;
  focusedElement: ElementContext | null;
  focusMatchesInspectedLeaf: boolean | null;
  activeLeafMatchesInspectedLeaf: boolean | null;
}

export type ScopePreset = "view" | "view-and-mode" | "exact";

export interface ScopePresetOption {
  id: ScopePreset;
  label: string;
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

export function inspectCurrentWorkspaceContext(
  app: App,
  focusedElement: Element | null,
  activeLeaf: WorkspaceLeaf | null,
): WorkspaceContext | null {
  const focusedLeaf = focusedElement === null ? null : findContainingLeaf(app, focusedElement);
  const leaf = focusedLeaf ?? activeLeaf;

  return leaf === null
    ? null
    : inspectLeaf(
        app,
        leaf,
        "current",
        focusedLeaf === null ? "active-leaf-event" : "focused-element",
        null,
        focusedElement,
        focusedLeaf,
        activeLeaf,
      );
}

export function inspectSelectedWorkspaceContext(
  app: App,
  selectedElement: Element,
  focusedElement: Element | null,
  activeLeaf: WorkspaceLeaf | null,
): WorkspaceContext | null {
  const selectedLeaf = findContainingLeaf(app, selectedElement);

  if (selectedLeaf === null) {
    return null;
  }

  const focusedLeaf = focusedElement === null ? null : findContainingLeaf(app, focusedElement);
  return inspectLeaf(
    app,
    selectedLeaf,
    "selected-pane",
    "selected-element",
    selectedElement,
    focusedElement,
    focusedLeaf,
    activeLeaf,
  );
}

function inspectLeaf(
  app: App,
  leaf: WorkspaceLeaf,
  source: ContextSource,
  leafSource: LeafSource,
  selectedElement: Element | null,
  focusedElement: Element | null,
  focusedLeaf: WorkspaceLeaf | null,
  activeLeaf: WorkspaceLeaf | null,
): WorkspaceContext {
  return {
    source,
    area: classifyArea(app, leaf),
    viewType: leaf.view.getViewType(),
    viewLabel: leaf.view.getDisplayText(),
    mode: leaf.view instanceof MarkdownView ? leaf.view.getMode() : null,
    leafSource,
    selectedElement: selectedElement === null ? null : inspectElement(selectedElement),
    focusedElement: focusedElement === null ? null : inspectElement(focusedElement),
    focusMatchesInspectedLeaf: focusedElement === null ? null : focusedLeaf === leaf,
    activeLeafMatchesInspectedLeaf: activeLeaf === null ? null : activeLeaf === leaf,
  };
}

export function getDeepestActiveElement(document: Document): Element | null {
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

export function getScopePresets(context: WorkspaceContext): ScopePresetOption[] {
  const presets: ScopePresetOption[] = [{ id: "view", label: "View type" }];

  if (context.mode !== null) {
    presets.push({ id: "view-and-mode", label: "View type and mode" });
  }

  if (context.area !== "unknown") {
    presets.push({ id: "exact", label: "Exact location" });
  }

  return presets;
}

export function formatCondition(context: WorkspaceContext, preset: ScopePreset): string {
  assertScopePresetAvailable(context, preset);
  const lines: string[] = [];

  if (preset === "exact") {
    lines.push(`area: ${context.area}`);
  }

  lines.push(`viewType: ${JSON.stringify(context.viewType)}`);

  if (preset !== "view" && context.mode !== null) {
    lines.push(`mode: ${context.mode}`);
  }

  return lines.join("\n");
}

export function describeCondition(context: WorkspaceContext, preset: ScopePreset): string {
  assertScopePresetAvailable(context, preset);
  const view = context.viewLabel || context.viewType;

  if (preset === "view") {
    return `Matches ${view} regardless of workspace area or Markdown mode.`;
  }

  if (preset === "view-and-mode") {
    return `Matches ${view} in ${context.mode} mode, regardless of workspace area.`;
  }

  const mode = context.mode === null ? "" : ` in ${context.mode} mode`;
  return `Matches ${view}${mode} in the ${context.area} area.`;
}

function assertScopePresetAvailable(context: WorkspaceContext, preset: ScopePreset): void {
  if (!getScopePresets(context).some(({ id }) => id === preset)) {
    throw new RangeError(`Scope preset "${preset}" is unavailable for this context.`);
  }
}

export function findContainingLeaf(app: App, element: Element): WorkspaceLeaf | null {
  let match: WorkspaceLeaf | null = null;
  let matchContainer: HTMLElement | null = null;

  app.workspace.iterateAllLeaves((leaf) => {
    const container = leaf.view.containerEl;

    if (
      container.ownerDocument === element.ownerDocument &&
      containsComposedElement(container, element) &&
      (matchContainer === null || matchContainer.contains(container))
    ) {
      match = leaf;
      matchContainer = container;
    }
  });

  return match;
}

function containsComposedElement(container: Element, element: Element): boolean {
  let candidate: Element | null = element;

  while (candidate !== null) {
    if (container.contains(candidate)) {
      return true;
    }

    const root = candidate.getRootNode();
    const host = "host" in root ? (root.host as EventTarget) : null;
    candidate = asDomElement(host);
  }

  return false;
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
