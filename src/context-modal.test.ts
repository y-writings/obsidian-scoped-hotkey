// @vitest-environment happy-dom

import { type App, Modal, Notice } from "obsidian";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ContextModal } from "./context-modal";
import type { WorkspaceContext } from "./context";

type ModalDouble = Modal & { isOpen: boolean };
type NoticeDouble = typeof Notice & {
  messages: string[];
  reset(): void;
};

const noticeDouble = Notice as NoticeDouble;

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    createEl: {
      configurable: true,
      value(
        this: HTMLElement,
        tagName: string,
        options: { cls?: string | string[]; text?: string } = {},
      ): HTMLElement {
        const element = this.ownerDocument.createElement(tagName);
        const classNames = Array.isArray(options.cls)
          ? options.cls
          : options.cls?.split(" ").filter(Boolean);
        if (classNames !== undefined) {
          element.classList.add(...classNames);
        }
        if (options.text !== undefined) {
          element.textContent = options.text;
        }
        this.append(element);
        return element;
      },
    },
    createDiv: {
      configurable: true,
      value(
        this: HTMLElement,
        options: { cls?: string | string[]; text?: string } = {},
      ): HTMLDivElement {
        return this.createEl("div", options);
      },
    },
    addClass: {
      configurable: true,
      value(this: HTMLElement, ...classNames: string[]): void {
        this.classList.add(...classNames);
      },
    },
    empty: {
      configurable: true,
      value(this: HTMLElement): void {
        this.replaceChildren();
      },
    },
  });
});

beforeEach(() => {
  document.body.replaceChildren();
  noticeDouble.reset();
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("Obsidian modal test doubles", () => {
  it("backs modal content with the DOM and tracks its lifecycle", () => {
    const calls: string[] = [];
    class TestModal extends Modal {
      override onOpen(): void {
        calls.push("open");
      }

      override onClose(): void {
        calls.push("close");
      }
    }
    const modal = new TestModal({} as App) as TestModal & ModalDouble;

    expect(modal.contentEl.ownerDocument).toBe(document);
    modal.setTitle("Test modal");
    expect(modal.titleEl.textContent).toBe("Test modal");

    modal.open();
    expect(modal.isOpen).toBe(true);
    expect(calls).toEqual(["open"]);

    modal.close();
    expect(modal.isOpen).toBe(false);
    expect(calls).toEqual(["open", "close"]);
  });

  it("records and resets notice messages", () => {
    new Notice("First message");
    new Notice("Second message");

    expect(noticeDouble.messages).toEqual(["First message", "Second message"]);

    noticeDouble.reset();
    expect(noticeDouble.messages).toEqual([]);
  });
});

function createContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    source: "current",
    area: "main",
    viewType: "markdown",
    viewLabel: "Markdown",
    mode: "source",
    leafSource: "focused-element",
    selectedElement: null,
    focusedElement: null,
    focusMatchesInspectedLeaf: true,
    activeLeafMatchesInspectedLeaf: true,
    ...overrides,
  };
}

function openModal(
  context: WorkspaceContext = createContext(),
  onInspectAnother = vi.fn(),
): ContextModal {
  const modal = new ContextModal({} as App, context, { onInspectAnother });
  modal.open();
  return modal;
}

function getRequiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  expect(element, `Expected to find ${selector}`).not.toBeNull();
  return element as T;
}

function expectBefore(first: Element, second: Element): void {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

function getButton(container: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    ({ textContent }) => textContent === label,
  );
  expect(button, `Expected to find the ${label} button`).toBeDefined();
  return button as HTMLButtonElement;
}

function getTableValue(container: ParentNode, label: string): string | null {
  const row = Array.from(container.querySelectorAll("tr")).find(
    (candidate) => candidate.querySelector("th")?.textContent === label,
  );
  expect(row, `Expected to find the ${label} row`).toBeDefined();
  return getRequiredElement<HTMLElement>(row as HTMLTableRowElement, "td code").textContent;
}

function setClipboard(clipboard: Pick<Clipboard, "writeText"> | undefined): void {
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
}

