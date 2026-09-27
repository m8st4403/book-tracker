# 本棚アプリ ルール台帳 v4.13.40

これまでに決定した本棚アプリのルールを、実装・検証・リリース判定へ接続する正本。

| ID | ルール | 検証方法 | 状態 |
|---|---|---|---|
| OWN-001 | booksが所有状態の正本 | logic + persistence | CURRENT |
| OWN-002 | 登録=購入済み、削除=所有解除 | route + logic + persistence | CURRENT |
| ISBN-001 | ISBN10/13をcanonical化 | logic boundary | CURRENT |
| SERIES-001 | 巻数表記は表示上「作品名＋数字」に正規化 | logic + UI | CURRENT |
| SERIES-002 | 外伝・短編集・スピンオフ等を主系列へ自動統合しない | boundary | CURRENT |
| SERIES-003 | 正式series.idを最優先 | adapter contract | CURRENT |
| SORT-001 | 指定した並び順を第一キー | comparator test | CURRENT |
| SORT-002 | 同値なら作品名→数値巻数→登録順 | comparator test | CURRENT |
| PRICE-001 | 蔵書総額は保存済み定価（税込）のみ | logic + persistence | CURRENT |
| API-001 | Provider固有形式はAdapterで吸収 | static + adapter contract | CURRENT |
| API-002 | critical項目はEvidence/Confidenceで採用判定 | logic contract | CURRENT |
| LOCK-001 | 全データ変更操作は共通排他制御 | catalog + runtime | CURRENT |
| SEARCH-001 | stale検索結果は最新結果を上書きしない | concurrency E2E | CURRENT |
| UI-001 | 同じ意味の統計パネルは共通構造 | browser DOM/style | CURRENT |
| UI-002 | 表示要素は存在だけでなく実際に読める | geometry/clip/overflow | CURRENT |
| UI-003 | 375/390/414pxでレイアウト契約を満たす | viewport matrix | CURRENT |
| PERSIST-001 | 重要状態は保存→再読込→関連画面まで維持 | persistence E2E | CURRENT |
| RELEASE-001 | ZIP再展開後も全Gateを通過 | release gate | CURRENT |

## 検証層
1. static contract
2. pure logic / boundary
3. integration / route
4. browser E2E
5. UI geometry / clipping / viewport
6. persistence / reload
7. mutation / release gate

UIは「存在する」だけで完了としない。仕様が「読める」を要求する場合は実寸・overflow・clip・viewportまで確認する。


## v4.13.40 データ操作カタログ
`OPERATION_CATALOG_v4_13_40.md` をデータ変更操作の正本とし、UI入口と関数入口の二重ロックで排他制御する。

## v4.13.44 検証体系監査で追加した不変条件

| ID | ルール | 検証方法 | 状態 |
|---|---|---|---|
| PERSIST-002 | 複数storageを変更する操作は途中失敗で部分状態を残さない | failure injection + rollback E2E | CURRENT |
| PERSIST-003 | 重要状態は実reload後に意味を維持する | browser reload E2E | CURRENT |
| BACKUP-001 | バックアップはschema/version/許可キーを満たす | logic + E2E | CURRENT |
| VERSION-001 | package/app/guardのバージョンを一致させる | static release gate | CURRENT |

## v4.13.152 引き渡し前実動作ルール

| ID | ルール | 検証方法 | 状態 |
|---|---|---|---|
| RELEASE-002 | 新規診断は静的配線だけでなくBrowser E2Eで実動作を確認してから引き渡す | 代表対象E2E | CURRENT |
| RELEASE-003 | 診断のコピー・クリアは実際の操作結果まで検証する | Browser E2E | CURRENT |
| RELEASE-004 | データ非変更診断は実行前後の蔵書スナップショット一致を確認する | Browser E2E | CURRENT |
| RELEASE-005 | 新規診断の処理中ロック・完了・失敗解除を確認する | Browser E2E + concurrency | CURRENT |


## v4.13.155 シリーズ表示・分類ルール

| ID | ルール | 検証方法 | 状態 |
|---|---|---|---|
| SERIES-UI-001 | `series-work:` / `series-scope:` 等の内部分類キーをユーザー向けシリーズ見出しに表示しない | Browser E2E + UI表示検査 | CURRENT |
| SERIES-UI-002 | 同一作品・同一出版シリーズの書誌表記差（改行・空白・中点差）は分類上同一化する | seriesKey boundary + Browser E2E | CURRENT |
| SERIES-UI-003 | シリーズ見出しは作品名と出版シリーズ名をユーザー向け表記で表示する | Browser E2E | CURRENT |
| SERIES-UI-004 | シリーズ表示修正は蔵書データ（タイトル・読書状態・お気に入り・価格等）を変更しない | Browser E2E snapshot | CURRENT |


## v4.13.162 作者フィルター同一性ルール

| ID | ルール | 検証方法 | 状態 |
|---|---|---|---|
| FILTER-AUTHOR-001 | 作者フィルターは生のauthor文字列完全一致ではなく作者同一性キーで分類する | logic + Browser E2E | CURRENT |
| FILTER-AUTHOR-002 | 空白・NFKC・全角半角・役割接頭辞の差で同一作者を分割しない | boundary test | CURRENT |
| FILTER-AUTHOR-003 | 複数作者は各作者を独立したフィルター候補として扱う | boundary + UI | CURRENT |
| FILTER-AUTHOR-004 | 作者フィルター正規化で保存済み書誌値を変更しない | snapshot + persistence | CURRENT |
| FILTER-AUTHOR-005 | 内部作者キーをUIへ表示しない | Browser E2E | CURRENT |


## v4.13.164 作者フィルター書誌同一性

| ID | ルール | 検証方法 | 状態 |
|---|---|---|---|
| FILTER-AUTHOR-006 | 構造化`authorNames`を表示用`author`から分離して保持する | adapter + registration logic | CURRENT |
| FILTER-AUTHOR-007 | 区切りなし連結作者は観測された候補の書籍集合が完全一致する場合のみ冗長表記を統合する | property logic + Browser E2E | CURRENT |
| FILTER-AUTHOR-008 | 部分一致だけで別作者を同一化しない | boundary/property test | CURRENT |
| FILTER-AUTHOR-009 | 作者候補の内部キーはUIへ表示しない | Browser E2E | CURRENT |
| FILTER-AUTHOR-010 | 生没年形式など明らかな非作者文字列を候補化しない | boundary/property test | CURRENT |


## v4.13.164 作者フィルター書誌表記
- `姓,名` は表示用保存値を変更せず、フィルター内部で姓名表記へ正規化する。
- 複数作者の連結書誌は、書誌上の区切りを尊重して候補を分離する。
- 姓・名・フルネームだけの部分一致は同一人物確定の根拠にしない。
