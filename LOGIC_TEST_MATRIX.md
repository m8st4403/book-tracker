# Book Tracker — Logic Test Matrix v4.13.31

ロジックテストは「過去にバグが出た箇所」ではなく、現在の仕様で守るべき不変条件を母集団とする。
UIの見た目はブラウザE2Eで別途検査する。新機能を追加するときは、この表に先に契約を追加する。

## Navigation / shared state

- 6タブが存在する。
- タップで選択タブが1つに収束する。
- pageshow後の初期タブはホーム。
- タブ切替で保存データの意味が変化しない。

## ISBN / search / registration

- ISBN-10→ISBN-13 canonical化。
- ISBN-13 canonical化。
- 同一canonical ISBNの重複排除。
- ISBNなしはタイトル・作者・出版社・発売日の複合キーで重複抑制。
- 最大30冊を超えない。
- チェックした結果だけ一括登録。
- 登録時は蔵書=購入済み。
- 発売前本は登録不可。
- 登録後に検索結果の所有状態を再描画。
- 削除後に検索結果の所有状態を再描画。

## Library state / filters / sorting

- readingStatusはread/unreadのみ。
- favoriteはbooleanのみ。
- 購入状態はpurchasedのみ。
- フィルターは作者・出版社・年・発売日・読書状態・お気に入り・価格。
- 価格フィルターはunconfirmedとconfirmedを区別し、confirmed_zeroはconfirmed側。
- リセットで検索文字列・全フィルター・積読状態を解除。
- 個別表示とシリーズ表示が同じsort値を尊重。
- 現在のフィルター結果だけ一括操作。
- 一括削除後に保存・再描画。

## Series

### Series classification sampling gate (v4.13.115)

汎用性の検証は現在の蔵書だけを母集団にしない。実在書誌で発生する分類境界を代表する固定サンプルを回帰対象とする。

- 同一作品・巻違いは同一シリーズ。
- 同一タイトルでも書誌上のシリーズが異なる場合は別シリーズ。
- レーベル番号等が巻ごとに変化しても、同一作品・同一シリーズなら分割しない。
- `集英社文庫 ; と21-3` / `と21-4` のような番号付きシリーズ表記は、末尾数字を機械的に削るだけで判定しない。
- 外伝・スピンオフ・短編集・サブタイトル違いは、タイトル/書誌情報が別作品を示す場合に自動統合しない。
- 既存蔵書は回帰確認用であり、汎用性の母集団とは分離する。

初期固定サンプル：10件の同一化/分離ケース＋4件のseriesScope正規化ケース。代表例はレベルE（Jump Comics / 集英社文庫）、風の谷のナウシカ（ジブリの教科書 / シネマ・コミック）、ヨコハマ買い出し紀行（新装版各巻）、スピンオフ例。

この10+4件は「十分な汎用性」を意味する最終母集団ではない。今後、出版社・レーベル・シリーズ表記・巻表記・外伝/短編集等のケースを追加し、ケースカバレッジを拡大してから分類ロジックを確定する。

- 第N巻/N巻/N集/(N)/（N）/末尾裸数字を同じ巻数として解釈。
- 元タイトルを変更しない。
- 表示だけ「タイトル 数字」に正規化。
- 正式series.idをタイトル解析より優先。
- 正式series.nameを次順位として利用。
- スピンオフ等をタイトルだけで本編へ統合しない。
- 1冊、2〜4冊、5冊以上で仕様どおり表示状態を分岐。
- 2〜4冊はall↔title、5冊以上はdeck→list→title→deck。
- 開閉状態をシリーズ単位で保存。
- 巻抜け判定は登録巻の集合から計算。

## Price / purchase

- 定価と購入金額を別概念として保持。
- 未確定はlistPrice=null/status=unconfirmed。
- 1円以上はconfirmed。
- 0円はconfirmed_zeroだが総額へ加算しない。
- API定価は税込確認＋HIGH以上を満たさない限り自動確定しない。
- Google Books retailPriceを定価へ代用しない。
- 蔵書総額は確定済み定価だけを合計。
- セット購入はpurchaseGroups.totalAmountへ総額だけを保存。
- セット購入総額を各巻へ自動按分しない。
- セット購入後に一部の定価だけ確定した場合、蔵書総額はその確定分だけ増える。
- 購入総額の変更は蔵書総額を変更しない。

