import { asElement } from "./context";

export type PanePickerStopReason = "selected" | "escape" | "command" | "timeout" | "unload";

interface PanePickerOptions {
  timeoutMs: number;
  resolvePane: (element: Element) => HTMLElement | null;
  onSelect: (element: Element) => void;
  onInvalidSelection: () => void;
  onStop: (reason: PanePickerStopReason) => void;
}

function isElement(target: EventTarget): target is Element {
  return (
    typeof target === "object" &&
    target !== null &&
    "tagName" in target &&
    "ownerDocument" in target &&
    "closest" in target &&
    typeof target.closest === "function"
  );
}

export class PanePicker {
  private readonly documents = new Set<Document>();
  private destroyed = false;
  private highlightedPane: HTMLElement | null = null;
  private timeoutId: number | null = null;
  private waiting = false;

  constructor(private readonly options: PanePickerOptions) {}

  get active(): boolean {
    return this.waiting;
  }

  observe(document: Document): void {
    if (this.destroyed || this.documents.has(document)) return;
    document.addEventListener("pointermove", this.handlePointerMove, true);
    document.addEventListener("pointerdown", this.blockSelectionEvent, true);
    document.addEventListener("pointerup", this.blockSelectionEvent, true);
    document.addEventListener("mousedown", this.blockSelectionEvent, true);
    document.addEventListener("mouseup", this.blockSelectionEvent, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    this.documents.add(document);
  }

  unobserve(document: Document): void {
    document.removeEventListener("pointermove", this.handlePointerMove, true);
    document.removeEventListener("pointerdown", this.blockSelectionEvent, true);
    document.removeEventListener("pointerup", this.blockSelectionEvent, true);
    document.removeEventListener("mousedown", this.blockSelectionEvent, true);
    document.removeEventListener("mouseup", this.blockSelectionEvent, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    this.documents.delete(document);

    if (this.highlightedPane?.ownerDocument === document) this.clearHighlight();
  }

  start(): void {
    if (this.destroyed || this.waiting) return;
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
    if (this.destroyed) return;
    this.destroyed = true;
    const wasWaiting = this.waiting;
    this.waiting = false;

    if (this.timeoutId !== null) window.clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.clearHighlight();

    for (const document of [...this.documents]) {
      this.unobserve(document);
    }

    if (wasWaiting) this.options.onStop("unload");
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.waiting || this.isPickerControl(event)) return;
    const element = asElement(event);
    this.setHighlight(element === null ? null : this.options.resolvePane(element));
  };

  private readonly blockSelectionEvent = (event: Event): void => {
    if (this.waiting && !this.isPickerControl(event)) this.consume(event);
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.waiting || this.isPickerControl(event)) return;
    this.consume(event);
    const element = asElement(event);
    const pane = element === null ? null : this.options.resolvePane(element);
    this.clearHighlight();

    if (element === null || pane === null) {
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
    return event
      .composedPath()
      .some(
        (target) =>
          isElement(target) && target.closest(".scoped-hotkey-picker__cancel") !== null,
      );
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
