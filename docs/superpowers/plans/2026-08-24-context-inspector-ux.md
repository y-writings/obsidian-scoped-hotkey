# Context Inspector UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make current keyboard context inspection accurate and make optional pointer-based pane inspection safe, visible, cancellable, and actionable.

**Architecture:** `context.ts` owns leaf resolution and pure condition generation, a new `pane-picker.ts` owns the pointer-selection state machine, `main.ts` wires Obsidian lifecycle and focus history, and `context-modal.ts` renders the result and actions. Current and selected contexts share leaf-to-context conversion but have separate public entry points so pointer hit testing cannot enter future hotkey dispatch by accident.

**Tech Stack:** TypeScript 5.8, Obsidian Plugin API, Vitest 4, happy-dom, CSS using Obsidian variables

---

## File map

- Modify `src/context.ts`: resolve current and selected contexts and generate scope presets.
- Modify `src/context.test.ts`: regress focus, leaf source, area, preset, and YAML behavior.
- Create `src/pane-picker.ts`: manage selection state, event suppression, hover, cancel, and timeout.
- Create `src/pane-picker.test.ts`: exercise picker state and browser event propagation.
- Modify `src/obsidian.mock.ts`: provide test doubles for `Plugin`, `Modal`, `Notice`, and views.
- Modify `src/context-modal.ts`: render summary, scope controls, actions, and collapsed diagnostics.
- Create `src/context-modal.test.ts`: test modal hierarchy, scope updates, and clipboard outcomes.
- Modify `src/main.ts`: register both commands, preserve workspace focus, and wire picker lifecycle.
- Create `src/main.test.ts`: verify command wiring, command-palette focus exclusion, and picker reuse.
- Modify `styles.css`: style the compact modal, actions, warnings, picker outline, and responsive details.
- Modify `README.md`: document the primary current-context workflow and safe pane picker.

### Task 1: Current context and scope model

**Files:**
- Modify: `src/context.ts:9-213`
- Modify: `src/context.test.ts:1-128`

- [ ] **Step 1: Write failing current-versus-selected context tests**

Replace the old click-first assertions with fixtures that create main and sidebar leaves, then add these cases:

```ts
it("uses the focused workspace leaf for current hotkey context", () => {
  const { app, mainLeaf, rightLeaf } = createWorkspace();
  const input = document.createElement("input");
  rightLeaf.view.containerEl.append(input);

  const context = inspectCurrentWorkspaceContext(app, input, mainLeaf);

  expect(context).toMatchObject({
    source: "current",
    area: "right-sidebar",
    viewType: "right-view",
    leafSource: "focused-element",
    activeLeafMatchesInspectedLeaf: false,
  });
});

it("falls back to the active leaf when modal focus is excluded by the caller", () => {
  const { app, mainLeaf } = createWorkspace();

  const context = inspectCurrentWorkspaceContext(app, null, mainLeaf);

  expect(context).toMatchObject({
    area: "main",
    leafSource: "active-leaf-event",
    focusedElement: null,
  });
});

it("does not replace an invalid selected target with another focused leaf", () => {
  const { app, rightLeaf } = createWorkspace();
  const ribbonButton = document.createElement("button");
  const focusedInput = document.createElement("input");
  rightLeaf.view.containerEl.append(focusedInput);
  document.body.append(ribbonButton);

  expect(inspectSelectedWorkspaceContext(app, ribbonButton, focusedInput, rightLeaf)).toBeNull();
});

it("reports when selected, focused, and active leaves differ", () => {
  const { app, mainLeaf, rightLeaf } = createWorkspace();
  const selected = document.createElement("button");
  const focused = document.createElement("input");
  rightLeaf.view.containerEl.append(selected);
  mainLeaf.view.containerEl.append(focused);

  const context = inspectSelectedWorkspaceContext(app, selected, focused, mainLeaf);

  expect(context).toMatchObject({
    source: "selected-pane",
    leafSource: "selected-element",
    focusMatchesInspectedLeaf: false,
    activeLeafMatchesInspectedLeaf: false,
  });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/context.test.ts`

