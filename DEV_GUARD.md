# Book Tracker — 開発ガード / 回帰チェック v4.10.0

## 目的

機能追加によって既存仕様を壊したり、過去に発生したバグを再発させたりする前に検出する。

## 3層構成

1. **仕様コメント**: `index.html` の `[BOOK TRACKER / SPEC GUARD]` に不変条件を記載。
2. **実行時ガード**: 開発版の設定から「仕様・回帰チェック」を実行できる。起動時にも静かに検査する。
3. **静的ガード**: `dev_guard.js` がHTMLを解析し、構文・重複・危険な直接操作・チェックボックス等を検査する。

## 実行時チェック

- 蔵書の purchaseStatus が全件 purchased
- purchaseStatus が許可された値のみ
- 検索結果の重複がない
- 全選択が checkbox
- 表示カードの蔵書バッジと books の状態が一致
- 正規登録関数が存在する

## 静的チェック

- JavaScript構文チェック
- 重複ID
- 重複した名前付きfunction
- `localStorage.clear()` の存在
- `getMeta(...).purchaseStatus =` の直接代入（正規化関数を除く）
- `.selectAll` / `.similarAll` に checkbox 指定があること
- `DEMO_ENABLED` と APP_VERSION の存在
- SPECコメントの存在
- 正規登録関数 `window.addBook` / `window.bulkAdd` の存在

## 変更時ルール

新機能を追加するときは、まず「どの既存不変条件に影響するか」を確認する。
状態を追加・変更する場合は状態遷移表を更新し、回帰チェックを1件以上追加する。
UIを変更する場合は「保存状態と表示状態が一致するか」を確認する。

## 変更履歴

- v4.10.0: 初版。仕様コメント、実行時仕様ガード、静的ガード、頻発バグ回帰ルールを導入。
