# 本棚スケジュール 機能契約台帳 / v4.13.208

## 目的

この台帳は、UI部品の数ではなく「ユーザーが利用できる機能単位」を配布前に横断検査するための正本である。

新機能・既存機能の変更は、実装前にこの台帳へ機能契約を追加または更新する。実装後にテストを後付けする方式は禁止する。

## 共通完遂層

すべてのCURRENT機能は、該当する層を明示する。

1. 入口：ユーザーが機能へ到達できる
2. 操作：入力・選択・実行が受理される
3. 状態：期待する状態へ遷移する
4. データ：期待する値・集合・順序になる
5. 永続化：保存対象なら保存される
6. 復元：再表示・再起動・バックアップ復元後も意味が維持される
7. 投影：別タブ・関連機能へ必要な値が伝播する
8. 失敗復旧：失敗・取消・連打・競合後も破壊的状態を残さない

## CURRENT 機能契約

| ID | 領域 | 入口/操作 | 状態/データ | 永続化/復元 | 投影/連携 | 失敗復旧 | 主な検証 |
|---|---|---|---|---|---|---|---|
| FEAT-NAV | 6タブ・画面遷移 | タブ/戻る | 表示タブが一意 | 不要 | 全タブ | 不正状態を残さない | E2E + Mutation |
| FEAT-SCAN | ISBNスキャン | スキャン開始/停止/読取/取消 | 読取ISBN集合・重複排除・最大30件 | 登録前データのみ | 本を追加/登録準備 | 権限拒否・非対応・取消・読取失敗 | E2E + Mutation + Static |
| FEAT-BACKUP | バックアップ/復元 | export/import/確認/取消 | schema/key検証済みデータ | atomic restore/rollback | 全永続ドメイン | 不正JSON・保存失敗・取消 | E2E + Mutation |
| FEAT-DETAIL | 書籍詳細・書誌編集 | 詳細/定価/読了/お気に入り/評価/メモ/通知 | 対象ISBNだけを変更 | 保存/再読込 | 蔵書/Home/カレンダー | 保存失敗・対象消失・取消 | E2E + Mutation |
| FEAT-PURCHASE | 購入・セット情報 | 購入総額/セット/状態 | 金額・対象冊数・状態の整合 | 保存/再読込 | Home/蔵書/詳細 | atomicity/rollback/重複 | Property + Mutation + E2E |
| FEAT-REG | 蔵書登録 | 単冊/一括/ISBN/検索/詳細/カレンダー | 期待ISBN集合・blank禁止 | 保存/再読込 | Home/蔵書/カレンダー | atomic/rollback/重複 | Property + Mutation + E2E |
| FEAT-LIB | 蔵書管理 | 検索/フィルター/並替え/シリーズ/状態変更 | 独立oracleと一致 | 保存/再読込 | Home | reset/境界/連打 | Property + Mutation + E2E |
| FEAT-SEARCH | 書籍検索 | ISBN/キーワード/作者/関連 | stale結果禁止・sort oracle | 必要設定のみ | 登録/蔵書 | timeout/429/取消 | E2E + Mutation |
| FEAT-CAL | カレンダー | 月移動/日付/表示切替/ICS | canonical release date | 保存設定 | 蔵書/Home/通知 | 欠損日付/rollback | E2E + Mutation |
| FEAT-SET | 設定 | 入力/選択/バックアップ/復元 | 設定oracle | atomic restore | 全UI/API | 不正バックアップ/失敗rollback | E2E + Mutation |
| FEAT-API | 書誌API | Provider/Resolver | evidence/信頼度/採用判定 | 保存時のみ | 登録/詳細/検索/カレンダー | timeout/429/conflict | Property + Mutation + E2E |
| FEAT-BIB | 既存書誌補完 | 監査/補完/診断 | 不足/未取得/不採用を分離 | 既存値非破壊 | 詳細/カレンダー | 補完失敗rollback | Logic + E2E |
| FEAT-DIAG | 診断 | 実行/コピー/クリア | 結果領域分離 | 不要 | aggregate report | 空結果/連打/長文 | Static + E2E + Mutation |
| FEAT-METRIC | 計測 | 登録/検索計測 | API/待機/処理を分離 | 画面内のみ | 設定診断 | prompt待機混入を検出 | Static + Mutation |
| FEAT-CROSS | 横断データ | 10系統 | 独立oracleと各投影一致 | 保存/再読込 | Home/蔵書/検索/カレンダー | 欠損/競合/低信頼 | Cross E2E + Mutation |
| FEAT-UI | UI品質 | 全interactive control | overflow/clip/label | 不要 | 全タブ | viewport/文字サイズ | Browser E2E |

