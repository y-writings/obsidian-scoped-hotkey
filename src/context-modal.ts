import { type App, Modal, Notice } from "obsidian";

import {
  describeCondition,
  formatCondition,
  getScopePresets,
  type ElementContext,
  type ScopePreset,
  type WorkspaceContext,
} from "./context";

interface ContextModalActions {
  onInspectAnother(): void;
}

export class ContextModal extends Modal {
  constructor(
    app: App,
    private readonly context: WorkspaceContext,
    private readonly actions: ContextModalActions,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("Workspace context");
    this.contentEl.addClass("scoped-hotkey-inspector");

    this.contentEl.createEl("p", {
      cls: "scoped-hotkey-inspector__summary",
      text:
        this.context.source === "current"
          ? "Current keyboard context."
          : "Selected pane snapshot.",
    });

    if (
      this.context.source === "selected-pane" &&
      (this.context.focusMatchesInspectedLeaf === false ||
        this.context.activeLeafMatchesInspectedLeaf === false)
    ) {
      this.contentEl.createEl("p", {
        cls: "scoped-hotkey-inspector__warning",
        text: "The generated condition uses the selected pane rather than the current keyboard focus or active pane.",
      });
    }

    const detectedSection = this.contentEl.createEl("section", {
      cls: "scoped-hotkey-inspector__detected-values",
    });
    detectedSection.createEl("h3", { text: "Detected values" });
    this.createTable(detectedSection, [
      ["Area", this.context.area],
      ["View type", this.context.viewType],
      ["Mode", this.context.mode],
    ]);
    const combinationDescription = detectedSection.createEl("p");
    combinationDescription.append("Selected fields are combined with ");
    combinationDescription.createEl("code", { text: "AND" });
    combinationDescription.append(".");

    const scopeSection = this.contentEl.createEl("section", {
      cls: "scoped-hotkey-inspector__scope",
    });
    scopeSection.createEl("h3", { text: "Condition scope" });
    const scopeLabel = scopeSection.createEl("label");
    scopeLabel.append("Match using");
    const scopeSelect = scopeLabel.createEl("select", {
      cls: "scoped-hotkey-inspector__scope-select",
    });
    for (const preset of getScopePresets(this.context)) {
      const option = scopeSelect.createEl("option", { text: preset.label });
      option.value = preset.id;
    }
    scopeSection.createEl("p", {
      cls: "scoped-hotkey-inspector__recommendation",
      text: "Recommended because workspace area and Markdown mode can change during normal use.",
    });

    const matchRange = scopeSection.createEl("p", {
      cls: "scoped-hotkey-inspector__match-range",
    });
    scopeSection.createEl("h3", { text: "Generated condition" });
    const condition = scopeSection
      .createEl("pre", { cls: "scoped-hotkey-inspector__condition" })
      .createEl("code");
    const updateCondition = (): void => {
      const preset = scopeSelect.value as ScopePreset;
      matchRange.textContent = describeCondition(this.context, preset);
      condition.textContent = formatCondition(this.context, preset);
    };
    scopeSelect.addEventListener("change", updateCondition);
    updateCondition();

    const actions = this.contentEl.createDiv({
      cls: "scoped-hotkey-inspector__actions",
    });
    const copyButton = actions.createEl("button", { text: "Copy condition" });
    copyButton.type = "button";
    copyButton.addEventListener("click", () => {
      void this.copyCondition(condition.textContent ?? "");
    });
    const inspectButton = actions.createEl("button", { text: "Inspect another pane" });
    inspectButton.type = "button";
    inspectButton.addEventListener("click", () => {
      this.close();
      this.actions.onInspectAnother();
    });

    const diagnostics = this.contentEl.createEl("details", {
      cls: "scoped-hotkey-inspector__diagnostics",
    });
    const diagnosticsSummary = diagnostics.createEl("summary", {
      text: "Advanced diagnostics",
    });
    diagnosticsSummary.tabIndex = 0;
    diagnostics.createEl("p", {
      text: "DOM values may change across Obsidian or plugin versions.",
    });
    this.createTable(diagnostics, [
      ["Display label", this.context.viewLabel],
      ["Context source", this.context.source],
      ["Leaf source", this.context.leafSource],
      ["Focus matches inspected leaf", this.formatComparison(this.context.focusMatchesInspectedLeaf)],
      [
        "Active leaf matches inspected leaf",
        this.formatComparison(this.context.activeLeafMatchesInspectedLeaf),
      ],
    ]);
    this.createElementDiagnostics(
      diagnostics,
      "Focused element",
      "scoped-hotkey-inspector__focused-element",
      this.context.focusedElement,
    );
    if (this.context.selectedElement !== null) {
      this.createElementDiagnostics(
        diagnostics,
        "Selected element",
        "scoped-hotkey-inspector__selected-element",
        this.context.selectedElement,
      );
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private createTable(section: HTMLElement, rows: Array<[string, string | null]>): void {
    const table = section.createEl("table", { cls: "scoped-hotkey-inspector__table" });
    const body = table.createEl("tbody");

    for (const [label, value] of rows) {
      const row = body.createEl("tr");
      row.createEl("th", { text: label });
      row.createEl("td").createEl("code", { text: value ?? "Not detected" });
    }
  }

  private createElementDiagnostics(
    section: HTMLElement,
    title: string,
    className: string,
    element: ElementContext | null,
  ): void {
    const elementSection = section.createEl("section", { cls: className });
    elementSection.createEl("h4", { text: title });

    if (element === null) {
      elementSection.createEl("p", { text: "None" });
      return;
    }

    this.createTable(elementSection, [
      ["Tag", element.tagName],
      ["Input type", element.inputType],
      ["Role", element.role],
      ["Classes", element.classNames.length === 0 ? null : element.classNames.join(" ")],
      ["Content editable", String(element.isContentEditable)],
      ["Text input", String(element.isTextInput)],
    ]);
  }

  private async copyCondition(condition: string): Promise<void> {
    try {
      const clipboard = this.contentEl.ownerDocument.defaultView?.navigator.clipboard;
      if (clipboard === undefined) {
        throw new Error("Clipboard API unavailable");
      }

      await clipboard.writeText(condition);
      new Notice("Condition copied.");
    } catch {
      new Notice("Could not copy the condition. Select the text and copy it manually.");
    }
  }

  private formatComparison(value: boolean | null): string {
    return value === null ? "Not available" : String(value);
  }
}
