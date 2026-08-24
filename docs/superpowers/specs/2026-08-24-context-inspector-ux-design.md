# Context Inspector UX redesign

## Goal

Make the context inspector a trustworthy path for deriving scoped-hotkey conditions. The
primary workflow must inspect the same active and focused workspace context that a future
hotkey dispatcher will evaluate. Pointer-based inspection remains available only as an
explicit, safe way to inspect another pane.

This design addresses UX-001 through UX-007 in `ISSUE.md`. Hotkey assignment, rule
persistence, and dispatch remain outside this change.

## Chosen approach

The plugin will provide two commands:

- `Inspect current context` immediately inspects the active workspace context. This is the
  primary workflow and is fully keyboard operable.
- The existing `inspect-next-click-context` command ID is retained to preserve configured
  Obsidian hotkeys, but its displayed name becomes `Select pane to inspect`. It starts a safe
  pane picker and is also available from the result modal as `Inspect another pane`.

The alternatives were to remove pointer inspection or to keep pointer inspection as the
primary workflow. Removing it would leave no efficient way to inspect an inactive pane.
Keeping it primary would preserve the mismatch between a mouse hit target and the context at
the instant a hotkey executes. The two-command model keeps those meanings explicit.

## Context resolution

`src/context.ts` will expose separate entry points for current and selected contexts. Both
entry points will use one internal function to derive area, view type, display label, Markdown
mode, and diagnostics from a resolved `WorkspaceLeaf`.

### Current context

The current-context resolver will use this order:

1. The deepest focused element that belongs to a workspace leaf.
2. The leaf supplied by the latest `active-leaf-change` event, limited to the relevant
   document.
3. No result.

`main.ts` will remember the last focused element that belonged to a workspace leaf in each
observed document. When the command palette or another Obsidian modal owns focus at command
execution time, the resolver receives that remembered workspace focus instead of the modal
input. Plugin load will initialize the active-leaf fallback with
`workspace.getMostRecentLeaf()`; focus inside a sidebar still wins because it resolves
directly from the focused element.

This current-context entry point is the API that the future dispatcher must call. It does not
accept a pointer target, so mouse hit testing cannot silently affect hotkey evaluation.

### Selected context

The selected-context resolver accepts one selected DOM element and resolves only the leaf
that contains it. It never falls back to the focused or active leaf. A selection outside a
leaf returns no context and leaves the picker active.

The returned context identifies whether it came from the current workspace or a selected
pane. For a selected pane, the modal explains that the generated condition describes the
selected pane snapshot and is not the current keyboard-focus context. If the selected and
focused leaves differ, that difference is summarized before the condition.

An `unknown` area can remain visible in diagnostics, but condition generation never includes
it and the exact-location preset is unavailable when the area cannot be classified.

## Safe pane picker

The picker has explicit inactive, waiting, selected, canceled, and timed-out transitions.
Only the waiting state intercepts user input.

While waiting, the plugin will:

- Show a persistent Obsidian notice with the instruction, timeout, and a `Cancel` button.
- Outline the workspace leaf under the pointer.
- Cancel on `Escape`.
- Cancel when `Select pane to inspect` is invoked again.
- Cancel automatically after 30 seconds.
- Consume pointer and mouse events used for selection with `preventDefault()`,
  `stopPropagation()`, and `stopImmediatePropagation()`.

The cancel button is recognized as picker UI and is not intercepted by the picker. A click
outside a workspace leaf is still consumed, updates the persistent instruction with a short
error, and keeps the picker waiting. A valid leaf selection clears the timeout, notice,
outline, and waiting state before opening the result modal. Normal pointer and keyboard
behavior is unchanged outside the waiting state.

Observed main and pop-out documents receive the same focus, keyboard, pointer, and click
listeners. Closing a pop-out removes its listeners and any highlight in that document.
Plugin unload cancels the session and removes all listeners.

## Condition scope

The modal will replace the all-fields output with explicit presets. Every generated line is
an AND condition.

The presets are:

- `View type` is the default and includes only `viewType`. It matches that view regardless
  of workspace area and Markdown mode.
- `View type and mode` is available for Markdown views and adds `mode`.
- `Exact location` adds every available stable value, including `area`; it is unavailable
  when the area is `unknown`.

The default explanation states that view type is recommended because pane placement and
Markdown mode can change during normal use. The generated YAML and a human-readable match
summary update together when the preset changes. Detected values remain visible as inputs,
not as a claim that every value belongs in the final condition.

Condition formatting will remain a pure function so the eventual settings UI and dispatcher
can consume the same field semantics. Values that can be interpreted as YAML scalars are
quoted safely.

## Result modal

The initial information order will be:

1. A plain-language description of the inspected current context or selected pane.
2. A warning when selected and focused panes differ.
3. The scope preset, recommendation reason, and plain-language match range.
4. The generated condition.
5. `Copy condition` and `Inspect another pane` actions.
6. Collapsed `Advanced diagnostics`.

`Copy condition` writes the exact visible condition to the Clipboard API. Success produces a
short `Condition copied` notice. Failure leaves the modal open and shows a failure notice;
manual selection of the code remains possible. `Inspect another pane` closes the modal and
starts the picker on the next event-loop turn so its button click cannot become the selected
target.

The diagnostics disclosure contains display label, context source, leaf source, focused
element data, and selected-element data when present. DOM classes remain diagnostic-only and
retain the existing warning that Obsidian or plugin updates can change them.

Native buttons, select controls, and `details`/`summary` disclosure preserve keyboard
behavior without custom key handlers. CSS continues to use Obsidian variables, constrains
long values with wrapping, and keeps the summary, scope, condition, and actions in the first
viewport at a 768 px window height. The existing narrow-width single-column diagnostic
fallback remains.

## Error handling

- If no current workspace leaf can be resolved, show a short notice and do not open an empty
  modal.
- If a picker event has no DOM element or is outside a leaf, keep waiting and explain what to
  select.
- If the picker times out, clear all picker UI and report that selection timed out.
- If clipboard writing rejects, report the failure without changing the generated condition.
- If a pop-out closes during selection, remove its listeners and continue waiting in other
  observed documents.

## Testing

Pure context tests will cover:

- Focused main-editor context winning over another active leaf.
- Focused inputs in left and right sidebars.
- Active-leaf fallback when the command palette or inspector modal owns DOM focus.
- Current context never using a selected element.
- Selected context resolving only its containing leaf and rejecting ribbon, title bar,
  status bar, and modal elements.
- Main, sidebars, pop-out, unknown areas, Markdown modes, and shadow-root focus.
- Preset fields, natural-language summaries, YAML quoting, and exclusion of `area: unknown`.

Picker tests will cover:

- Link, button, checkbox, and tab click handlers and default actions not running during
  selection.
- Normal clicks remaining untouched while inactive.
- Valid selection, invalid selection continuation, `Escape`, command-toggle cancellation,
  timeout, and unload cleanup.
- Hover outline changes and cleanup.

Modal tests will cover:

- Information order and diagnostics being collapsed by default.
- Scope changes updating both summary and condition.
- Clipboard success and failure feedback.
- Primary actions being native keyboard-focusable controls.
- Difference messaging for selected versus focused panes.

Repository verification will run `npm test`, `npm run lint`, and `npm run build`. Generated
`main.js` is committed because it is one of the loadable plugin artifacts already tracked by
the repository.

## Documentation

`README.md` will describe `Inspect current context` as the primary command, explain the safe
pane picker, list scope presets and copy behavior, and keep hotkey assignment and dispatch
explicitly out of scope.
