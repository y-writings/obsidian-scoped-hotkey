// @vitest-environment happy-dom

import {
  type App,
  type Command,
  Notice,
  type PluginManifest,
  type WorkspaceLeaf,
  WorkspaceWindow,
} from "obsidian";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceContext } from "./context";
import { ContextModal } from "./context-modal";
import ScopedHotkeyPlugin from "./main";

interface PluginHarness extends ScopedHotkeyPlugin {
  commands: Command[];
  runRegisteredCleanups(): void;
}

interface NoticeState extends Notice {
  duration?: number;
  hidden: boolean;
}

type NoticeHarness = typeof Notice & {
  instances: NoticeState[];
  messages: string[];
  reset(): void;
};

interface ModalState {
  context: WorkspaceContext;
  actions: {
    onInspectAnother(): void;
  };
}

type WorkspaceArea = "main" | "left-sidebar" | "right-sidebar" | "popout-window";

interface LeafOptions {
  area: WorkspaceArea;
  viewType?: string;
  ownerDocument?: Document;
}

const noticeHarness = Notice as NoticeHarness;
const openedModals: ModalState[] = [];
let loadedPlugin: PluginHarness | null = null;

function createWorkspaceFixture() {
  const rootSplit = {};
  const leftSplit = {};
  const rightSplit = {};
  const workspaceContainer = document.body.appendChild(document.createElement("main"));
  const leaves: WorkspaceLeaf[] = [];
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  let mostRecentLeaf: WorkspaceLeaf | null = null;

  const workspace = {
    containerEl: workspaceContainer,
    rootSplit,
    leftSplit,
    rightSplit,
    getMostRecentLeaf: () => mostRecentLeaf,
    iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
      for (const leaf of leaves) callback(leaf);
    },
    on: (name: string, callback: (...args: unknown[]) => void) => {
      const callbacks = listeners.get(name) ?? [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
      return { name, callback };
    },
  };
  const app = { workspace } as unknown as App;

  function addLeaf({
    area,
    viewType = area === "main" ? "markdown" : `${area}-view`,
    ownerDocument = document,
  }: LeafOptions): WorkspaceLeaf {
    const containerEl = ownerDocument.createElement("section");
    containerEl.className = "workspace-leaf";
    if (ownerDocument === document) workspaceContainer.append(containerEl);
    else ownerDocument.body.append(containerEl);

    const root =
      area === "main"
        ? rootSplit
        : area === "left-sidebar"
          ? leftSplit
          : area === "right-sidebar"
            ? rightSplit
            : {};
    const container =
      area === "popout-window"
        ? (Object.create(WorkspaceWindow.prototype) as WorkspaceWindow)
        : {};
    const leaf = {
      view: {
        containerEl,
        getViewType: () => viewType,
        getDisplayText: () => viewType,
      },
      getContainer: () => container,
      getRoot: () => root,
    } as unknown as WorkspaceLeaf;
    leaves.push(leaf);
    mostRecentLeaf ??= leaf;
    return leaf;
  }

  function emit(name: string, ...args: unknown[]): void {
    for (const callback of listeners.get(name) ?? []) callback(...args);
  }

  return {
    app,
    addLeaf,
    emit,
    setMostRecentLeaf: (leaf: WorkspaceLeaf | null) => {
      mostRecentLeaf = leaf;
    },
  };
}

function loadPlugin(app: App): PluginHarness {
  const manifest = {
    id: "scoped-hotkey",
    name: "Scoped Hotkey",
    version: "0.1.0",
    minAppVersion: "1.0.0",
    description: "",
    author: "",
  } as PluginManifest;
  const plugin = new ScopedHotkeyPlugin(app, manifest) as PluginHarness;
  plugin.onload();
  loadedPlugin = plugin;
  return plugin;
}

function runCommand(plugin: PluginHarness, id: string): void {
  const command = plugin.commands.find((candidate) => candidate.id === id);
  expect(command, `Expected command ${id}`).toBeDefined();
  expect(command?.callback, `Expected ${id} to have a callback`).toBeTypeOf("function");
  command?.callback?.();
}

function dispatchClick(element: Element): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  element.dispatchEvent(event);
  return event;
}

function currentModal(): ModalState {
  const modal = openedModals.at(-1);
  expect(modal).toBeDefined();
  return modal as ModalState;
}

function currentPersistentNotice(): NoticeState {
  const notice = [...noticeHarness.instances].reverse().find(({ duration }) => duration === 0);
  expect(notice).toBeDefined();
  return notice as NoticeState;
}