## 実装アンカー監査

CURRENT機能は台帳だけを置いて完了扱いにせず、成果物内の実装入口と対応付ける。アンカーが消失・名称変更した場合はRelease Gateで停止する。

| 契約 | 実装アンカー | 最低限の存在確認 |
|---|---|---|
| FEAT-SCAN | `#scan`, `scan()`, `stopScan()` | UI + handler + stop path |
| FEAT-BACKUP | `backupDataBtn`, `restoreDataBtn`, `validateBackupData`, `restoreBackupData` | export/import/validation/restore |
| FEAT-DETAIL | `openBookDetail`, `detailPrice`, `detailReading`, `detailFavorite`, `detailRating`, `detailMemo` | detail mutation controls |
| FEAT-PURCHASE | `purchaseGroups`, `setPurchaseGroupForBooks`, `getPurchaseGroupForBook` | group persistence/read path |
| FEAT-CAL | `renderCalendar`, `addCalendarExtra`, `canonicalReleaseDate` | calendar/render/projection |
| FEAT-REG | `prepareRegistrationBook`, `prepareRegistrationBatch`, `commitBulkPreparedBooks` | common prepare/commit |

這は個別バグの回帰テストではなく、「契約だけ残って実装が抜け落ちる」構造的欠陥を防ぐための静的境界である。

## 操作対象の定義

buttonだけを対象としない。次を含む。

- button / link / tab / summary / details
- input / textarea / select / checkbox / radio / color / file
- 動的生成UI
- フィルター・並べ替え・表示切替
- ダイアログの確定・取消・閉じる
- 非同期開始・再試行・キャンセル
- 保存・復元・削除・状態変更
- Clipboard / export / import
- スワイプ等のUI操作を実装した場合のジェスチャー入口

## 未開発機能

未開発機能はCURRENT契約へ混入させない。ROADMAP_TEST_MATRIX.md のPLANNED契約を実装開始時にCURRENTへ昇格させる。

## リリース禁止条件

次のいずれかに該当する場合、実機確認が済んでいてもRelease Gateを通さない。

- 新しい機能入口が台帳にない
- CURRENT機能の完遂層が欠落している
- 操作対象が未分類
- 独立oracleで期待値を生成できない重要機能がある
- 重要な故障モデルをMutationで検出できない
- 保存対象なのに復元契約がない
- 他画面へ投影するデータなのに連携契約がない
- 失敗時のrollback/復旧契約がない

## 運用原則

個別ISBN・個別画面・個別ボタンの追加を品質向上の単位にしない。新しい不具合は、既存のどの機能契約・不変条件・故障モデルに属するかを先に判定し、必要なら共通契約を強化する。

## v4.13.208 機能契約の機械可読カバレッジ

`FEATURE_COVERAGE.json` を機能契約の機械可読な検査マップとする。各CURRENT機能について、8層すべてを契約上要求し、少なくとも1つの独立した検査証拠を紐付ける。証拠名が現行のStatic/E2E/Mutation出力に存在しない場合はRelease Gateで停止する。

「8層の文言が文書に存在する」だけではPASSにしない。機能ID、8層、検査証拠の三者を機械的に照合する。