Expected: FAIL because `inspectCurrentWorkspaceContext` and `inspectSelectedWorkspaceContext` are not exported.

- [ ] **Step 3: Implement separate resolver entry points over one leaf converter**

Define the public model and functions in `src/context.ts`:

```ts
export type ContextSource = "current" | "selected-pane";
export type LeafSource = "focused-element" | "active-leaf-event" | "selected-element";

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
```

`inspectLeaf` must compute comparison fields by leaf object identity, use the existing
`classifyArea` and `inspectElement`, and call `MarkdownView.getMode()` only for a
`MarkdownView`. Export `findContainingLeaf` and rename `findDeepestActiveElement` to the
exported `getDeepestActiveElement` so `main.ts` can exclude modal focus before resolution.

- [ ] **Step 4: Run context resolution tests**

Run: `npm test -- src/context.test.ts`

Expected: PASS for current/selected leaf resolution, shadow-root focus, and element diagnostics.

- [ ] **Step 5: Write failing scope preset tests**

Add these assertions to `src/context.test.ts`:

```ts
it("defaults to view type without over-constraining area or mode", () => {
  const context = createContext({ area: "main", viewType: "markdown", mode: "source" });

  expect(getScopePresets(context).map(({ id }) => id)).toEqual([
    "view",
    "view-and-mode",
    "exact",
  ]);
  expect(formatCondition(context, "view")).toBe('viewType: "markdown"');
  expect(describeCondition(context, "view")).toContain("regardless of workspace area");
});

it("combines selected preset fields as AND conditions", () => {
  const context = createContext({ area: "main", viewType: "markdown", mode: "preview" });

  expect(formatCondition(context, "exact")).toBe(
    'area: main\nviewType: "markdown"\nmode: preview',
  );
});

it("does not offer or output an unknown area", () => {
  const context = createContext({ area: "unknown", viewType: "custom-view", mode: null });

  expect(getScopePresets(context).map(({ id }) => id)).toEqual(["view"]);
  expect(formatCondition(context, "view")).not.toContain("area:");
});
```

- [ ] **Step 6: Run the scope tests and verify failure**

Run: `npm test -- src/context.test.ts`

Expected: FAIL because `getScopePresets`, `formatCondition`, and `describeCondition` do not exist.

- [ ] **Step 7: Implement pure scope generation**

Add the following API to `src/context.ts` and remove `formatStableCondition`:

```ts
export type ScopePreset = "view" | "view-and-mode" | "exact";

export interface ScopePresetOption {
  id: ScopePreset;
  label: string;
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
  const lines: string[] = [];

  if (preset === "exact" && context.area !== "unknown") {
    lines.push(`area: ${context.area}`);
  }

  lines.push(`viewType: ${JSON.stringify(context.viewType)}`);

  if (preset !== "view" && context.mode !== null) {
    lines.push(`mode: ${context.mode}`);
  }

  return lines.join("\n");
}

export function describeCondition(context: WorkspaceContext, preset: ScopePreset): string {
  const view = context.viewLabel || context.viewType;

  if (preset === "view") {
    return `Matches ${view} regardless of workspace area or Markdown mode.`;
  }

  if (preset === "view-and-mode" && context.mode !== null) {
    return `Matches ${view} in ${context.mode} mode, regardless of workspace area.`;
  }

  const mode = context.mode === null ? "" : ` in ${context.mode} mode`;
  return `Matches ${view}${mode} in the ${context.area} area.`;
}
```

- [ ] **Step 8: Run all context tests and commit**

Run: `npm test -- src/context.test.ts`

Expected: PASS.

```bash
git add src/context.ts src/context.test.ts
git commit -m "feat: resolve active inspector context"
```

### Task 2: Safe pane picker state machine