beforeAll(() => {
  Object.defineProperties(window, {
    createFragment: {
      configurable: true,
      value: () => document.createDocumentFragment(),
    },
    createEl: {
      configurable: true,
      value: (tagName: string) => document.createElement(tagName),
    },
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  noticeHarness.reset();
  openedModals.length = 0;
  vi.spyOn(ContextModal.prototype, "open").mockImplementation(function (this: ContextModal) {
    openedModals.push(this as unknown as ModalState);
  });
});

afterEach(() => {
  loadedPlugin?.runRegisteredCleanups();
  loadedPlugin = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ScopedHotkeyPlugin commands and current context", () => {
  it("registers the primary command and retains the persisted picker command ID", () => {
    const fixture = createWorkspaceFixture();
    fixture.addLeaf({ area: "main" });
    const plugin = loadPlugin(fixture.app);

    expect(plugin.commands.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "inspect-current-context", name: "Inspect current context" },
      { id: "inspect-next-click-context", name: "Select pane to inspect" },
    ]);
  });

  it("uses remembered workspace focus instead of command-palette focus", () => {
    const fixture = createWorkspaceFixture();
    fixture.addLeaf({ area: "main" });
    const focusedLeaf = fixture.addLeaf({ area: "left-sidebar" });
    const workspaceInput = focusedLeaf.view.containerEl.appendChild(
      document.createElement("input"),
    );
    workspaceInput.className = "workspace-input";
    workspaceInput.focus();
    const plugin = loadPlugin(fixture.app);
    const paletteInput = document.body.appendChild(document.createElement("input"));
    paletteInput.className = "prompt-input";
    paletteInput.focus();

    runCommand(plugin, "inspect-current-context");

    expect(currentModal().context).toMatchObject({
      area: "left-sidebar",
      leafSource: "focused-element",
    });
    expect(currentModal().context.focusedElement?.classNames).toEqual(["workspace-input"]);
  });

  it("initializes and updates the active-leaf fallback", () => {
    const fixture = createWorkspaceFixture();
    const mainLeaf = fixture.addLeaf({ area: "main" });
    const rightLeaf = fixture.addLeaf({ area: "right-sidebar" });
    fixture.setMostRecentLeaf(mainLeaf);
    const plugin = loadPlugin(fixture.app);

    runCommand(plugin, "inspect-current-context");
    fixture.emit("active-leaf-change", rightLeaf);
    runCommand(plugin, "inspect-current-context");

    expect(openedModals.map(({ context }) => [context.area, context.leafSource])).toEqual([
      ["main", "active-leaf-event"],
      ["right-sidebar", "active-leaf-event"],
    ]);
  });

  it("shows the exact empty-state notice when no workspace context exists", () => {
    const fixture = createWorkspaceFixture();
    const plugin = loadPlugin(fixture.app);

    runCommand(plugin, "inspect-current-context");

    expect(openedModals).toHaveLength(0);
    expect(noticeHarness.messages).toEqual(["No active workspace context could be inspected."]);
  });
});

