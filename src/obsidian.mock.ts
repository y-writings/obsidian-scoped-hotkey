export class Modal {
  readonly contentEl = document.body.createDiv();
  readonly titleEl = document.body.createEl("h2");
  isOpen = false;

  constructor(_app: unknown) {}

  open(): void {
    this.isOpen = true;
    this.onOpen();
  }

  close(): void {
    this.isOpen = false;
    this.onClose();
  }

  setTitle(title: string): this {
    this.titleEl.textContent = title;
    return this;
  }

  onOpen(): void {}

  onClose(): void {}
}

export class Notice {
  static readonly messages: string[] = [];

  constructor(message: string) {
    Notice.messages.push(message);
  }

  static reset(): void {
    Notice.messages.length = 0;
  }
}

export class MarkdownView {}

export class WorkspaceWindow {}