**Files:**
- Create: `src/pane-picker.ts`
- Create: `src/pane-picker.test.ts`

- [ ] **Step 1: Write failing event-safety and state tests**

Create `src/pane-picker.test.ts` with a workspace container resolver and these core cases:

```ts
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanePicker } from "./pane-picker";

describe("PanePicker", () => {
  let picker: PanePicker;
  const onSelect = vi.fn();
  const onInvalidSelection = vi.fn();
  const onStop = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    vi.clearAllMocks();
    picker = new PanePicker({
      timeoutMs: 30_000,
      resolvePane: (element) => element.closest<HTMLElement>(".workspace-leaf"),
      onSelect,
      onInvalidSelection,
      onStop,
    });
    picker.observe(document);
  });

  afterEach(() => {
    picker.destroy();
    vi.useRealTimers();
  });

  it.each([
    ["button", "button"],
    ["link", "a"],
    ["checkbox", "input"],
    ["tab", "button"],
  ])("consumes the %s selection click", (_name, tagName) => {
    const leaf = document.body.appendChild(document.createElement("div"));
    leaf.className = "workspace-leaf";
    const target = leaf.appendChild(document.createElement(tagName));
    if (_name === "checkbox") target.setAttribute("type", "checkbox");
    if (_name === "tab") target.setAttribute("role", "tab");
    const handler = vi.fn();
    target.addEventListener("click", handler);
    picker.start();

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(handler).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(target);
  });

  it("leaves normal clicks untouched while inactive", () => {
    const button = document.body.appendChild(document.createElement("button"));
    const handler = vi.fn();
    button.addEventListener("click", handler);

    button.click();

    expect(handler).toHaveBeenCalledOnce();
  });

  it("keeps waiting after an invalid selection", () => {
    const outside = document.body.appendChild(document.createElement("button"));
    picker.start();

    outside.click();

    expect(picker.active).toBe(true);
    expect(onInvalidSelection).toHaveBeenCalledOnce();
  });

  it("cancels with Escape, command toggle, and timeout", () => {
    picker.start();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onStop).toHaveBeenLastCalledWith("escape");

    picker.start();
    picker.toggle();
    expect(onStop).toHaveBeenLastCalledWith("command");

    picker.start();
    vi.advanceTimersByTime(30_000);
    expect(onStop).toHaveBeenLastCalledWith("timeout");
  });
});
```

Add separate tests for pointer down/up propagation, hover moving the
`scoped-hotkey-picker-target` class between leaves, cancel-control events being ignored, valid
selection cleanup, `unobserve`, and `destroy` reporting `unload` only when active.

- [ ] **Step 2: Run picker tests and verify failure**

Run: `npm test -- src/pane-picker.test.ts`

Expected: FAIL because `src/pane-picker.ts` does not exist.

- [ ] **Step 3: Implement the picker**

Create `src/pane-picker.ts` with this public contract and event behavior:

