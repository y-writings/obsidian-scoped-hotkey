# Scoped Hotkey

Scoped Hotkey is an Obsidian plugin for inspecting the workspace context that
future scoped hotkey rules can use.

The current phase provides the **Inspect next click context** command. Run the
command, click a workspace pane, and the plugin shows:

- workspace area (`main`, `left-sidebar`, `right-sidebar`, or `popout-window`)
- view type and display label
- Markdown mode (`source` or `preview`)
- clicked and focused DOM element diagnostics
- a minimal YAML condition using stable context values

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
  main.ts           Plugin lifecycle and one-shot click capture
manifest.json       Obsidian plugin metadata
styles.css          Inspector modal styles
```
