# Context Inspector 初期実装記録

## 文書情報

| 項目           | 内容                                      |
| -------------- | ----------------------------------------- |
| 実施日         | 2026-08-23                                |
| 対象バージョン | `0.1.0`                                   |
| 対象フェーズ   | workspace context の調査機能              |
| 対象外         | hotkey の割り当て、ルール設定、dispatcher |

## 背景

Obsidian 標準の Hotkeys 設定には、VS Code の `when` 条件のように、
pane や view の状態で同じキーの処理を切り替える仕組みがない。

将来的には、同じ hotkey に対して次のような処理を実現したい。

- editor pane では editor 用コマンドを実行する
- right sidebar では sidebar 用コマンドを実行する
- view type や Markdown mode も条件として利用する

しかし、条件付き hotkey を実装する前に、実際の workspace から
どの値を取得できるかを確認する必要がある。

特に `WorkspaceLeaf` の一時的な ID は、永続的な設定値に適さない。
そのため、次の意味的な値を条件候補として採用する方針とした。

- workspace 上の配置を表す `area`
- `View.getViewType()` が返す `viewType`
- Markdown view の `mode`
- focus や入力状態を示す補助情報

## 今回の目的

今回のフェーズでは、hotkey を登録する機能は実装しない。

最初の実装対象を Context Inspector とし、ユーザーがクリックした
workspace pane の状態を確認できることを目的とした。

具体的な完了条件は次のとおり。

- コマンド実行後の次の1クリックを調査できる
- main、left sidebar、right sidebar を分類できる
- pop-out window を分類できる
- view type と Markdown mode を取得できる
- clicked element と focused element の状態を表示できる
- 将来の条件設定に使える値と DOM 由来の値を区別できる

## スコープ

### 実装したもの

- Obsidian plugin の基本ディレクトリ構成
- TypeScript と esbuild を利用するビルド環境
- Obsidian API の型定義と ESLint 設定
- `Inspect next click context` コマンド
- workspace area の分類
- view type、表示名、Markdown mode の取得
- focus と text input 状態の取得
- 調査結果を表示する modal
- main window と pop-out window の click 監視
- 開発手順とプロジェクト構成を説明する README

### 実装しなかったもの

- hotkey の登録または上書き
- context rule の保存
- 設定画面
- 複数ルールの優先順位
- 条件に一致したコマンドを実行する dispatcher
- キー競合の検出

## プロジェクト構成

