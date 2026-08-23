import { type App, Modal } from "obsidian";

import {
  type ElementContext,
  formatStableCondition,
  type WorkspaceContext,
} from "./context";

export class ContextModal extends Modal {
  constructor(
    app: App,
    private readonly context: WorkspaceContext,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("Clicked workspace context");
    this.contentEl.addClass("scoped-hotkey-inspector");

    const stableSection = this.createSection("Stable condition candidates");
    this.createTable(stableSection, [
      ["Area", this.context.area],
      ["View type", this.context.viewType],
      ["Markdown mode", this.context.mode],
    ]);
    stableSection
      .createEl("pre", { cls: "scoped-hotkey-inspector__condition" })
      .createEl("code", { text: formatStableCondition(this.context) });

    const viewSection = this.createSection("View details");
    this.createTable(viewSection, [
      ["Display label", this.context.viewLabel],
      ["Leaf source", this.context.leafSource],
    ]);

    const focusSection = this.createSection("DOM and focus diagnostics");
    focusSection.createEl("p", {
      cls: "setting-item-description",
      text: "DOM values are diagnostic aids and may change between Obsidian or plugin versions.",
    });
    const elementGrid = focusSection.createDiv({
      cls: "scoped-hotkey-inspector__element-grid",
    });
    this.createElementTable(elementGrid, "Clicked element", this.context.clickedElement);
    this.createElementTable(elementGrid, "Focused element", this.context.focusedElement);
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private createSection(title: string): HTMLElement {
    const section = this.contentEl.createDiv({ cls: "scoped-hotkey-inspector__section" });
    section.createEl("h3", { text: title });
    return section;
  }

  private createElementTable(
    section: HTMLElement,
    title: string,
    element: ElementContext | null,
  ): void {
    const elementSection = section.createDiv();
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

  private createTable(section: HTMLElement, rows: Array<[string, string | null]>): void {
    const table = section.createEl("table", { cls: "scoped-hotkey-inspector__table" });
    const body = table.createEl("tbody");

    for (const [label, value] of rows) {
      const row = body.createEl("tr");
      row.createEl("th", { text: label });
      row.createEl("td").createEl("code", { text: value ?? "—" });
    }
  }
}