```ts
import { asElement } from "./context";

export type PanePickerStopReason = "selected" | "escape" | "command" | "timeout" | "unload";

interface PanePickerOptions {
  timeoutMs: number;
  resolvePane: (element: Element) => HTMLElement | null;
  onSelect: (element: Element) => void;
  onInvalidSelection: () => void;
  onStop: (reason: PanePickerStopReason) => void;
}

export class PanePicker {
  private readonly documents = new Set<Document>();
  private highlightedPane: HTMLElement | null = null;
  private timeoutId: number | null = null;
  private waiting = false;

  constructor(private readonly options: PanePickerOptions) {}

  get active(): boolean {
    return this.waiting;
  }

  observe(document: Document): void {
    if (this.documents.has(document)) return;
    document.addEventListener("pointermove", this.handlePointerMove, true);
    document.addEventListener("pointerdown", this.blockPointerEvent, true);
    document.addEventListener("pointerup", this.blockPointerEvent, true);
    document.addEventListener("mousedown", this.blockPointerEvent, true);
    document.addEventListener("mouseup", this.blockPointerEvent, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    this.documents.add(document);
  }

  unobserve(document: Document): void {
    document.removeEventListener("pointermove", this.handlePointerMove, true);
    document.removeEventListener("pointerdown", this.blockPointerEvent, true);
    document.removeEventListener("pointerup", this.blockPointerEvent, true);
    document.removeEventListener("mousedown", this.blockPointerEvent, true);
    document.removeEventListener("mouseup", this.blockPointerEvent, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    this.documents.delete(document);
    if (this.highlightedPane?.ownerDocument === document) this.clearHighlight();
  }

  start(): void {
    if (this.waiting) return;
    this.waiting = true;
    this.timeoutId = window.setTimeout(() => this.finish("timeout"), this.options.timeoutMs);
  }

  toggle(): void {
    if (this.waiting) this.finish("command");
    else this.start();
  }

  cancel(): void {
    if (this.waiting) this.finish("escape");
  }

  destroy(): void {
    if (this.waiting) this.finish("unload");
    for (const document of [...this.documents]) this.unobserve(document);
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.waiting || this.isPickerControl(event)) return;
    const element = asElement(event);
    this.setHighlight(element === null ? null : this.options.resolvePane(element));
  };

  private readonly blockPointerEvent = (event: Event): void => {
    if (this.waiting && !this.isPickerControl(event)) this.consume(event);
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.waiting || this.isPickerControl(event)) return;
    this.consume(event);
    const element = asElement(event);
    if (element === null || this.options.resolvePane(element) === null) {
      this.options.onInvalidSelection();
      return;
    }
    this.finish("selected");
    this.options.onSelect(element);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.waiting || event.key !== "Escape") return;
    this.consume(event);
    this.finish("escape");
  };

  private isPickerControl(event: Event): boolean {
    return asElement(event)?.closest(".scoped-hotkey-picker__cancel") !== null;
  }

  private consume(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private setHighlight(pane: HTMLElement | null): void {
    if (pane === this.highlightedPane) return;
    this.clearHighlight();
    this.highlightedPane = pane;
    this.highlightedPane?.classList.add("scoped-hotkey-picker-target");
  }

  private clearHighlight(): void {
    this.highlightedPane?.classList.remove("scoped-hotkey-picker-target");
    this.highlightedPane = null;
  }

  private finish(reason: PanePickerStopReason): void {
    if (!this.waiting) return;
    this.waiting = false;
    if (this.timeoutId !== null) window.clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.clearHighlight();
    this.options.onStop(reason);
  }
}
```

- [ ] **Step 4: Run picker tests and commit**

Run: `npm test -- src/pane-picker.test.ts`

Expected: PASS for event suppression, invalid selection, hover, all cancellation paths, and cleanup.

```bash
git add src/pane-picker.ts src/pane-picker.test.ts
git commit -m "feat: add safe workspace pane picker"
```

### Task 3: Action-oriented result modal

**Files:**
- Modify: `src/obsidian.mock.ts:1-3`
- Modify: `src/context-modal.ts:1-92`
- Create: `src/context-modal.test.ts`

- [ ] **Step 1: Expand Obsidian test doubles and write failing modal tests**

Make `src/obsidian.mock.ts` expose DOM-backed test doubles. `Notice.messages` records string
messages, `Modal.open()` calls `onOpen()`, and `Modal.close()` calls `onClose()`:

```ts
export class Notice {
  static messages: string[] = [];
  messageEl = document.createElement("div");
  constructor(message: string | DocumentFragment) {
    this.setMessage(message);
  }
  setMessage(message: string | DocumentFragment): this {
    this.messageEl.replaceChildren();
    this.messageEl.append(message);
    Notice.messages.push(this.messageEl.textContent ?? "");
    return this;
  }
  hide(): void {}
}

export class Modal {
  contentEl = document.createElement("div");
  title = "";
  constructor(public app: unknown) {}
  setTitle(title: string): void { this.title = title; }
  open(): void { this.onOpen(); }
  close(): void { this.onClose(); }
  onOpen(): void {}
  onClose(): void {}
}
```