describe("ContextModal", () => {
  it("opens with the current workspace context API", () => {
    const modal = new ContextModal({} as App, createContext(), {
      onInspectAnother: vi.fn(),
    });

    expect(() => modal.open()).not.toThrow();
  });

  it("orders detected context before the recommended condition and diagnostics", () => {
    const modal = openModal();
    const summary = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__summary",
    );
    const detected = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__detected-values",
    );
    const scopeSelect = getRequiredElement<HTMLSelectElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__scope-select",
    );
    const matchRange = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__match-range",
    );
    const condition = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__condition code",
    );
    const actions = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__actions",
    );
    const diagnostics = getRequiredElement<HTMLDetailsElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__diagnostics",
    );

    expect(summary.textContent).toContain("Current keyboard context");
    expect(detected.textContent).toContain("Area");
    expect(detected.textContent).toContain("main");
    expect(detected.textContent).toContain("View type");
    expect(detected.textContent).toContain("markdown");
    expect(detected.textContent).toContain("Mode");
    expect(detected.textContent).toContain("source");
    expect(detected.textContent).toContain("Selected fields are combined with AND.");
    expect(scopeSelect.value).toBe("view");
    expect(Array.from(scopeSelect.options, ({ value, text }) => [value, text])).toEqual([
      ["view", "View type"],
      ["view-and-mode", "View type and mode"],
      ["exact", "Exact location"],
    ]);
    expect(
      getRequiredElement(modal.contentEl, ".scoped-hotkey-inspector__recommendation")
        .textContent,
    ).toBe(
      "Recommended because workspace area and Markdown mode can change during normal use.",
    );
    expect(matchRange.textContent).toBe(
      "Matches Markdown regardless of workspace area or Markdown mode.",
    );
    expect(condition.textContent).toBe('viewType: "markdown"');
    expect(Array.from(actions.querySelectorAll("button"), ({ textContent }) => textContent)).toEqual(
      ["Copy condition", "Inspect another pane"],
    );
    expect(diagnostics.open).toBe(false);
    expect(getRequiredElement(diagnostics, "summary").textContent).toBe("Advanced diagnostics");
    expect(modal.contentEl.lastElementChild).toBe(diagnostics);

    expectBefore(summary, detected);
    expectBefore(detected, scopeSelect);
    expectBefore(scopeSelect, matchRange);
    expectBefore(matchRange, condition);
    expectBefore(condition, actions);
    expectBefore(actions, diagnostics);
  });

  it.each([
    [createContext({ area: "unknown" }), ["view", "view-and-mode"]],
    [
      createContext({ viewType: "search", viewLabel: "Search", mode: null }),
      ["view", "exact"],
    ],
  ] as const)("offers only scope presets available for the detected values", (context, expected) => {
    const modal = openModal(context);
    const select = getRequiredElement<HTMLSelectElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__scope-select",
    );

    expect(Array.from(select.options, ({ value }) => value)).toEqual(expected);
  });

  it("updates the match range and YAML together when the scope changes", () => {
    const modal = openModal();
    const select = getRequiredElement<HTMLSelectElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__scope-select",
    );
    const matchRange = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__match-range",
    );
    const condition = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__condition code",
    );

    select.value = "view-and-mode";
    select.dispatchEvent(new Event("change"));

    expect(matchRange.textContent).toBe(
      "Matches Markdown in source mode, regardless of workspace area.",
    );
    expect(condition.textContent).toBe('viewType: "markdown"\nmode: source');

    select.value = "exact";
    select.dispatchEvent(new Event("change"));

    expect(matchRange.textContent).toBe("Matches Markdown in source mode in the main area.");
    expect(condition.textContent).toBe(
      'area: main\nviewType: "markdown"\nmode: source',
    );
  });

  it("uses native, keyboard-tabbable controls", () => {
    const modal = openModal();
    const select = getRequiredElement<HTMLSelectElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__scope-select",
    );
    const buttons = modal.contentEl.querySelectorAll<HTMLButtonElement>(
      ".scoped-hotkey-inspector__actions button",
    );
    const details = getRequiredElement<HTMLDetailsElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__diagnostics",
    );
    const summary = getRequiredElement<HTMLElement>(details, "summary");

    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(select.tabIndex).toBe(0);
    expect(Array.from(buttons, ({ tagName }) => tagName)).toEqual(["BUTTON", "BUTTON"]);
    expect(Array.from(buttons, ({ tabIndex }) => tabIndex)).toEqual([0, 0]);
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps diagnostics closed and reports stable comparison fields", () => {
    const modal = openModal();
    const diagnostics = getRequiredElement<HTMLDetailsElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__diagnostics",
    );

    expect(diagnostics.open).toBe(false);
    expect(diagnostics.textContent).toContain("Display label");
    expect(diagnostics.textContent).toContain("Markdown");
    expect(diagnostics.textContent).toContain("Context source");
    expect(diagnostics.textContent).toContain("current");
    expect(diagnostics.textContent).toContain("Leaf source");
    expect(diagnostics.textContent).toContain("focused-element");
    expect(diagnostics.textContent).toContain("Focus matches inspected leaf");
    expect(diagnostics.textContent).toContain("Active leaf matches inspected leaf");
    expect(diagnostics.textContent).toContain("Focused element");
    expect(diagnostics.textContent).toContain("None");
    expect(diagnostics.textContent).not.toContain("Selected element");
    expect(diagnostics.textContent).toContain(
      "DOM values may change across Obsidian or plugin versions.",
    );
  });

  it.each([
    [true, "true"],
    [false, "false"],
    [null, "Not available"],
  ] as const)("renders the %s leaf comparison value", (comparison, expected) => {
    const modal = openModal(
      createContext({
        focusMatchesInspectedLeaf: comparison,
        activeLeafMatchesInspectedLeaf: comparison,
      }),
    );
    const diagnostics = getRequiredElement<HTMLDetailsElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__diagnostics",
    );

    expect(getTableValue(diagnostics, "Focus matches inspected leaf")).toBe(expected);
    expect(getTableValue(diagnostics, "Active leaf matches inspected leaf")).toBe(expected);
  });

  it.each([
    [false, true],
    [true, false],
    [false, false],
  ] as const)(
    "warns when a selected pane differs from focus or the active pane",
    (focusMatchesInspectedLeaf, activeLeafMatchesInspectedLeaf) => {
      const modal = openModal(
        createContext({
          source: "selected-pane",
          leafSource: "selected-element",
          focusMatchesInspectedLeaf,
          activeLeafMatchesInspectedLeaf,
        }),
      );
      const summary = getRequiredElement(
        modal.contentEl,
        ".scoped-hotkey-inspector__summary",
      );
      const warning = getRequiredElement(
        modal.contentEl,
        ".scoped-hotkey-inspector__warning",
      );
      const detected = getRequiredElement(
        modal.contentEl,
        ".scoped-hotkey-inspector__detected-values",
      );

      expect(summary.textContent).toContain("Selected pane snapshot");
      expect(warning.textContent).toContain("generated condition uses the selected pane");
      expect(warning.textContent).toContain("current keyboard focus");
      expect(warning.textContent).toContain("active pane");
      expectBefore(summary, warning);
      expectBefore(warning, detected);
    },
  );

  it.each([
    [true, true],
    [null, true],
    [true, null],
    [null, null],
  ] as const)(
    "does not warn when selected-pane comparisons are true or unavailable",
    (focusMatchesInspectedLeaf, activeLeafMatchesInspectedLeaf) => {
      const modal = openModal(
        createContext({
          source: "selected-pane",
          leafSource: "selected-element",
          focusMatchesInspectedLeaf,
          activeLeafMatchesInspectedLeaf,
        }),
      );

      expect(modal.contentEl.querySelector(".scoped-hotkey-inspector__warning")).toBeNull();
    },
  );

  it("does not show a selected-pane warning for the current keyboard context", () => {
    const modal = openModal(
      createContext({
        source: "current",
        focusMatchesInspectedLeaf: false,
        activeLeafMatchesInspectedLeaf: false,
      }),
    );

    expect(modal.contentEl.querySelector(".scoped-hotkey-inspector__warning")).toBeNull();
  });

  it("keeps focused and selected element diagnostics when they are present", () => {
    const modal = openModal(
      createContext({
        source: "selected-pane",
        leafSource: "selected-element",
        selectedElement: {
          tagName: "button",
          inputType: null,
          role: "switch",
          classNames: ["click-target"],
          isContentEditable: false,
          isTextInput: false,
        },
        focusedElement: {
          tagName: "input",
          inputType: "text",
          role: "textbox",
          classNames: ["prompt-input", "mod-primary"],
          isContentEditable: false,
          isTextInput: true,
        },
      }),
    );
    const focused = getRequiredElement(
      modal.contentEl,
      ".scoped-hotkey-inspector__focused-element",
    );
    const selected = getRequiredElement(
      modal.contentEl,
      ".scoped-hotkey-inspector__selected-element",
    );
    const elementGrid = getRequiredElement(
      modal.contentEl,
      ".scoped-hotkey-inspector__element-grid",
    );

    expect(elementGrid.contains(focused)).toBe(true);
    expect(elementGrid.contains(selected)).toBe(true);
    expect(focused.textContent).toContain("Focused element");
    expect(focused.textContent).toContain("Tag");
    expect(focused.textContent).toContain("input");
    expect(focused.textContent).toContain("Input type");
    expect(focused.textContent).toContain("text");
    expect(focused.textContent).toContain("Role");
    expect(focused.textContent).toContain("textbox");
    expect(focused.textContent).toContain("Classes");
    expect(focused.textContent).toContain("prompt-input mod-primary");
    expect(focused.textContent).toContain("Content editable");
    expect(focused.textContent).toContain("false");
    expect(focused.textContent).toContain("Text input");
    expect(focused.textContent).toContain("true");

    expect(selected.textContent).toContain("Selected element");
    expect(selected.textContent).toContain("button");
    expect(selected.textContent).toContain("switch");
    expect(selected.textContent).toContain("click-target");
  });

  it("omits selected element diagnostics when no element was selected", () => {
    const modal = openModal(createContext({ selectedElement: null }));
    const elementGrid = getRequiredElement(
      modal.contentEl,
      ".scoped-hotkey-inspector__element-grid",
    );
    const focused = getRequiredElement(
      elementGrid,
      ".scoped-hotkey-inspector__focused-element",
    );

    expect(elementGrid.children).toHaveLength(1);
    expect(elementGrid.firstElementChild).toBe(focused);
    expect(elementGrid.querySelector(".scoped-hotkey-inspector__selected-element")).toBeNull();
  });

  it("copies the exact visible condition and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const modal = openModal();
    const select = getRequiredElement<HTMLSelectElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__scope-select",
    );
    const condition = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__condition code",
    );
    select.value = "exact";
    select.dispatchEvent(new Event("change"));

    getButton(modal.contentEl, "Copy condition").click();

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(condition.textContent));
    expect(noticeDouble.messages).toEqual(["Condition copied."]);
  });

  it("keeps the condition visible when clipboard writing rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    setClipboard({ writeText });
    const modal = openModal() as ContextModal & ModalDouble;
    const condition = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__condition code",
    );
    const visibleCondition = condition.textContent;

    getButton(modal.contentEl, "Copy condition").click();

    await vi.waitFor(() =>
      expect(noticeDouble.messages).toEqual([
        "Could not copy the condition. Select the text and copy it manually.",
      ]),
    );
    expect(modal.isOpen).toBe(true);
    expect(condition.textContent).toBe(visibleCondition);
  });

  it("keeps the condition visible when the clipboard API is missing", async () => {
    setClipboard(undefined);
    const modal = openModal() as ContextModal & ModalDouble;
    const condition = getRequiredElement<HTMLElement>(
      modal.contentEl,
      ".scoped-hotkey-inspector__condition code",
    );
    const visibleCondition = condition.textContent;

    getButton(modal.contentEl, "Copy condition").click();

    await vi.waitFor(() =>
      expect(noticeDouble.messages).toEqual([
        "Could not copy the condition. Select the text and copy it manually.",
      ]),
    );
    expect(modal.isOpen).toBe(true);
    expect(condition.textContent).toBe(visibleCondition);
  });

  it("closes before asking to inspect another pane", () => {
    let modal: ContextModal & ModalDouble;
    const onInspectAnother = vi.fn(() => {
      expect(modal.isOpen).toBe(false);
      expect(modal.contentEl.childElementCount).toBe(0);
    });
    modal = openModal(createContext(), onInspectAnother) as ContextModal & ModalDouble;

    getButton(modal.contentEl, "Inspect another pane").click();

    expect(onInspectAnother).toHaveBeenCalledOnce();
  });

  it("empties modal content when closed", () => {
    const modal = openModal();
    expect(modal.contentEl.childElementCount).toBeGreaterThan(0);

    modal.close();

    expect(modal.contentEl.childElementCount).toBe(0);
  });
});