describe("ScopedHotkeyPlugin pane picker", () => {
  it("shows one persistent status with a native cancel button", () => {
    const fixture = createWorkspaceFixture();
    fixture.addLeaf({ area: "main" });
    const plugin = loadPlugin(fixture.app);

    runCommand(plugin, "inspect-next-click-context");

    const notice = currentPersistentNotice();
    expect(notice.hidden).toBe(false);
    expect(notice.messageEl.textContent).toContain("Select a workspace pane.");
    expect(notice.messageEl.textContent).toContain("Press Escape or Cancel to stop.");
    expect(notice.messageEl.textContent).toContain("Selection times out in 30 seconds.");
    const cancelButton = notice.messageEl.querySelector<HTMLButtonElement>(
      "button.scoped-hotkey-picker__cancel",
    );
    expect(cancelButton?.textContent).toBe("Cancel");

    cancelButton?.click();

    expect(notice.hidden).toBe(true);
    expect(noticeHarness.messages.at(-1)).toBe("Pane inspection canceled.");
  });

  it("cancels an active picker when the persisted command is invoked again", () => {
    const fixture = createWorkspaceFixture();
    fixture.addLeaf({ area: "main" });
    const plugin = loadPlugin(fixture.app);
    runCommand(plugin, "inspect-next-click-context");
    const notice = currentPersistentNotice();

    runCommand(plugin, "inspect-next-click-context");

    expect(notice.hidden).toBe(true);
    expect(noticeHarness.messages.at(-1)).toBe("Pane inspection canceled.");
  });

  it("times out after 30 seconds and hides the persistent status", () => {
    const fixture = createWorkspaceFixture();
    fixture.addLeaf({ area: "main" });
    const plugin = loadPlugin(fixture.app);
    runCommand(plugin, "inspect-next-click-context");
    const notice = currentPersistentNotice();

    vi.advanceTimersByTime(30_000);

    expect(notice.hidden).toBe(true);
    expect(noticeHarness.messages.at(-1)).toBe("Pane inspection timed out.");
  });

  it("reports an invalid target, then opens the selected-pane modal and hides status", () => {
    const fixture = createWorkspaceFixture();
    const activeLeaf = fixture.addLeaf({ area: "main" });
    const selectedLeaf = fixture.addLeaf({ area: "right-sidebar" });
    fixture.setMostRecentLeaf(activeLeaf);
    const plugin = loadPlugin(fixture.app);
    const outside = document.body.appendChild(document.createElement("button"));
    const selected = selectedLeaf.view.containerEl.appendChild(document.createElement("button"));
    runCommand(plugin, "inspect-next-click-context");
    const notice = currentPersistentNotice();

    dispatchClick(outside);

    expect(noticeHarness.instances).toHaveLength(1);
    expect(notice.hidden).toBe(false);
    expect(notice.messageEl.textContent).toContain(
      "Ribbon, title bar, status bar, and modal controls are not panes.",
    );
    expect(openedModals).toHaveLength(0);

    dispatchClick(selected);

    expect(notice.hidden).toBe(true);
    expect(noticeHarness.instances).toHaveLength(1);
    expect(currentModal().context).toMatchObject({
      source: "selected-pane",
      area: "right-sidebar",
      leafSource: "selected-element",
      activeLeafMatchesInspectedLeaf: false,
    });
    expect(currentModal().context.selectedElement?.tagName).toBe("button");
  });

  it("starts the picker and status from a modal's Inspect another action", () => {
    const fixture = createWorkspaceFixture();
    fixture.addLeaf({ area: "main" });
    const plugin = loadPlugin(fixture.app);
    runCommand(plugin, "inspect-current-context");

    currentModal().actions.onInspectAnother();

    const notice = currentPersistentNotice();
    expect(notice.hidden).toBe(false);
    expect(notice.messageEl.textContent).toContain("Select a workspace pane.");
  });
});

describe("ScopedHotkeyPlugin document lifecycle", () => {
  it("observes a popout on open and stops observing it on close", () => {
    const fixture = createWorkspaceFixture();
    fixture.addLeaf({ area: "main" });
    const plugin = loadPlugin(fixture.app);
    const popoutDocument = document.implementation.createHTMLDocument("New popout");
    const popoutLeaf = fixture.addLeaf({ area: "popout-window", ownerDocument: popoutDocument });
    const target = popoutLeaf.view.containerEl.appendChild(popoutDocument.createElement("button"));
    const targetHandler = vi.fn();
    target.addEventListener("click", targetHandler);

    fixture.emit("window-open", {}, { document: popoutDocument });
    runCommand(plugin, "inspect-next-click-context");
    dispatchClick(target);

    expect(currentModal().context.area).toBe("popout-window");
    expect(targetHandler).not.toHaveBeenCalled();

    fixture.emit("window-close", {}, { document: popoutDocument });
    runCommand(plugin, "inspect-next-click-context");
    const event = dispatchClick(target);

    expect(event.defaultPrevented).toBe(false);
    expect(targetHandler).toHaveBeenCalledOnce();
    expect(openedModals).toHaveLength(1);
  });

  it("destroys picker state, focus listeners, status, and timeout on unload without feedback", () => {
    const fixture = createWorkspaceFixture();
    const leaf = fixture.addLeaf({ area: "main" });
    const removeListener = vi.spyOn(document, "removeEventListener");
    const plugin = loadPlugin(fixture.app);
    const target = leaf.view.containerEl.appendChild(document.createElement("button"));
    const targetHandler = vi.fn();
    target.addEventListener("click", targetHandler);
    runCommand(plugin, "inspect-next-click-context");
    const notice = currentPersistentNotice();

    plugin.runRegisteredCleanups();
    loadedPlugin = null;
    const event = dispatchClick(target);

    expect(notice.hidden).toBe(true);
    expect(noticeHarness.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener.mock.calls.filter(([type]) => type === "focusin")).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);
    expect(targetHandler).toHaveBeenCalledOnce();
  });
});
