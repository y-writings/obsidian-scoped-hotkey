// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanePicker, type PanePickerStopReason } from "./pane-picker";

const TARGET_CLASS = "scoped-hotkey-picker-target";

function appendLeaf(ownerDocument: Document = document): HTMLElement {
  const leaf = ownerDocument.createElement("div");
  leaf.className = "workspace-leaf";
  ownerDocument.body.append(leaf);
  return leaf;
}

function dispatchMouseEvent(target: Element, type: string): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchPointerEvent(target: Element, type: string): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe("PanePicker", () => {
  let picker: PanePicker;
  const onSelect = vi.fn<(element: Element) => void>();
  const onInvalidSelection = vi.fn<() => void>();
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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ["button", "button", null],
    ["link", "a", null],
    ["checkbox", "input", "checkbox"],
    ["tab", "button", "tab"],
  ] as const)("suppresses the %s click handler and default action", (_name, tagName, kind) => {
    const leaf = appendLeaf();
    const target = leaf.appendChild(document.createElement(tagName));
    if (kind === "checkbox") target.setAttribute("type", "checkbox");
    if (kind === "tab") target.setAttribute("role", "tab");
    if (tagName === "a") target.setAttribute("href", "#target");
    const handler = vi.fn();
    target.addEventListener("click", handler);
    picker.start();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    const dispatched = target.dispatchEvent(event);

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(target);
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("selected");
    expect(picker.active).toBe(false);
  });

  it("prevents checkbox activation while selecting it", () => {
    const checkbox = appendLeaf().appendChild(document.createElement("input"));
    checkbox.type = "checkbox";
    picker.start();

    checkbox.click();

    expect(checkbox.checked).toBe(false);
    expect(onSelect).toHaveBeenCalledWith(checkbox);
  });

  it("reports the selected stop before invoking the selection callback", () => {
    const callbacks: string[] = [];
    picker.destroy();
    picker = new PanePicker({
      timeoutMs: 30_000,
      resolvePane: (element) => element.closest<HTMLElement>(".workspace-leaf"),
      onSelect: () => {
        callbacks.push("select");
      },
      onInvalidSelection,
      onStop: (reason) => {
        callbacks.push(`stop:${reason}`);
      },
    });
    picker.observe(document);
    const target = appendLeaf().appendChild(document.createElement("button"));
    picker.start();

    dispatchMouseEvent(target, "click");

    expect(callbacks).toEqual(["stop:selected", "select"]);
  });

  it.each(["pointerdown", "pointerup", "mousedown", "mouseup"])(
    "suppresses %s propagation and its default action",
    (type) => {
      const target = appendLeaf().appendChild(document.createElement("button"));
      const handler = vi.fn();
      target.addEventListener(type, handler);
      picker.start();

      const event = type.startsWith("pointer")
        ? dispatchPointerEvent(target, type)
        : dispatchMouseEvent(target, type);

      expect(event.defaultPrevented).toBe(true);
      expect(handler).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
      expect(picker.active).toBe(true);
    },
  );

  it.each(["pointerdown", "pointerup", "mousedown", "mouseup"])(
    "leaves %s propagation and its default action untouched while inactive",
    (type) => {
      const target = document.body.appendChild(document.createElement("button"));
      const handler = vi.fn();
      target.addEventListener(type, handler);

      const event = type.startsWith("pointer")
        ? dispatchPointerEvent(target, type)
        : dispatchMouseEvent(target, type);

      expect(event.defaultPrevented).toBe(false);
      expect(handler).toHaveBeenCalledOnce();
      expect(onSelect).not.toHaveBeenCalled();
      expect(onInvalidSelection).not.toHaveBeenCalled();
      expect(onStop).not.toHaveBeenCalled();
      expect(picker.active).toBe(false);
    },
  );

  it("leaves normal clicks and activation untouched while inactive", () => {
    const checkbox = document.body.appendChild(document.createElement("input"));
    checkbox.type = "checkbox";
    const handler = vi.fn();
    checkbox.addEventListener("click", handler);

    checkbox.click();

    expect(handler).toHaveBeenCalledOnce();
    expect(checkbox.checked).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("consumes an invalid selection, clears hover, and keeps waiting for a valid selection", () => {
    const leaf = appendLeaf();
    const valid = leaf.appendChild(document.createElement("button"));
    const outside = document.body.appendChild(document.createElement("button"));
    const outsideHandler = vi.fn();
    outside.addEventListener("click", outsideHandler);
    picker.start();
    dispatchPointerEvent(valid, "pointermove");

    const invalidEvent = dispatchMouseEvent(outside, "click");

    expect(invalidEvent.defaultPrevented).toBe(true);
    expect(outsideHandler).not.toHaveBeenCalled();
    expect(leaf.classList.contains(TARGET_CLASS)).toBe(false);
    expect(picker.active).toBe(true);
    expect(onInvalidSelection).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();

    dispatchMouseEvent(valid, "click");

    expect(onInvalidSelection).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(valid);
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("selected");
    expect(picker.active).toBe(false);
  });

  it("consumes an invalid click without an element target", () => {
    picker.start();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onInvalidSelection).toHaveBeenCalledOnce();
    expect(picker.active).toBe(true);
  });

  it("moves and clears the hover class across observed documents", () => {
    const firstLeaf = appendLeaf();
    const firstTarget = firstLeaf.appendChild(document.createElement("span"));
    const popoutDocument = document.implementation.createHTMLDocument("Pop-out");
    const secondLeaf = appendLeaf(popoutDocument);
    const secondTarget = secondLeaf.appendChild(popoutDocument.createElement("span"));
    const outside = popoutDocument.body.appendChild(popoutDocument.createElement("span"));
    picker.observe(popoutDocument);
    picker.start();

    dispatchPointerEvent(firstTarget, "pointermove");
    expect(firstLeaf.classList.contains(TARGET_CLASS)).toBe(true);

    dispatchPointerEvent(secondTarget, "pointermove");
    expect(firstLeaf.classList.contains(TARGET_CLASS)).toBe(false);
    expect(secondLeaf.classList.contains(TARGET_CLASS)).toBe(true);

    dispatchPointerEvent(outside, "pointermove");
    expect(secondLeaf.classList.contains(TARGET_CLASS)).toBe(false);
  });

  it("clears only a highlighted pane owned by an unobserved document", () => {
    const mainLeaf = appendLeaf();
    const popoutDocument = document.implementation.createHTMLDocument("Pop-out");
    const popoutLeaf = appendLeaf(popoutDocument);
    picker.observe(popoutDocument);
    picker.start();
    dispatchPointerEvent(popoutLeaf, "pointermove");

    picker.unobserve(document);
    expect(popoutLeaf.classList.contains(TARGET_CLASS)).toBe(true);

    picker.unobserve(popoutDocument);
    expect(popoutLeaf.classList.contains(TARGET_CLASS)).toBe(false);
    expect(mainLeaf.classList.contains(TARGET_CLASS)).toBe(false);
  });

  it("uses the original element from a shadow-root click", () => {
    const leaf = appendLeaf();
    const host = leaf.appendChild(document.createElement("div"));
    const shadowRoot = host.attachShadow({ mode: "open" });
    const target = shadowRoot.appendChild(document.createElement("button"));
    const resolvePane = vi.fn((element: Element) => (element === target ? leaf : null));
    picker.destroy();
    picker = new PanePicker({
      timeoutMs: 30_000,
      resolvePane,
      onSelect,
      onInvalidSelection,
      onStop,
    });
    picker.observe(document);
    picker.start();

    dispatchMouseEvent(target, "click");

    expect(resolvePane).toHaveBeenCalledWith(target);
    expect(onSelect).toHaveBeenCalledWith(target);
    expect(onStop).toHaveBeenCalledWith("selected");
  });

  it("consumes Escape and clears the active hover", () => {
    const leaf = appendLeaf();
    const target = leaf.appendChild(document.createElement("button"));
    const handler = vi.fn();
    target.addEventListener("keydown", handler);
    picker.start();
    dispatchPointerEvent(target, "pointermove");
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("escape");
    expect(leaf.classList.contains(TARGET_CLASS)).toBe(false);
    expect(picker.active).toBe(false);
  });

  it("consumes Escape inside the picker cancel control", () => {
    const cancelControl = document.body.appendChild(document.createElement("button"));
    cancelControl.className = "scoped-hotkey-picker__cancel";
    const target = cancelControl.appendChild(document.createElement("span"));
    const handler = vi.fn();
    target.addEventListener("keydown", handler);
    picker.start();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("escape");
    expect(picker.active).toBe(false);
  });

  it("toggles between starting and command cancellation", () => {
    picker.toggle();

    expect(picker.active).toBe(true);
    expect(onStop).not.toHaveBeenCalled();

    picker.toggle();

    expect(picker.active).toBe(false);
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("command");
  });

  it("stops after the configured 30-second timeout", () => {
    const leaf = appendLeaf();
    picker.start();
    dispatchPointerEvent(leaf, "pointermove");

    vi.advanceTimersByTime(29_999);
    expect(picker.active).toBe(true);

    vi.advanceTimersByTime(1);

    expect(picker.active).toBe(false);
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("timeout");
    expect(leaf.classList.contains(TARGET_CLASS)).toBe(false);
  });

  it("does not intercept events inside the picker cancel control", () => {
    const cancelControl = document.body.appendChild(document.createElement("button"));
    cancelControl.className = "scoped-hotkey-picker__cancel";
    const target = cancelControl.appendChild(document.createElement("span"));
    const pointerHandler = vi.fn();
    const clickHandler = vi.fn(() => picker.cancel());
    target.addEventListener("pointerdown", pointerHandler);
    target.addEventListener("click", clickHandler);
    picker.start();

    const pointerEvent = dispatchPointerEvent(target, "pointerdown");
    const clickEvent = dispatchMouseEvent(target, "click");

    expect(pointerEvent.defaultPrevented).toBe(false);
    expect(clickEvent.defaultPrevented).toBe(false);
    expect(pointerHandler).toHaveBeenCalledOnce();
    expect(clickHandler).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onInvalidSelection).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("escape");
  });

  it("does not intercept pointer or click events inside a shadow-hosted cancel control", () => {
    const cancelHost = document.body.appendChild(document.createElement("div"));
    cancelHost.className = "scoped-hotkey-picker__cancel";
    const shadowRoot = cancelHost.attachShadow({ mode: "open" });
    const target = shadowRoot.appendChild(document.createElement("button"));
    const pointerHandler = vi.fn();
    const clickHandler = vi.fn(() => picker.cancel());
    target.addEventListener("pointerdown", pointerHandler);
    target.addEventListener("click", clickHandler);
    picker.start();

    const pointerEvent = dispatchPointerEvent(target, "pointerdown");
    const clickEvent = dispatchMouseEvent(target, "click");

    expect(pointerEvent.defaultPrevented).toBe(false);
    expect(clickEvent.defaultPrevented).toBe(false);
    expect(pointerHandler).toHaveBeenCalledOnce();
    expect(clickHandler).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onInvalidSelection).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("escape");
  });

  it("makes duplicate observe and unobserve calls idempotent", () => {
    const outside = document.body.appendChild(document.createElement("button"));
    const handler = vi.fn();
    outside.addEventListener("click", handler);
    picker.observe(document);
    picker.start();

    dispatchMouseEvent(outside, "click");

    expect(onInvalidSelection).toHaveBeenCalledOnce();
    picker.unobserve(document);
    picker.unobserve(document);

    const event = dispatchMouseEvent(outside, "click");

    expect(event.defaultPrevented).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    expect(onInvalidSelection).toHaveBeenCalledOnce();
    expect(picker.active).toBe(true);
  });

  it("destroys all observed document listeners and reports unload only while active", () => {
    const popoutDocument = document.implementation.createHTMLDocument("Pop-out");
    const popoutTarget = popoutDocument.body.appendChild(popoutDocument.createElement("button"));
    const handler = vi.fn();
    popoutTarget.addEventListener("click", handler);
    picker.observe(popoutDocument);
    picker.start();

    picker.destroy();
    picker.destroy();
    const event = dispatchMouseEvent(popoutTarget, "click");

    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("unload");
    expect(event.defaultPrevented).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    expect(picker.active).toBe(false);
  });

  it("does not report unload when destroyed while inactive", () => {
    picker.destroy();

    expect(onStop).not.toHaveBeenCalled();
  });

  it("completes terminal teardown before propagating an unload callback error", () => {
    picker.destroy();
    const error = new Error("unload failed");
    const throwingOnStop = vi.fn((reason: PanePickerStopReason) => {
      if (reason === "unload") throw error;
    });
    picker = new PanePicker({
      timeoutMs: 30_000,
      resolvePane: (element) => element.closest<HTMLElement>(".workspace-leaf"),
      onSelect,
      onInvalidSelection,
      onStop: throwingOnStop,
    });
    const leaf = appendLeaf();
    const target = leaf.appendChild(document.createElement("button"));
    const popoutDocument = document.implementation.createHTMLDocument("Pop-out");
    const removeMainListener = vi.spyOn(document, "removeEventListener");
    const removePopoutListener = vi.spyOn(popoutDocument, "removeEventListener");
    picker.observe(document);
    picker.observe(popoutDocument);
    picker.start();
    dispatchPointerEvent(target, "pointermove");

    expect(() => picker.destroy()).toThrow(error);

    expect(removeMainListener).toHaveBeenCalledTimes(7);
    expect(removePopoutListener).toHaveBeenCalledTimes(7);
    expect(leaf.classList.contains(TARGET_CLASS)).toBe(false);
    expect(picker.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(throwingOnStop).toHaveBeenCalledOnce();
    expect(throwingOnStop).toHaveBeenCalledWith("unload");

    const extraDocument = document.implementation.createHTMLDocument("Extra");
    const addExtraListener = vi.spyOn(extraDocument, "addEventListener");
    picker.observe(extraDocument);
    picker.start();
    expect(picker.active).toBe(false);
    picker.toggle();

    expect(addExtraListener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(throwingOnStop).toHaveBeenCalledOnce();
  });

  it("prevents an unload callback from reactivating or observing the picker", () => {
    picker.destroy();
    const extraDocument = document.implementation.createHTMLDocument("Extra");
    const addExtraListener = vi.spyOn(extraDocument, "addEventListener");
    const target = appendLeaf().appendChild(document.createElement("button"));
    const targetHandler = vi.fn();
    const callbackEvents: MouseEvent[] = [];
    target.addEventListener("click", targetHandler);
    const reentrantOnStop = vi.fn((reason: PanePickerStopReason) => {
      if (reason !== "unload") return;
      picker.start();
      picker.observe(extraDocument);
      callbackEvents.push(dispatchMouseEvent(target, "click"));
    });
    picker = new PanePicker({
      timeoutMs: 30_000,
      resolvePane: (element) => element.closest<HTMLElement>(".workspace-leaf"),
      onSelect,
      onInvalidSelection,
      onStop: reentrantOnStop,
    });
    picker.observe(document);
    picker.start();

    picker.destroy();

    expect(reentrantOnStop).toHaveBeenCalledOnce();
    expect(reentrantOnStop).toHaveBeenCalledWith("unload");
    expect(callbackEvents).toHaveLength(1);
    expect(callbackEvents[0]?.defaultPrevented).toBe(false);
    expect(targetHandler).toHaveBeenCalledOnce();
    expect(addExtraListener).not.toHaveBeenCalled();
    expect(picker.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    picker.start();
    picker.toggle();
    picker.observe(extraDocument);

    expect(reentrantOnStop).toHaveBeenCalledOnce();
    expect(addExtraListener).not.toHaveBeenCalled();
    expect(picker.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not duplicate timers, callbacks, or stale timeout effects", () => {
    const target = appendLeaf().appendChild(document.createElement("button"));
    picker.start();
    picker.start();

    expect(vi.getTimerCount()).toBe(1);
    dispatchMouseEvent(target, "click");

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledWith("selected");
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(60_000);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
  });
});
