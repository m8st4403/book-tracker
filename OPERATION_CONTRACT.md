# 本棚スケジュール 操作契約 v4.13.230

## 目的
「ボタンが存在する」ことではなく、ユーザーが到達できる機能経路が配布物に存在し、重要な故障を自動検出できることを保証する。

## 操作対象
button、input/select/textarea、checkbox/radio/color/file等の入力、link/summary/details、動的生成UI、タブ・フィルター・並べ替え・表示切替、ダイアログ、非同期開始・再試行・キャンセル、登録・削除・状態変更・保存・復元、Clipboard/export/import等の外部境界。

## 操作契約の層
1. 存在 — UI要素または機能入口が存在する
2. 経路 — handler / delegated handler / data-driven handler / native actionへ到達する
3. 状態 — 操作後に期待する状態へ遷移する
4. データ — 期待する値・集合・順序へ変化する
5. 保存 — 保存対象なら永続化される
6. 再読込 — 再表示・再起動相当後も意味が維持される
7. 連携 — 他タブ・カレンダー・Home等へ正しく投影される
8. 異常復旧 — timeout / 保存失敗 / 空入力 / 連打等で破壊的状態を残さない

## 自動検査の原則
- 静的棚卸しだけではPASSにしない。
- Browser E2Eで代表的な状態変化を独立Oracleと照合する。
- Mutationで経路消失・状態更新漏れ・predicate破壊・保存漏れ等を注入し、GateがFAILすることを確認する。
- 動的UIは初期HTMLだけでなく実行後DOMも棚卸しする。
- destructive operationは無条件に自動実行せず、状態復元可能なtest doubleまたはMutationで契約を検証する。
- 新機能追加時は操作契約を先に追加し、実装後に既存Gateと同時実行する。

## 配布判定
未分類の操作要素、操作経路のない要素、重要機能の状態変化を検証できない機能はRelease Gateを通過させない。
