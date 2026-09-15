# 本棚アプリ ルール／検証フロー抜け漏れ監査 v4.13.45

## 目的

既存の「ルール→検証→実装→外部Release Gate→ZIP再展開」体系が、機能追加だけでなく、本棚アプリとして本来必要な保存・復元・状態整合性まで検証できているかを監査する。

## 監査結果

### A. 既存ルールに対して検証が弱かった領域

| ID | 領域 | 現状 | 判断 | 今回の対応 |
|---|---|---|---|---|
| GAP-001 | 永続化 | ロジック中心で、実際のreload後確認が限定的 | HIGH | 次段階のE2E契約として明文化（未昇格） |
| GAP-002 | 複数storageの整合性 | books/meta/calendar/purchaseGroupsを個別保存 | HIGH | 複数保存を失敗時ロールバックする実装へ強化 |
| GAP-003 | バックアップ復元 | JSON構造の最低限確認のみ | HIGH | schemaVersion=3を復元時に検証。完全なround-tripは次段階 |
| GAP-004 | バージョン整合 | package/READMEとアプリ内部versionの一致を強制していなかった | HIGH | version consistencyをRelease Gateへ追加対象化。v4.13.45で内部versionを統一 |
| GAP-005 | 設定 | 各設定項目の保存→reload→画面反映が網羅されていない | MEDIUM | 設定永続化E2Eを次のゲート候補に昇格 |
| GAP-006 | カレンダー | 月移動は確認するが、追加イベントの保存→reloadが弱い | MEDIUM | calendarExtras永続化E2Eを次のゲート候補に昇格 |
| GAP-007 | 購入総額 | 保存ロジックはあるが保存失敗時の原子性が弱かった | HIGH | setPurchaseGroupForBooksを失敗時ロールバックへ変更 |
| GAP-008 | 状態変更 | 複数storageにまたがる操作のatomicity契約が不足 | HIGH | 登録・一括登録・一括削除のロールバックを強化 |
| GAP-009 | 通知 | permission/state/time-windowの実運用検証が不足 | MEDIUM | 通知ルールを独立契約として次段階へ |
| GAP-010 | ICS | 表示条件はあるが生成内容の意味検証が弱い | MEDIUM | ICS内容契約を次段階へ |

## 本来必要な検証フロー

機能ごとに最低限、次の順序を固定する。

1. **仕様不変条件** — 何が正しい状態かを定義
2. **入力境界** — 空値、上限、形式不正、重複、未来日など
3. **状態遷移** — 操作前→操作中→成功／失敗後
4. **保存原子性** — 複数storageを変更する場合、途中失敗で部分状態を残さない
5. **reload復元** — ページ再読込／復帰後に同じ意味を維持
6. **関連画面整合** — Home/Library/Search/Calendar/Detail等の表示が一致
7. **バックアップ／復元** — export→import→reloadで意味が一致
8. **UI実寸** — 表示・clip・overflow・viewport
9. **Mutation** — 重要な防止条件を意図的に壊してGateがFAILすること
10. **ZIP再展開** — 配布物そのものを最終検査

## 「存在確認だけでは不足」の代表例

- 設定値がlocalStorageに存在するだけでなく、reload後にUIへ反映されること
- 蔵書がlocalStorageに保存されるだけでなく、meta/calendar/purchaseGroupsとの整合が保たれること
- バックアップJSONが読めるだけでなく、復元後の意味が元データと一致すること
- API Adapterが存在するだけでなく、失敗時に次Providerへ移り、確定済み情報を壊さないこと

## 今後の運用ルール

新機能をCURRENTへ昇格する際は、上記10段階のうち適用対象を明示し、該当しない層は「なぜ不要か」を記録する。

## v4.13.45 P0 実施結果

- GAP-001 永続化：`E2E-PERSIST-001` で books / meta / calendarExtras / purchaseGroups / settings / seriesView を同一保存バイト列から再構築し、意味が維持されることを確認。
- GAP-003 バックアップ：`E2E-PERSIST-003/004` で export/import のラウンドトリップ、schemaVersion、許可キーを確認。
- GAP-002/007/008 原子性：`E2E-PERSIST-005` および既存 `E2E-PERSIST-002` で途中保存失敗時のrollbackを確認。
- GAP-004 バージョン整合：package / APP_VERSION / DEV_GUARD_VERSION を4.13.45へ統一し、STATIC-018でGate化。
- 検証基盤そのものの抜けも1件確認：ブラウザ用storage shimの単純な文字列置換が `d.localStorage` まで変換してしまい、バックアップ検証を誤ってFAILさせていた。置換対象を「ドット直後ではないlocalStorage識別子」に限定し、テスト環境由来の偽FAILを防止した。

### 残課題

完全な実ブラウザの永続localStorageを使ったプロセス再起動試験は、現行の配布物Release Gate環境ではなく、別の実機／実ブラウザ環境で行う。現行Gateでは保存バイト列→起動読込関数の再構築を自動検証する。