構成は Obsidian の
[公式 Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
を基準にした。

```text
.
├── design/
│   └── context-inspector-initial-implementation.md
├── src/
│   ├── context.ts
│   ├── context.test.ts
│   ├── context-modal.ts
│   ├── obsidian.mock.ts
│   └── main.ts
├── esbuild.config.mjs
├── eslint.config.mjs
├── manifest.json
├── package.json
├── styles.css
├── tsconfig.json
├── vitest.config.mjs
├── version-bump.mjs
└── versions.json
```

各ファイルの責務は次のとおり。

| ファイル               | 責務                                   |
| ---------------------- | -------------------------------------- |
| `src/main.ts`          | plugin lifecycle、コマンド、click 監視 |
| `src/context.ts`       | leaf の特定、area 分類、context の収集 |
| `src/context.test.ts`  | context 収集と条件出力の回帰テスト     |
| `src/context-modal.ts` | 調査結果の表示                         |
| `styles.css`           | modal のレイアウト                     |
| `manifest.json`        | Obsidian plugin のメタデータ           |
| `esbuild.config.mjs`   | `main.js` の生成                       |

## 依存関係

実行時に Obsidian が提供する API 以外は bundle 内へ取り込む。
開発に必要な依存関係は `devDependencies` として管理する。

| 依存関係                   | 用途                           |
| -------------------------- | ------------------------------ |
| `obsidian`                 | Obsidian API の型定義          |
| `typescript`               | 型検査                         |
| `esbuild`                  | `src/main.ts` の bundle        |
| `eslint`                   | 静的解析                       |
| `eslint-plugin-obsidianmd` | Obsidian plugin 向け lint rule |
| `globals`                  | browser global の ESLint 設定  |
| `happy-dom`                | DOM を利用するテスト環境       |
| `vitest`                   | 回帰テスト                     |
| `@types/node`              | build script の Node.js 型定義 |

依存関係の解決結果は `package-lock.json` に固定した。

## 対応方法

### One-shot Inspector

常時 modal を表示したり、すべての click で通知したりせず、
コマンド実行後の次の1クリックだけを調査する方式にした。

登録したコマンドは次のとおり。

```text
Scoped Hotkey: Inspect next click context
```

処理の流れは次のとおり。

1. コマンドを実行する
2. Inspector を待機状態にする
3. 次の click で待機状態を解除する
4. click target から workspace leaf を特定する
5. leaf、view、focus の情報を収集する
6. modal に結果を表示する

待機開始は `setTimeout(..., 0)` で次の event loop へ送る。
これにより、Command Palette でコマンドを選択した click 自体を
調査対象として取得しないようにしている。

### Click を capture phase で取得する理由

当初は bubble phase で click を取得していた。

実機確認では、sidebar の view が click 処理中に差し替わる場合があり、
bubble phase まで待つと元の `containerEl` を leaf から特定できなかった。

そのため、listener は capture phase で登録した。

```ts
document.addEventListener("click", this.handleClick, true);
```

click より前の pointer 処理で focus は更新されるため、
capture phase でも focused element を取得できる。

### Active leaf の保持

非推奨の `Workspace.activeLeaf` は直接参照しない。

代わりに `active-leaf-change` event で渡された leaf を保持し、
click target や focused element から leaf を特定できない場合の
fallback として利用する。

leaf の解決順序は次のとおり。

1. clicked element を含む leaf
2. focused element を含む leaf
3. `active-leaf-change` で保持した同一 document の leaf
4. leaf なし

実際にどの経路で leaf を特定したかは `leafSource` として表示する。

### Workspace area の分類

area は leaf の配置を意味する値として、次の値へ分類する。

| area            | 判定方法                                  |
| --------------- | ----------------------------------------- |
| `main`          | `leaf.getRoot() === workspace.rootSplit`  |
| `left-sidebar`  | `leaf.getRoot() === workspace.leftSplit`  |
| `right-sidebar` | `leaf.getRoot() === workspace.rightSplit` |
| `popout-window` | container が `WorkspaceWindow`            |
| `unknown`       | 対応する leaf を特定できない              |

個別 leaf の ID は条件候補に含めない。

### View context の取得

leaf から次の情報を取得する。

- `leaf.view.getViewType()` による view type
- `leaf.view.getDisplayText()` による確認用の表示名
- `MarkdownView.getMode()` による `source` または `preview`

plugin ID の逆引きは行わない。

独自 view を持つ plugin は `viewType` で区別できる。
表示名はファイル名などで変わるため、条件には使用せず確認用とする。

modal には安定した条件候補を YAML 形式で表示する。

```yaml
area: right-sidebar
viewType: "example-view"
```

### DOM と focus の調査

clicked element と focused element について、次の情報を表示する。

- tag name
- input type
- role
- class names
- `contenteditable` の状態
- text input と判定されたか

text input は、`textarea`、テキスト入力可能な `input`、
`role="textbox"`、`contenteditable` をもとに判定する。

DOM class や属性は Obsidian または他 plugin の更新で変わる可能性がある。
そのため modal では、安定した条件候補とは別の診断情報として表示する。

### Pop-out window の監視

pop-out window は main window と異なる `Document` を持つ。
main document だけを監視すると pop-out window の click を取得できない。

次の方法で監視対象を管理する。

- plugin 読み込み時に既存 leaf の document を列挙する
- `window-open` event で新しい document を追加する
- `window-close` event で listener を削除する
- plugin unload 時にすべての listener を削除する

同じ document への listener の重複登録は `Set<Document>` で防ぐ。

### 表示方法

調査結果は Obsidian の `Modal` を利用して表示する。

表示内容は次の3セクションに分けた。

1. 安定した条件候補
2. view の確認情報
3. DOM と focus の診断情報

clicked element と focused element は、十分な画面幅がある場合に
2列で表示する。狭い画面では1列へ切り替える。

## 実機確認で判明した問題と修正

right sidebar の click を bubble phase で取得した際、
対象 view が click 処理中に切り替わり、area が `unknown` になった。

原因は、Inspector が動く時点で leaf の `view.containerEl` が
別の element へ差し替わっていたことだった。

listener を capture phase へ変更した後は、差し替え前の target から
`right-sidebar` と custom view type を取得できた。

## 検証内容

### 静的な検証

次のコマンドが成功することを確認した。

```sh
npm run build
npm run lint
npm test
markdownlint-cli2 README.md
```

`npm run build` では、TypeScript の型検査と production bundle の
生成を行っている。

### Obsidian 上の検証

Obsidian 1.13.7 の開発用 Vault へ plugin を読み込み、
次の分類を確認した。

| クリック位置     | area            | view type の例     |
| ---------------- | --------------- | ------------------ |
| Markdown editor  | `main`          | `markdown`         |
| left sidebar     | `left-sidebar`  | core sidebar view  |
| right sidebar    | `right-sidebar` | custom plugin view |
| 一時的な pop-out | `popout-window` | `empty`            |

合わせて次を確認した。

- plugin reload が成功する
- Inspector command が登録される
- Markdown source mode を取得できる
- editor の `contenteditable` と text input を検出できる
- pop-out window を閉じた後に listener が解除される
- Obsidian の captured errors が空である
- console error がない

実機確認用の pop-out window は、確認後に閉じた。
Vault 内のノート内容は変更していない。

## 現在の制約

- DOM class は安定した公開 API ではない
- workspace pane 外の click では `unknown` になる場合がある
- Inspector の結果を設定へ保存する機能はない
- 条件候補を clipboard へコピーする機能はない
- hotkey の登録、競合解決、command 実行は行わない
- pop-out window は desktop 版でのみ利用できる

## 次のフェーズ

次の実装では、Inspector で確認した値を入力として、
context rule と dispatcher の設計を行う。

検討項目は次のとおり。

- rule schema と設定ファイル形式
- `area`、`viewType`、`mode`、focus 条件の表現
- 複数ルールの優先順位
- 条件に一致しない場合の fallback
- 同じ hotkey から実行する dispatcher command
- 設定画面と validation
- DOM 条件を利用する場合の互換性表示

このフェーズが完了するまでは、実際のキー割り当ては追加しない。