Retain `MarkdownView` and `WorkspaceWindow`, and add a minimal `Plugin` test double in Task 4.
In `src/context-modal.test.ts`, install the Obsidian `createEl`, `createDiv`, `addClass`, `empty`
DOM helpers on `HTMLElement.prototype`, create a current-context fixture, and assert:

```ts
it("puts the match summary, condition, and actions before collapsed diagnostics", () => {
  const modal = new ContextModal(app, context, { onInspectAnother: vi.fn() });
  modal.open();

  const diagnostics = modal.contentEl.querySelector("details");
  expect(modal.contentEl.textContent).toContain("regardless of workspace area");
  expect(modal.contentEl.querySelector("code")?.textContent).toBe('viewType: "markdown"');
  expect(diagnostics?.open).toBe(false);
  expect(modal.contentEl.querySelectorAll("button")).toHaveLength(2);
});

it("updates both summary and YAML when scope changes", () => {
  const modal = new ContextModal(app, context, { onInspectAnother: vi.fn() });
  modal.open();
  const select = modal.contentEl.querySelector("select")!;

  select.value = "exact";
  select.dispatchEvent(new Event("change"));

  expect(modal.contentEl.querySelector("code")?.textContent).toContain("area: main");
  expect(modal.contentEl.textContent).toContain("in the main area");
});
```

Add tests for selected/focused mismatch text, exact preset omission for unknown area, copy
success, copy rejection, and `Inspect another pane` closing before invoking its callback.

- [ ] **Step 2: Run modal tests and verify failure**

Run: `npm test -- src/context-modal.test.ts`

Expected: FAIL because the modal constructor has no actions and still renders the old stable-candidate layout.

- [ ] **Step 3: Implement the new modal hierarchy and actions**

Replace `ContextModal.onOpen()` with sections in this exact order: source summary, mismatch
warning when comparison fields are false, scope select and reason, match-range output, YAML,
actions, then a closed `details` disclosure. Use this constructor and clipboard method:

```ts
interface ContextModalActions {
  onInspectAnother: () => void;
}

export class ContextModal extends Modal {
  private preset: ScopePreset = "view";

  constructor(
    app: App,
    private readonly context: WorkspaceContext,
    private readonly actions: ContextModalActions,
  ) {
    super(app);
  }

  private async copyCondition(condition: string): Promise<void> {
    try {
      const clipboard = this.contentEl.ownerDocument.defaultView?.navigator.clipboard;
      if (clipboard === undefined) throw new Error("Clipboard API unavailable");
      await clipboard.writeText(condition);
      new Notice("Condition copied.");
    } catch {
      new Notice("Could not copy the condition. Select the text and copy it manually.");
    }
  }
}
```

The default reason must read `Recommended because workspace area and Markdown mode can change
during normal use.` The action buttons must be native `<button type="button">` elements.
`Copy condition` passes the current `formatCondition` result to `copyCondition`; `Inspect
another pane` calls `close()` and then `actions.onInspectAnother()`. Keep the existing element
diagnostic table code inside `details`, rename clicked diagnostics to selected diagnostics,
and show them only when `selectedElement` is non-null.

- [ ] **Step 4: Run modal and context tests and commit**

Run: `npm test -- src/context-modal.test.ts src/context.test.ts`

Expected: PASS.

```bash
git add src/obsidian.mock.ts src/context-modal.ts src/context-modal.test.ts
git commit -m "feat: make inspector results actionable"
```

### Task 4: Plugin lifecycle and command integration

**Files:**
- Modify: `src/obsidian.mock.ts`
- Modify: `src/main.ts:1-97`
- Create: `src/main.test.ts`

