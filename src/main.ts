import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";

import { asElement, inspectWorkspaceContext } from "./context";
import { ContextModal } from "./context-modal";

export default class ScopedHotkeyPlugin extends Plugin {
  private activeLeaf: WorkspaceLeaf | null = null;
  private inspectionArmed = false;
  private armTimer: number | null = null;
  private readonly observedDocuments = new Set<Document>();

  override onload(): void {
    this.addCommand({
      id: "inspect-next-click-context",
      name: "Inspect next click context",
      callback: () => this.armInspection(),
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.activeLeaf = leaf;
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, popoutWindow) => {
        this.observeDocument(popoutWindow.document);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-close", (_workspaceWindow, popoutWindow) => {
        this.stopObservingDocument(popoutWindow.document);
      }),
    );

    this.observeDocument(this.app.workspace.containerEl.ownerDocument);
    this.app.workspace.iterateAllLeaves((leaf) => {
      this.observeDocument(leaf.view.containerEl.ownerDocument);
    });

    this.register(() => {
      if (this.armTimer !== null) {
        window.clearTimeout(this.armTimer);
      }

      this.inspectionArmed = false;
      for (const observedDocument of this.observedDocuments) {
        observedDocument.removeEventListener("click", this.handleClick, true);
      }
      this.observedDocuments.clear();
    });
  }

  private armInspection(): void {
    this.inspectionArmed = false;

    if (this.armTimer !== null) {
      window.clearTimeout(this.armTimer);
    }

    this.armTimer = window.setTimeout(() => {
      this.armTimer = null;
      this.inspectionArmed = true;
      new Notice("Click a workspace pane to inspect its context.");
    }, 0);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.inspectionArmed) {
      return;
    }

    this.inspectionArmed = false;
    const clickedElement = asElement(event);

    if (clickedElement === null) {
      new Notice("The clicked context could not be inspected.");
      return;
    }

    const context = inspectWorkspaceContext(this.app, clickedElement, this.activeLeaf);
    new ContextModal(this.app, context).open();
  };

  private observeDocument(document: Document): void {
    if (this.observedDocuments.has(document)) {
      return;
    }

    document.addEventListener("click", this.handleClick, true);
    this.observedDocuments.add(document);
  }

  private stopObservingDocument(document: Document): void {
    document.removeEventListener("click", this.handleClick, true);
    this.observedDocuments.delete(document);
  }
}
