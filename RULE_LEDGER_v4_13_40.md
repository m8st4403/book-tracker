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