## Calendar

- 月移動。
- 今日表示。
- 選択日表示。
- 蔵書/関連/おすすめのフィルター。
- 設定値を初期値として使用し、カレンダー内フィルターは一時状態。
- 発売日と所有状態を混同しない。
- ICS出力が有効な日付だけを出力。
- 発売日変更時に将来のReleaseEvent設計へ移行できるデータ境界を維持。

## Settings / data

- プロフィール保存。
- テーマ保存・適用。
- 小/中/大文字サイズ保存・適用。
- 自作スキン保存・適用。
- 背景画像保存・削除。
- 自動文字色補正ON/OFF。
- バックアップappVersion=APP_VERSION。
- JSON復元で既存データ構造を壊さない。
- localStorage全消去を行わない。
- サンプルdemoフラグを通常データへ昇格させない。

## API management

- Provider Adapter境界を維持。
- field単位priorityを維持。
- capability不足Providerを候補から除外。
- schema/必須field/値/意味を検証。
- critical fieldはHIGH以上を要求。
- critical conflictを単純多数決で確定しない。
- timeout/HTTP/schema/field/confidence失敗時のfailover境界を維持。
- Remote Configから任意コードを実行しない。
- Adapter未実装の未知APIを動的コード取得しない。

## Cross-feature invariant

- 状態変更は正規化→保存→再描画。
- 同じ書籍はcanonical ISBNで全画面が同じ所有状態を参照。
- 価格状態はホーム・蔵書・詳細・フィルター・バックアップで意味が一致。
- 購入総額は価格集計へ混入しない。
- シリーズID/巻数は検索・蔵書・カレンダー・推薦の共通識別に利用可能な形を維持。
- 将来の推薦は行動ベースで、年齢・性別・人種等の属性推定を根拠にしない。

## Test design rule

各契約は可能な限り、正常値・境界値・欠損値・不正値・状態遷移・保存後再読込・関連画面反映の組でテストする。
単一関数のPASSだけで仕様を満たしたとは扱わない。

## v4.13.31

- 登録データへの正式シリーズ情報引き継ぎ
- 検索single-flight境界
- 個別／一括登録の共有ISBNロック
- 確定価格あり＋シリーズ情報不足時のみResolver補完


## v4.13.33
- Search ISBN lookup uses a fast primary-provider path; independent ISBN rows may resolve concurrently.
- Complete series metadata in a search result is reused during registration.
- Individual registration, checked-ISBN registration, and bulk registration are all single-flight/ISBN-locked.
- Result-card thumbnails remain fixed at 68×96 CSS px regardless of status badges.
- Existing-series repair accepts explicit `vol.N` titles only when the trusted series name is an exact prefix; variant titles remain separate.


### v4.13.38
- Home/Library shared statistics renderer and visual geometry consistency.


### v4.13.39 compact statistics label visibility
- 蔵書統計の縮小横一列表示では、5つの名称（蔵書冊数／蔵書総額／購入予定／積読／お気に入り）を必ず表示する。
- `.statbox > .muted` のような高いCSS優先度の包括セレクタで名称を隠さない。
- 実ブラウザの `getComputedStyle` と実寸（width/height）で5名称の表示状態を検証する。


## Phase 6 — 自動フェイルオーバー
- Provider障害時に次候補へ移行する。
- 検索経路も同じpriorityでfailoverする。
- timeoutを障害として扱う。
- 連続障害Providerはtemporary cooldownへ入り、その間skipする。
- 復帰後に再試行可能なランタイム状態を維持する。


## v4.13.164 Author identity / library filter