- [ ] **Step 1: Add a Plugin mock and failing integration tests**

Add this `Plugin` test double to `src/obsidian.mock.ts`:

```ts
export class Plugin {
  readonly commands: Array<{ id: string; name: string; callback?: () => void }> = [];
  readonly cleanups: Array<() => void> = [];
  constructor(public app: unknown) {}
  addCommand(command: { id: string; name: string; callback?: () => void }): void {
    this.commands.push(command);
  }
  registerEvent(): void {}
  register(cleanup: () => void): void { this.cleanups.push(cleanup); }
}
```

Create `src/main.test.ts`, mock `ContextModal.prototype.open`, and assert both commands and
focus history:

```ts
it("registers current inspection as primary and retains the picker command ID", () => {
  const plugin = createPlugin();
  plugin.onload();
  const commands = (plugin as unknown as { commands: Array<{ id: string; name: string }> }).commands;

  expect(commands).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "inspect-current-context", name: "Inspect current context" }),
    expect.objectContaining({ id: "inspect-next-click-context", name: "Select pane to inspect" }),
  ]));
});

it("uses remembered workspace focus instead of command palette focus", () => {
  const { plugin, editor, paletteInput, currentCommand } = loadPluginFixture();
  editor.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  paletteInput.focus();

  currentCommand.callback?.();

  const opened = vi.mocked(ContextModal.prototype.open).mock.instances[0] as unknown as {
    context: WorkspaceContext;
  };
  expect(opened.context.viewType).toBe("markdown");
  expect(opened.context.focusedElement?.isTextInput).toBe(true);
});
```

Add cases for no resolvable current leaf showing a notice, picker command toggling cancellation,
valid selected pane opening a `selected-pane` context, invalid outside click leaving the picker
active, pop-out observe/unobserve, and unload cleanup.

- [ ] **Step 2: Run integration tests and verify failure**

Run: `npm test -- src/main.test.ts`

Expected: FAIL because the plugin registers only the old click command and does not retain workspace focus.

- [ ] **Step 3: Wire current inspection, focus history, picker, and persistent notice**

Refactor `src/main.ts` to initialize `activeLeaf` from `workspace.getMostRecentLeaf()`, create one
`PanePicker`, and register both commands. Use a `WeakMap<Document, Element>` for the last valid
workspace focus. On `focusin`, update the map only when `findContainingLeaf(app, element)` is
non-null.

Resolve current focus with this helper:

```ts
private getWorkspaceFocus(document: Document): Element | null {
  const activeElement = getDeepestActiveElement(document);
  if (activeElement !== null && findContainingLeaf(this.app, activeElement) !== null) {
    return activeElement;
  }
  return this.lastWorkspaceFocus.get(document) ?? null;
}
```

The current command must call `inspectCurrentWorkspaceContext`, show `No active workspace
context could be inspected.` when it returns null, and otherwise open `ContextModal` with an
`onInspectAnother` callback that starts the picker.

Configure `PanePicker` as follows:

```ts
this.picker = new PanePicker({
  timeoutMs: 30_000,
  resolvePane: (element) => findContainingLeaf(this.app, element)?.view.containerEl ?? null,
  onSelect: (element) => this.inspectSelectedPane(element),
  onInvalidSelection: () => this.showPickerNotice(
    "Select a workspace pane. Ribbon, title bar, status bar, and modal controls are not panes.",
  ),
  onStop: (reason) => this.finishPicker(reason),
});
```

`showPickerNotice` must build a persistent `Notice` from a `DocumentFragment` containing the
message and a native button with class `scoped-hotkey-picker__cancel`; its click handler calls
`picker.cancel()`. Starting the picker displays `Select a workspace pane. Press Escape or
Cancel to stop. Selection times out in 30 seconds.` Stopping hides the persistent notice and
shows a short cancellation notice for `escape` and `command`, a timeout notice for `timeout`,
and no extra notice for `selected` or `unload`.

