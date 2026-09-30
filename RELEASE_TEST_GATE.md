# Release Test Gate v4.13.202

## 正本

品質契約の正本は `QUALITY_CONTRACT.md`。この文書は配布判定の手順だけを定義する。

## Gate 1 — Static

- HTML/JavaScript構文
- DOM ID重複
- 6タブ
- 現行バージョン一致
- 共通登録経路
- 品質契約の存在
- Roadmap契約の存在

## Gate 2 — Logic / Property

- ISBN canonical化
- 書誌同一性
- シリーズ分類
- 巻数不変条件
- 全フィルター
- ソート
- 登録原子性
- rollback
- 検索競合
- API trust / fallback
- 書誌情報採用判定（Evidence / field policy / provider conflict）
- 計測モデル

期待値は可能な限り独立Oracleで生成する。

## Gate 3 — Integration / Persistence

- 登録→保存→再表示
- 設定保存→再読込
- カレンダー保存失敗rollback
- backup export/import
- 状態変更と表示の一致

## Gate 4 — Browser E2E

配布対象の `index.html` をChromiumで実際に開き、6タブ、代表操作、状態遷移、検索・登録・シリーズ・フィルター・カレンダー・設定を確認する。

## Gate 5 — Generic UI Invariants

過去のバグ固有セレクタだけに依存せず、画面全体について以下を検査する。

- 意図しない水平overflow
- viewport外への脱落
- 文字clip
- 小/中/大フォント
- 375/390/414px相当
- 主要操作要素の存在
- 状態と表示の一致

## Gate 6 — Mutation / Fault Injection

重要な品質契約を意図的に壊し、必ずFAILすることを確認する。

現行代表：

- UI overflow
- API trust
- Provider間矛盾の自動採用禁止
- 定価の税込根拠必須
- フィルター各predicate
- 作者同一性
- 登録atomicity / rollback / duplicate / persistence
- user-wait計測
- series coalescing
- series display sort
- volume invariant

## Gate 7 — Artifact

`npm run test:release` で以下を確認する。

- GitHubアップロードフォルダに現行実装と品質実行に必要なファイルだけがある
- CHANGELOG / 過去監査 / 旧マトリクス / 操作カタログが混入していない
- package / APP_VERSION / README / SPEC / 設定表示が一致
- `QUALITY_CONTRACT.md` が含まれる
- `アップロード不要` に現行CHANGELOGがある
- ZIP再展開後も同じ構造を保つ

## Gate 8 — Roadmap

未実装機能は `ROADMAP_TEST_MATRIX.md` に先に契約を定義する。実装時にCurrentへ昇格し、既存Gateへ接続する。

## Fail-fast

1件でもFAIL、または未監査が残る場合は配布不可。

## ユーザー実機テスト

自動Gateで検証できるものをユーザーへ繰り返し依頼しない。実機確認は、代表的なE2E・実API・UI表示・保存/再起動など、自動化だけでは代替できない確認へ限定する。


## v4.13.202追加

- Homeの蔵書統計と蔵書状態の独立Oracle
- Home表示更新を壊すMutationの検出
- Home→蔵書のクロスビュー整合性


## v4.13.202追加ゲート
- 10系統（ISBN/タイトル/作者/出版社/発売日/定価/シリーズ/巻数/読書状態/お気に入り等）を1つの横断E2E契約で検査する。
- 各系統の既存Mutationと組み合わせ、重要predicate/identity/sort/state projectionの故障検出能力を維持する。
- 「個別作品を手で触った結果」だけでは10系統のPASSとは認めない。

## v4.13.202 横断操作経路監査
- 配布HTMLに存在する全buttonを静的に棚卸しし、操作経路（inline handler / delegated handler / data-driven handler / disabled state）を検査する。
- 主要タブだけでなく、動的生成ボタン・診断・設定・検索・カレンダーを含む全UI操作を対象とする。
- 操作経路を1件意図的に除去するMutationを必ずFAIL検出する。
- ユーザー実機で偶然発見することを前提にせず、自動Gateで「ボタンは存在するが操作経路がない」状態を配布前に拒否する。

## v4.13.202 操作契約Gate

- `OPERATION_CONTRACT.md` を品質契約の一部として必須化する。
- button以外を含む全interactive controlを静的・実行時に棚卸しする。
- 操作経路だけでなく、状態・データ・保存・再読込・連携・異常復旧の検査契約を要求する。
- 操作経路を除去したbuttonだけでなく、入力系controlの契約を破壊したMutationも必ずFAIL検出する。
