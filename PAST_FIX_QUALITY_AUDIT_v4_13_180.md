# v4.13.180 過去修正品質監査

## 目的

v4.13.178-179で確立した「個別事例を増やすのではなく、独立oracle＋性質＋Mutation＋実機E2Eで故障検出能力を確認する」考え方を、過去の主要修正領域へ横展開する。

## 監査結果

| 領域 | 現状 | 品質根拠 | 残課題 | 判定 |
|---|---|---|---|---|
| 蔵書フィルター | 独立oracle＋Mutation＋実機E2E | v4.13.179 | なし（個別事例追加を原則禁止） | A |
| 作者同一性 | 構造化authorNames・典拠ID・性質テスト＋Mutation | DEV/E2E/Mutation | 典拠取得不能時の境界母集団を継続拡張 | A- |
| 出版社同一性 | 表示値／判定キー分離＋保守的正規化 | identity E2E＋static | 異名異社の誤統合を継続Mutation対象 | A- |
| シリーズ分類 | seriesKey／表示ラベル分離＋固定境界サンプル | series E2E＋static | 固定実例中心。独立oracle＋Mutationをフィルター同等レベルへ拡張する | B |
| 登録経路 | 共通prepare/commit経路＋保存前後整合性＋rollback | static/E2E | prepare/commit内部の意図的欠陥検出をさらに強化 | B+ |
| ISBN/API同一性 | Provider Adapter・timeout/failover・ISBN不一致防止 | API E2E＋static | Provider結果の信頼度判定をMutationで横断する | B+ |
| 検索 | single-flight・generation・timeout/failover・計測 | E2E＋static | stale responseを直接壊すMutationを追加 | B |
| 永続化／バックアップ | reload・schema/key validation・rollback・round-trip | E2E＋static | 主要永続ドメインのMutationを追加 | B+ |
| カレンダー／ICS | rollback・一時filter・date-only・escape・stable UID | E2E＋static | 発売日意味モデルの独立oracleを発売日エンジン着手前に強化 | B+ |
| 設定 | 全項目round-trip＋failure rollback | E2E＋static | 設定項目追加時の自動網羅性を強化 | B+ |
| UI表示／レイアウト | 全タブ・3幅・3フォント・overflow/clipping | Browser E2E | 意図的CSS破壊Mutationを主要レイアウトへ拡張 | B+ |
| API管理 | Adapter/capability/schema/field confidence/failover | API E2E＋static | 信頼度境界のMutation拡張 | B |

## 今回の結論

「テストがある」だけでは完了としない。A/B判定は、次の4条件を満たすかで決める。

1. 本番判定ロジックとは独立した期待値を持つ。
2. 正常・境界・欠損・不正・状態遷移を扱う。
3. 意図的欠陥を注入してGateがFAILすることを確認する。
4. 少なくとも1本の実ユーザー操作E2Eで、保存・再描画まで確認する。

B以下の領域は、次の大きな機能追加前に品質基盤を強化する対象とする。

## 個別テスト追加の制限

新しい作品・出版社・APIを理由に固定テストを追加する前に、既存の不変条件・合成母集団・Mutationで説明できるかを確認する。説明できない場合のみ、新しい不変条件を定義してからテストを追加する。
