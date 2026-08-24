# Scoped Hotkey

Scoped Hotkey is an Obsidian plugin for inspecting the workspace context that
future scoped hotkey rules can use.

The primary **Inspect current context** command immediately reports the active
workspace and keyboard-focus context. It ignores command-palette and inspector
modal focus so the result follows the same context boundary intended for future
scoped-hotkey dispatch.

Use **Select pane to inspect** or the result modal's **Inspect another pane**
action to inspect an inactive pane. While the picker is active, the plugin:

- outlines selectable workspace panes
- consumes the selection click without activating the original UI
- supports Cancel, Escape, command-toggle cancellation, and a 30-second timeout

The result shows:

- workspace area (`main`, `left-sidebar`, `right-sidebar`, or `popout-window`)
- view type and display label
- Markdown mode (`source` or `preview`)
- `View type`, `View type and mode`, and `Exact location` scope presets
- a plain-language description of where the generated condition matches
- a one-click copy action with success or failure feedback
- focused and selected DOM details under collapsed advanced diagnostics

Hotkey assignment and dispatch are intentionally outside the scope of this phase.

## Development

Install the dependencies and build the plugin:

```sh
npm install
npm run build
```

Use `npm run dev` to rebuild when a source file changes. The loadable Obsidian
plugin consists of `manifest.json`, `main.js`, and `styles.css`.
Run `npm test` to execute the workspace context regression tests.

## Project structure

```text
src/
  context.ts        Workspace context collection and classification
  context.test.ts   Workspace context regression tests
  context-modal.ts  Inspector result UI
  context-modal.test.ts
                     Inspector result UI tests
  pane-picker.ts    Safe one-shot pane selection state
  pane-picker.test.ts
                     Pane selection and event-safety tests
  main.ts           Plugin lifecycle and inspector commands
  main.test.ts      Command and lifecycle integration tests
manifest.json       Obsidian plugin metadata
styles.css          Inspector modal styles
```