- 作者フィルターはraw `author`完全一致ではなく正規化キーで一致させる。
- NFKC、空白、全角半角、役割接頭辞の差を同一作者として扱う。
- 複数作者は各作者を独立した候補として扱う。
- 別作者は同一キーにならない。
- 正規化は保存済みauthor値を書き換えない。
- UIには内部作者キーを表示しない。

- 構造化`authorNames`が存在する場合はそれを優先し、表示用`author`文字列の連結状態に依存しない。
- 区切りなし連結表記は、候補の書籍集合が完全一致する場合だけ冗長な短縮候補を隠す。
- 候補の書籍集合が異なる場合は、短い名前を別人として残し、部分一致による自動統合を行わない。
- 生没年形式など作者ではない明らかな年号文字列を作者候補へ昇格させない。


## v4.13.172 Author authority identity

- NDL典拠IDが同一で表示名が異なる作者を1候補へ統合する。
- 同一正規化名に複数の典拠IDが存在する場合は同名異人として分離する。
- 典拠なし旧データは唯一の典拠IDが観測された場合のみ橋渡しし、複数典拠がある場合は橋渡ししない。
- 典拠ID・entity URIをUIへ表示しない。
- 保存済み`author`値を変更しない。


## v4.13.167 Authority extraction
- OpenSearch/SRUのcreator URIを構造化`authorEntities`へ変換する。
- authorityIdとentityIdを表示用authorから分離する。
- URIがないcreatorについてauthorityIdを推測しない。
- 特定の作者名・出版社名・シリーズ名に依存しないfixtureで検証する。


## v4.13.167 書誌同一性
- 出版社フィルターはNFKC/空白差だけを吸収し、異なる出版社名を推測統合しない。
- 出版社表示値と判定キーを分離し、保存値を変更しない。
- シリーズ判定キーと表示ラベルを分離し、内部分類キーをUIへ漏出させない。
- 作者・出版社・シリーズの同一性ロジックは個別出版社・作品追加ではなく性質ベースで検証する。


## v4.13.172 Library filter report
- `buildLibraryFilterStateReport()` が現在のフィルター状態を利用者向け名称で出力する。
- 作者・出版社候補と冊数を含む。
- 内部判定キーを出力しない。
- コピー操作は状態変更を発生させない。

## v4.13.172 作者姓名表記の性質ベース回帰

| ID | 契約 | 回帰方法 |
|---|---|---|
| AUTH-FORMAT-003 | `姓,名` と `姓, 名,` は同一作者キー | property logic |
| AUTH-FORMAT-004 | ASCIIカンマ／全角カンマを同一作者キーとして扱う | property logic |
| AUTH-FORMAT-005 | 末尾カンマを作者名の別人・別候補として残さない | boundary logic |
| AUTH-FORMAT-006 | `姓,名 姓,名` の複数作者を2候補へ分離する | property logic |
| AUTH-SAFETY-002 | 姓だけ／名だけへの誤分割を発生させない | fault/property logic |
| AUTH-STORAGE-001 | 正規化処理で保存済み `author` を変更しない | snapshot |

固定ISBN・出版社・シリーズの追加ではなく、書誌文字列の同値変形を入力にした性質テストで検出する。


## v4.13.173 Registration normalization architecture
- 全登録入口の共通prepare/commit接続を構造として検証する。
- 検索結果のidentity保持と、欠損時の限定的補完を分離する。
- blank/placeholder保存禁止を個別ISBNではなく全候補に対する不変条件として扱う。

## v4.13.174 性質ベース品質契約
- 作者・出版社フィルターは合成蔵書母集団に対して同値性・分離性・集合一致を検証する。
- 候補冊数ではなく、選択後の対象集合そのものを期待集合と比較する。
- 複合条件は論理ANDとして順序を変えても同じ集合になる。
- フィルター生成・選択・解除・再描画の間で保存値を変更しない。


## v4.13.175 次工程契約
- v4.13.174で確立したProperty→Mutation→E2E方式を発売日エンジンにも適用する。
- 日付そのものだけでなく、精度・確度・出典・通知/ICS適用可否の関係を不変条件として検証する。
- 実在作品の追加ではなく、合成日付母集団と故障注入を基本とする。