`observeDocument` and `stopObservingDocument` must delegate picker listener registration and
manage `focusin`. Plugin unload calls `picker.destroy()`, hides the notice, and clears observed
documents.

- [ ] **Step 4: Run plugin, picker, and context tests and commit**

Run: `npm test -- src/main.test.ts src/pane-picker.test.ts src/context.test.ts`

Expected: PASS.

```bash
git add src/obsidian.mock.ts src/main.ts src/main.test.ts
git commit -m "feat: inspect current workspace context"
```

### Task 5: Styling, documentation, and full verification

**Files:**
- Modify: `styles.css:1-59`
- Modify: `README.md:1-40`

- [ ] **Step 1: Add compact native styling**

Update `styles.css` so the primary content fits before diagnostics at a 768 px viewport, long
values wrap, actions stay visible, and the picker highlight does not change layout. Preserve
Obsidian variables and the existing narrow diagnostic fallback. Add these focused rules:

```css
.scoped-hotkey-inspector {
  min-width: min(42rem, 86vw);
}

.scoped-hotkey-inspector__summary {
  font-size: var(--font-ui-medium);
  margin-block: 0 var(--size-4-3);
}

.scoped-hotkey-inspector__warning {
  background: var(--background-modifier-warning);
  border-radius: var(--radius-s);
  padding: var(--size-4-3);
}

.scoped-hotkey-inspector__scope-select {
  max-width: 100%;
}

.scoped-hotkey-inspector__condition {
  max-height: 8rem;
  overflow: auto;
  overflow-wrap: anywhere;
  user-select: text;
  white-space: pre-wrap;
}

.scoped-hotkey-inspector__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-2);
  margin-top: var(--size-4-3);
}

.scoped-hotkey-inspector__diagnostics {
  margin-top: var(--size-4-4);
}

.scoped-hotkey-picker-target {
  outline: 2px solid var(--interactive-accent) !important;
  outline-offset: -2px;
}

.scoped-hotkey-picker__cancel {
  margin-inline-start: var(--size-4-2);
}
```

- [ ] **Step 2: Update the README workflow and structure**

Replace the click-first introduction with:

```md
The primary **Inspect current context** command reports the active workspace and keyboard-focus
context immediately. It ignores command-palette and inspector-modal focus so the result uses the
same context boundary intended for future scoped-hotkey dispatch.

Use **Select pane to inspect** or **Inspect another pane** to inspect an inactive pane. While the
picker is active, the plugin outlines valid panes, consumes the selection click, and supports
Cancel, Escape, command-toggle cancellation, and a 30-second timeout.
```

Document the `View type`, `View type and mode`, and `Exact location` presets, one-click copy,
collapsed advanced diagnostics, `pane-picker.ts`, and the new test files. Keep hotkey assignment,
rule persistence, and dispatch explicitly outside the current phase.

- [ ] **Step 3: Run formatting checks and all automated verification**

Run: `npm test`

Expected: all Vitest files pass.

Run: `npm run lint`

Expected: ESLint exits 0 with no findings.

Run: `npm run build`

Expected: TypeScript type checking and the production esbuild bundle complete successfully.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Review the acceptance criteria against the implementation**

Confirm each UX-001 through UX-007 checkbox maps to a passing test or an explicit UI element.
Pay particular attention to command-palette focus exclusion, pointerdown through click
suppression, outside-leaf continuation, `area: unknown` exclusion, native keyboard controls,
and diagnostics being closed by default.

- [ ] **Step 5: Commit documentation and styles**

```bash
git add README.md styles.css
git commit -m "docs: describe improved context inspector"
```

- [ ] **Step 6: Final branch verification**

Run: `git status --short --branch`

Expected: branch `feat/context-inspector-ux` has a clean worktree.

Run: `git log --oneline --decorate -8`

Expected: design, resolver, picker, modal, integration, and documentation commits are present.
