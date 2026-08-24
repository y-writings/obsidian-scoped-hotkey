import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";

import {
  asElement,
  findContainingLeaf,
  getDeepestActiveElement,
  inspectCurrentWorkspaceContext,
  inspectSelectedWorkspaceContext,
  type WorkspaceContext,
} from "./context";
import { ContextModal } from "./context-modal";
import { PanePicker, type PanePickerStopReason } from "./pane-picker";

const PICKER_PROMPT =
  "Select a workspace pane. Press Escape or Cancel to stop. Selection times out in 30 seconds.";
const INVALID_PICKER_PROMPT =
  "Select a workspace pane. Ribbon, title bar, status bar, and modal controls are not panes.";

export default class ScopedHotkeyPlugin extends Plugin {
  private activeLeaf: WorkspaceLeaf | null = null;
  private readonly focusedElements = new WeakMap<Document, Element>();
  private readonly observedDocuments = new Set<Document>();
  private pickerNotice: Notice | null = null;
  private readonly picker = new PanePicker({
    timeoutMs: 30_000,
    resolvePane: (element) => findContainingLeaf(this.app, element)?.view.containerEl ?? null,
    onSelect: (element) => this.inspectSelectedPane(element),
    onInvalidSelection: () => this.showPickerStatus(INVALID_PICKER_PROMPT),
    onStop: (reason) => this.handlePickerStop(reason),
  });

  override onload(): void {
    this.activeLeaf = this.app.workspace.getMostRecentLeaf();

    this.addCommand({
      id: "inspect-current-context",
      name: "Inspect current context",
      callback: () => this.inspectCurrentContext(),
    });
    this.addCommand({
      id: "inspect-next-click-context",
      name: "Select pane to inspect",
      callback: () => this.togglePanePicker(),
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
      this.picker.destroy();

      for (const observedDocument of this.observedDocuments) {
        observedDocument.removeEventListener("focusin", this.handleFocusIn, true);
      }
      this.observedDocuments.clear();
    });
  }

  private inspectCurrentContext(): void {
    if (this.picker.active) this.picker.toggle();

    const activeLeaf = this.activeLeaf ?? this.app.workspace.getMostRecentLeaf();
    const relevantDocument =
      activeLeaf?.view.containerEl.ownerDocument ?? this.app.workspace.containerEl.ownerDocument;
    const focusedElement = this.getFocusedWorkspaceElement(relevantDocument);
    const context = inspectCurrentWorkspaceContext(this.app, focusedElement, activeLeaf);

    if (context === null) {
      new Notice("No active workspace context could be inspected.");
      return;
    }

    this.openContextModal(context);
  }

  private inspectSelectedPane(selectedElement: Element): void {
    const focusedElement = this.getFocusedWorkspaceElement(selectedElement.ownerDocument);
    const context = inspectSelectedWorkspaceContext(
      this.app,
      selectedElement,
      focusedElement,
      this.activeLeaf,
    );

    this.openContextModal(context!);
  }

  private openContextModal(context: WorkspaceContext): void {
    new ContextModal(this.app, context, {
      onInspectAnother: () => this.startPanePicker(),
    }).open();
  }

  private getFocusedWorkspaceElement(document: Document): Element | null {
    const focusedElement = getDeepestActiveElement(document);
    if (focusedElement !== null && findContainingLeaf(this.app, focusedElement) !== null) {
      return focusedElement;
    }

    return this.focusedElements.get(document) ?? null;
  }

  private togglePanePicker(): void {
    const starting = !this.picker.active;
    this.picker.toggle();
    if (starting) this.showPickerStatus(PICKER_PROMPT);
  }

  private startPanePicker(): void {
    this.picker.start();
    this.showPickerStatus(PICKER_PROMPT);
  }

  private showPickerStatus(message: string): void {
    const fragment = createFragment();
    const cancelButton = createEl("button");
    cancelButton.type = "button";
    cancelButton.className = "scoped-hotkey-picker__cancel";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => this.picker.cancel());
    fragment.append(message, " ", cancelButton);

    if (this.pickerNotice === null) {
      this.pickerNotice = new Notice(fragment, 0);
    } else {
      this.pickerNotice.setMessage(fragment);
    }
  }

  private hidePickerStatus(): void {
    this.pickerNotice?.hide();
    this.pickerNotice = null;
  }

  private handlePickerStop(reason: PanePickerStopReason): void {
    this.hidePickerStatus();

    if (reason === "escape" || reason === "command") {
      new Notice("Pane inspection canceled.");
    } else if (reason === "timeout") {
      new Notice("Pane inspection timed out.");
    }
  }

  private readonly handleFocusIn = (event: FocusEvent): void => {
    this.rememberWorkspaceFocus(asElement(event));
  };

  private rememberWorkspaceFocus(focusedElement: Element | null): void {
    if (focusedElement !== null && findContainingLeaf(this.app, focusedElement) !== null) {
      this.focusedElements.set(focusedElement.ownerDocument, focusedElement);
    }
  }

  private observeDocument(document: Document): void {
    if (this.observedDocuments.has(document)) return;
    this.picker.observe(document);
    document.addEventListener("focusin", this.handleFocusIn, true);
    this.rememberWorkspaceFocus(getDeepestActiveElement(document));
    this.observedDocuments.add(document);
  }

  private stopObservingDocument(document: Document): void {
    this.observedDocuments.delete(document);
    this.picker.unobserve(document);
    document.removeEventListener("focusin", this.handleFocusIn, true);
    this.focusedElements.delete(document);
  }
}
