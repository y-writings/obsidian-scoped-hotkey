interface CommandDouble {
  id: string;
  name: string;
  callback?: () => unknown;
}

export class Plugin {
  readonly commands: CommandDouble[] = [];
  private readonly cleanups: Array<() => void> = [];

  constructor(
    readonly app: unknown,
    _manifest: unknown,
  ) {}

  addCommand<T extends CommandDouble>(command: T): T {
    this.commands.push(command);
    return command;
  }

  registerEvent(_event: unknown): void {}

  register(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  runRegisteredCleanups(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      cleanup();
    }
  }
}

export class Modal {
  readonly contentEl = document.body.appendChild(document.createElement("div"));
  readonly titleEl = document.body.appendChild(document.createElement("h2"));
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
  static readonly instances: Notice[] = [];
  readonly containerEl = document.createElement("div");
  readonly messageEl = this.containerEl.appendChild(document.createElement("div"));
  hidden = false;

  constructor(
    message: string | DocumentFragment,
    readonly duration?: number,
  ) {
    Notice.messages.push(typeof message === "string" ? message : (message.textContent ?? ""));
    Notice.instances.push(this);
    document.body.append(this.containerEl);
    this.setMessage(message);
  }

  setMessage(message: string | DocumentFragment): this {
    this.messageEl.replaceChildren();
    this.messageEl.append(message);
    return this;
  }

  hide(): void {
    this.hidden = true;
    this.containerEl.remove();
  }

  static reset(): void {
    for (const notice of Notice.instances) {
      notice.containerEl.remove();
    }
    Notice.messages.length = 0;
    Notice.instances.length = 0;
  }
}

export class MarkdownView {}

export class WorkspaceWindow {}
