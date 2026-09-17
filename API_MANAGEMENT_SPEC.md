# API管理・自動フェイルオーバー仕様 v1.0

対象アプリ：Book Tracker / 書籍管理アプリ
基準実装：v4.13.24
仕様確定日：2026-09-12

> 本書はAPI管理を実装する前に固定する正式仕様。v4.13.24の既存UI・シリーズ表示仕様を変更するものではない。

## 1. 目的

外部書籍APIの停止・仕様変更・データ欠損に対して、アプリが必要な書籍情報を可能な限り取得し続けられるようにする。

基本原則：

1. API固有形式はAdapterで吸収する。
2. APIの優先順位は「API全体」ではなく「情報項目ごと」に持つ。
3. HTTP 200だけでは成功と判定しない。
4. 必須フィールド、値の妥当性、情報源、取得日時を確認する。
5. 必要な情報を取得できなければ次候補へ自動フェイルオーバーする。
6. 複数APIから得た情報は共通BookRecordへ統合する。
7. 信頼度チェックを行い、重要項目では低信頼データを自動確定しない。
8. 未知APIをネットから自動発見してコード実行する方式は採用しない。
9. 既にアプリへAdapterを組み込んだAPIは、リモート設定で2回目以降に有効化・優先順位変更できる。

## 2. 「新API」の扱い

### 2.1 初回

まだAdapterがアプリに存在しない新APIは自動利用しない。

```text
新API
 ↓
Adapterをアプリへ実装
 ↓
契約テスト・回帰テスト
 ↓
アプリ更新
```

### 2.2 2回目以降

Adapterが既にアプリへ組み込まれていれば、リモート設定で以下を変更できる。

- enabled / disabled
- 項目別優先順位
- capabilityの利用可否
- 最低信頼度閾値
- 障害時の一時停止条件

したがって「2回目から利用可能」という理解は、**新APIを一度Adapterとしてアプリへ追加済みであることが前提**で正しい。

### 2.3 禁止

リモートから任意のJavaScriptコードを取得して実行する仕組みは採用しない。リモート設定はデータのみとする。

## 3. Provider Adapter

各APIは以下の責務を持つAdapterへ分離する。

- GoogleBooksAdapter
- OpenBDAdapter
- RakutenBooksAdapter
- NDLSearchAdapter

Adapterは外部レスポンスを共通形式へ変換する。

```text
外部API
  ↓
Provider Adapter
  ↓
ProviderResult
  ↓
Field Validator
  ↓
Confidence / Evidence
  ↓
BookRecord Merger
```

## 4. Capability管理

Providerごとに提供可能な情報を管理する。

主なCapability：

- isbnSearch
- titleSearch
- bibliographicRecord
- seriesId
- seriesName
- volumeNumber
- listPrice
- taxIncluded
- releaseDate
- cover
- author
- publisher
- pages

Capabilityがtrueでも、実レスポンスで必要フィールドが欠けていれば、そのリクエストでは失敗扱いにする。

## 5. 情報信頼度チェック：採用する

### 結論

**各項目の情報信頼度チェックを設ける。**

理由：

- APIがHTTP 200を返しても、必要情報が欠ける場合がある。
- 同じ「価格」でも定価・販売価格・中古価格など意味が異なる。
- シリーズ名だけ一致しても同一シリーズとは限らない。
- API間で異なる値が返る場合がある。
- 将来APIの仕様変更で、値は存在するが意味が変わる可能性がある。

ただし、人間の主観による「何となく80点」のようなスコアにはしない。

**信頼度は、検証可能なEvidence（根拠）から機械的に決定する。**

## 6. 信頼度レベル

| レベル | 意味 | 自動確定 |
|---|---|---|
| VERIFIED | 必須条件を満たし、意味・値・識別子まで検証済み | 可 |
| HIGH | 信頼できる情報源から取得し、主要整合性を確認済み | 可。ただし重要項目は条件付き |
| MEDIUM | 情報は利用可能だが、情報源または意味に限定事項あり | 通常項目は可。重要項目は不可 |
| LOW | 値は存在するが根拠・意味・整合性が弱い | 不可。補助表示のみ |
| UNKNOWN | 欠損・解析不能・意味不明 | 不可 |

## 7. 信頼度判定Evidence

各FieldValueは可能な範囲で以下を保持する。

```js
{
  value,
  source,
  fetchedAt,
  confidence,
  evidence: {
    identifierMatched,
    schemaValidated,
    semanticValidated,
    crossSourceAgreement,
    countryMatched,
    taxIncludedConfirmed
  }
}
```

すべての項目で全フラグを必須とするわけではない。項目に必要なEvidenceだけを評価する。

## 8. 項目別の重要度

### Critical

誤ると蔵書構造・金額を直接壊す項目。

- isbn13
- series.id
- series.name
- series.volumeNumber
- price.listPrice
- price.taxIncluded

Critical項目はLOW/MEDIUMの値を自動確定しない。

### Important

誤っても致命的ではないが、正確性が重要。

- title
- author
- publisher
- releaseDate
- pages

### Optional

欠損しても基本機能を継続できる項目。

- cover
- description
- categories
- previewLink等

## 9. シリーズ判定の信頼度

シリーズ統合は特に厳格にする。

優先順位：

```text
正式なseriesId + volumeNumber
        ↓
正式なseriesName + volumeNumber + ISBN/著者/出版社等の整合
        ↓
別APIのseries情報との一致
        ↓
タイトル解析（最後の補完）
```

タイトル解析だけでCriticalなシリーズ統合を自動確定しない。

これにより「レベルE 1」「レベルE 2」「レベルE（3） Full moon…！」のようにタイトル表記が異なる巻を、APIの正式なシリーズ情報から同一シリーズとして扱える。

## 10. 定価（税込）の信頼度

アプリの正式な価格定義：

> 登録時点の日本向け・その書籍の定価（税込）。

以下を定価（税込）として自動確定してはならない。

- 現在の販売価格だけしか確認できない値
- セール価格
- 中古価格
- 購入者が実際に支払った価格
- 税込/税別が不明な値
- 電子版と紙版の区別ができない値
- 国・通貨が日本向けと確認できない値

Google Booksには `saleInfo.listPrice`（Suggested retail price）と `retailPrice`（実売価格）が存在するため、意味を区別する。日本の定価（税込）として採用するには、税区分等の必要条件を別途満たすこと。Googleの価格を存在するだけで日本の税込定価とみなさない。

## 11. 価格の保存

登録時に確定した値をBookRecordへ保存する。

```js
price: {
  listPrice: 484,
  currency: "JPY",
  taxIncluded: true,
  source: "rakuten",
  fetchedAt: "...",
  confidence: "VERIFIED"
}
```

登録後のAPI価格変更で蔵書総額を遡及変更しない。

蔵書総額は保存された `price.listPrice` の合計とする。

購入価格は将来別フィールド／別モデルとし、listPriceと混同しない。

## 12. API優先順位表

### 12.1 書籍検索

1. Google Books
2. 楽天Books
3. NDL Search

### 12.2 シリーズID

1. Google Books
2. （他Providerで正式なseriesIdを提供する場合はAdapter追加後に設定）

### 12.3 シリーズ名

1. Google Books
2. 楽天Books
3. openBD
4. NDL Search

### 12.4 巻数

1. Google Books `orderNumber`
2. 楽天Books / NDLの巻次情報
3. openBDのCollection等から取得できる場合
4. タイトル解析（最後の補完）

Google Booksでは表示用 `bookDisplayNumber` と実際の順序を表す `orderNumber` を区別する。

### 12.5 定価（税込）

1. openBD等の日本向け定価情報を、税区分まで検証できたもの
2. Google Books `listPrice`（日本向け・紙/電子・税区分等の条件を検証できた場合のみ）
3. NDL（価格情報があり、定価（税込）として意味を確定できる場合のみ）

「価格が取れた」だけでは採用しない。定価（税込）としての意味が検証できなければ次候補へ進む。

### 12.6 発売日

1. 楽天Books / openBD
2. NDL Search
3. Google Books

日付精度も検証し、年のみ等の曖昧値は完全な発売日として扱わない。

### 12.7 書誌情報

1. NDL Search / openBD
2. Google Books
3. 楽天Books

### 12.8 表紙

1. Google Books
2. openBD
3. NDL / 楽天Books

利用規約・保存条件はProviderごとに別途確認する。

## 13. BookRecord仕様

```js
{
  isbn13,
  isbn10,
  title,
  subtitle,
  authors,
  publisher,
  releaseDate,
  pages,
  categories,

  series: {
    id,
    name,
    volumeNumber,
    displayVolume,
    bookType,
    confidence
  },

  price: {
    listPrice,
    currency,
    taxIncluded,
    source,
    fetchedAt,
    confidence
  },

  identifiers: {
    googleVolumeId,
    googleSeriesId,
    jpno,
    rakutenItemId
  },

  fieldEvidence: {
    title: {...},
    series: {...},
    volumeNumber: {...},
    listPrice: {...},
    releaseDate: {...}
  },

  sources: [
    {
      provider,
      sourceId,
      fetchedAt,
      fields
    }
  ],

  sourceUpdatedAt,
  confidence
}
```

実装時は既存データとの後方互換を確保し、いきなり全既存レコードを破壊的に移行しない。

## 14. 自動フェイルオーバー判定フロー

```text
[要求された情報項目]
        ↓
[項目別Provider優先順位を取得]
        ↓
[enabled / capability確認]
        ↓
[API呼び出し]
        ↓
[通信・HTTP判定]
   ┌────┴────┐
  失敗       成功
   ↓           ↓
[次候補]   [Schema検証]
               ↓
         [必須Field検証]
               ↓
         [値の妥当性検証]
               ↓
         [意味検証]
               ↓
         [Evidence生成]
               ↓
         [Confidence判定]
          ┌────┴────┐
       閾値以上      閾値未満
          ↓             ↓
     [候補採用]       [次候補]
          ↓
[他Providerの結果と整合性確認]
          ↓
[最終FieldValue確定]
```

## 15. フェイルオーバー条件

次候補へ進む条件：

- timeout
- network error
- HTTP 4xx/5xx（認証・レート制限等を含む）
- JSON/XML等の解析失敗
- schema mismatch
- 必須フィールド欠損
- 値の形式不正
- 意味検証失敗
- confidenceが必要閾値未満
- 他Providerとの矛盾によりCritical項目を確定できない

## 16. 複数Provider間の矛盾

Critical項目で値が一致しない場合、単純な多数決だけでは決定しない。

```text
A: series = X / HIGH
B: series = Y / HIGH
        ↓
Critical conflict
        ↓
自動統合しない
```

ISBN一致などの強い識別子を基準に再検証する。

それでも確定できない場合は、低信頼のまま登録確定せず、ユーザー確認または次回再取得へ回す。

## 17. 一時障害と恒久障害

### 一時障害

Provider単位の失敗回数・時刻を記録し、短時間だけ候補から外す。

### 恒久障害・仕様変更

契約テストで継続的に失敗したProviderは、リモート設定でdisabledにできる。

アプリ更新なしで既存Adapterの停止・再有効化・優先順位変更を可能にする。

## 18. キャッシュ

既取得情報はキャッシュ可能とする。

ただし、登録済み本の定価（税込）はAPIキャッシュではなく、登録時にBookRecordへ保存した確定値を使用する。

API停止時は、利用可能なキャッシュを表示に使用できるが、古い情報を新規のCritical情報として自動確定しない。

## 19. 契約テスト

Providerごとに以下をテストする。

- HTTP到達性
- レスポンス形式
- ISBN一致
- 必須フィールド
- series構造
- volumeNumber
- listPrice
- taxIncluded判定
- releaseDate
- cover

契約テストが失敗してもアプリ全体を停止させず、そのProviderの該当Capabilityを無効化してフェイルオーバーする。

## 20. 現行Providerの位置付け

| Provider | 主用途 | 備考 |
|---|---|---|
| Google Books | 検索・シリーズ構造 | `seriesInfo` / `orderNumber`を重視 |
| 楽天Books | 日本の販売・シリーズ・発売日・価格 | API利用には認証情報等が必要 |
| openBD | 日本の書誌・シリーズ・価格補完 | ONIXのCollection/Price等を利用。サービス継続性を監視 |
| NDL Search | 公的書誌・シリーズ・検証・補完 | API方式・利用条件を確認して利用 |

## 21. 仕様としての最終結論

- 情報信頼度チェックは**必須**。
- ただし主観的な点数ではなく、識別子・schema・意味・税区分・国/版・複数情報源一致等のEvidenceから機械判定する。
- Critical項目は厳格に扱う。
- 特に「シリーズ統合」と「定価（税込）」は低信頼値を自動確定しない。
- 新APIは初回だけAdapter実装が必要。その後は既存Adapterをリモート設定で切り替え可能。
- 未知APIのコードを自動取得・実行する方式は採用しない。
- API管理はv4.13.24のUI仕様とは独立した基盤仕様として実装する。

## 22. 参照する公式仕様

実装時は各Providerの最新公式仕様を確認し、Adapterの契約テストを更新する。

- Google Books Volumes API: https://developers.google.com/books/docs/v1/reference/volumes
- Google Books VolumeSeriesInfo: https://developers.google.com/resources/api-libraries/documentation/books/v1/cpp/latest/classgoogle__books__api_1_1Volumeseriesinfo.html
- 楽天Books Book Search API: https://webservice.rakuten.co.jp/documentation/books-book-search
  - 楽天Booksの `listPrice` は仕様上2013年以降常に0のため定価には使用しない。`itemPrice` は販売価格として別管理する。
  - applicationId / accessKey が必要。認証情報はソースへ埋め込まず、実行環境から注入する。
- openBD 書誌API仕様: https://openbd.jp/spec/
- NDL Search API仕様: https://ndlsearch.ndl.go.jp/help/api/specifications
  - NDL SearchはSRU/OpenSearch/OpenURLを提供。営利利用・継続利用では利用申請等の条件確認が必要な場合があるため、既定ではAdapterを無効化する。
- NDL Search API利用条件: https://ndlsearch.ndl.go.jp/help/api

Google Booksはシリーズの表示番号と実際の順序を分けて提供しており、`orderNumber`を実際の順序判定に使用する。Google Booksの`listPrice`はSuggested retail price、`retailPrice`は実際の販売価格として定義されるため、定価（税込）の判定では両者を混同しない。楽天Booksは`seriesName`、`isbn`、`salesDate`等を提供する。openBDはONIXのCollection/TitleDetailとPrice等を提供する。NDL Searchはシリーズタイトル等を含む書誌検索・APIを提供する。



## 23. 実装段階

### Phase 1
API Provider / Capability / 項目別優先順位 / Evidenceベース信頼度判定 / Critical閾値 / Remote Config安全方針の基盤を追加。

### Phase 2（v4.13.25）
既存のGoogle BooksおよびopenBDのISBN照会・Google Books検索をProvider Adapter経由へ移行した。

- `GoogleBooksAdapter` を検索・ISBN照会の入口として使用する。
- `OpenBDAdapter` をISBN照会の入口として使用する。
- 既存UIへ返す書籍データはAdapter側で正規化する。
- 既存の検索順・表示順・登録フローはPhase 2では変更しない。
- 楽天Books / NDL Searchの実Adapter追加は後続Phase。
- 複数Providerの実フェイルオーバーは後続Phase。
- 定価（税込）の正式な保存統合はPhase 4で実装済み。

Phase 2の目的は、既存機能を壊さずProvider依存箇所をAdapter層へ隔離すること。


## Phase 3 — シリーズ情報・巻数の信頼度判定＋複数APIデータ統合（v1.1）

### 3.1 統合単位
- ISBNを統合キーとし、利用可能なProvider Adapterから同一書籍の候補を収集する。
- 取得した各項目は、Provider単位ではなく**項目単位**で採用候補を決定する。
- 統合結果には `sources`、`fieldEvidence`、`resolution` を保持し、どのAPI・どの根拠で採用したか追跡可能にする。

### 3.2 シリーズ・巻数の正式判定
優先順位は次の通り。
1. 正式な `seriesId`
2. 正式な `seriesName`
3. 正式な `volumeNumber`（実巻順）
4. 複数Provider間の一致
5. 最終手段として既存のタイトル解析

`seriesId`、`seriesName`、`volumeNumber` はCritical項目として `HIGH` 未満を自動確定しない。

### 3.3 複数Provider一致
同一ISBNに対して複数Providerが同じシリーズ名・巻数を返した場合、`crossSourceAgreement=true` をEvidenceに記録し、識別子・スキーマ・意味検証を満たす候補の信頼度を補強する。

ただし、複数Providerが同じ値を返しただけで定価（税込）の税込性を推測してはならない。

### 3.4 シリーズグルーピング
蔵書表示のシリーズキーは、次の順で決定する。
- `series.id` / `googleSeriesId`
- `series.name`
- 既存のタイトル解析

したがって、タイトル表記が異なる巻でも正式なシリーズIDが同じなら同一シリーズとして扱える。

### 3.5 統合結果の品質
- API通信成功だけでは採用成功としない。
- 必須項目の存在、ISBN一致、スキーマ、意味、国/市場、税込性などをEvidenceとして評価する。
- `LOW` / `UNKNOWN` は自動確定に使用しない。
- Critical項目は `HIGH` 以上を要求する。
- 情報が競合し、十分な根拠で優劣を決められない場合は自動統合せず、候補を保持する。

### 3.6 新API
既存Adapterが実装済みであれば、リモート設定により有効化・優先順位変更が可能。未知APIのコードをリモートから取得・実行することはしない。


## 13. Phase 4/5 — 定価（税込）と購入総額

- **「蔵書総額」は登録された本の定価（税込）の合計**とする。
- `price.listPrice` を定価（税込）の正式フィールドとする。
- `price.status` で `confirmed` / `unconfirmed` / `confirmed_zero` を区別する。
- 定価未確定の本は登録可能。未確定本は蔵書総額に加算しない。
- 定価入力が空欄なら `unconfirmed` として登録する。
- 0円は通常の未確定値と混同せず、ユーザーの明示確認後に `confirmed_zero` とする。
- 確定0円も蔵書総額には加算しない。
- `price.taxIncluded === true` を確認でき、信頼度が HIGH 以上の値だけをAPIから自動確定する。
- Google Books `retailPrice` や現在の販売価格は `listPrice` の代替に使用しない。
- APIから定価を確定できない場合、単冊・一括登録とも登録自体は継続し、価格は `unconfirmed` とする。
- 登録後はAPIから価格を再取得して蔵書総額を変更しない。
- 詳細画面からの価格変更は「定価（税込）の訂正」として保存する。
- 旧形式の `price: number` は初回起動時に移行し、既存蔵書の金額を保持する。

### 13.1 定価データモデル
```js
price: {
  listPrice: 484, // 未確定は null、確定0円は 0
  status: "confirmed|unconfirmed|confirmed_zero",
  currency: "JPY",
  taxIncluded: true,
  source: "rakuten|openBD|googleBooks|ndl|manual|manual-correction|legacy-migration|unavailable",
  fetchedAt: "...",
  confidence: "HIGH|VERIFIED|MEDIUM|UNKNOWN"
}
```

`price` は現在販売価格や購入価格を表さない。

### 13.2 購入総額
定価と実際の購入金額は別モデルとして管理する。特にシリーズ一括購入など、個々の単価がすぐ分からない場合に購入総額だけを記録できるようにする。

```js
purchaseGroups: {
  id: "pg_...",
  totalAmount: 3000,
  currency: "JPY",
  bookKeys: ["isbn1", "isbn2", "isbn3"],
  note: "全3巻セット",
  createdAt: "..."
}
```

- セット購入では1冊あたりに購入総額を割り振らない。
- `totalAmount` は購入実額であり、蔵書総額には加算しない。
- 定価未確定の本でも購入総額を記録できる。
- 後から各巻の定価が判明した場合、各 `price` を確定して蔵書総額へ反映する。
- 選択した複数冊に購入総額を登録すると1つの購入グループとして保存する。
- 同じ本を別の購入グループへ登録した場合は、その本の旧グループから外す。
- 蔵書から本を削除した場合、購入グループからもその本を除き、空になったグループは削除する。


## v4.13.41 Phase 5 Adapter追加
楽天Books / NDL SearchのAdapterを実装した。楽天Booksは認証情報がない限り無効、NDL Searchも利用条件確認が済むまで無効。両者とも共通BookRecordへ正規化し、critical項目は既存Evidence/Confidence判定を通す。


## Phase 5 — Rakuten Books / NDL Search Adapter追加（v4.13.41〜v4.13.42）
- Rakuten Books Adapter と NDL Search Adapter を実装した。
- 認証情報・利用条件が未設定のProviderは既定OFFとする。
- Rakuten `itemPrice` は販売価格として保持し、正式な定価には使用しない。
- NDLはSRUを入口とし、DC-NDL系のseriesTitle / volume / ISBN等を共通形式へ正規化する。

## Phase 6 — 自動フェイルオーバーの実運用化（v4.13.42）
### 6.1 Provider選択
タイトル検索は `priority.search`、ISBN照会は `priority.isbnSearch` を起点に、enabled / capability を満たすProviderだけを順番に試行する。ISBN照会では日本向け書誌の補完候補としてopenBDを明示的に含める。

### 6.2 フェイルオーバー
Providerの通信失敗、HTTP/解析エラー、timeout、結果なしの場合は次候補へ進む。結果が得られても、Critical項目の採用は既存のEvidence / Confidence規則で別途判定する。

### 6.3 一時障害
Provider単位の実行時ヘルスを保持する。連続失敗が閾値に達したProviderは短時間のcooldownへ入り、その間は候補から一時的に除外する。cooldown終了後は自動的に再試行可能とする。

初期実装値：
- 連続失敗閾値: 2回
- cooldown: 30秒
- Provider request timeout: 12秒

これらはコード実行を伴わない固定ランタイムポリシーであり、既存のRemote Config安全方針とは独立している。

### 6.4 監査
`resolution.attempts` にProviderごとの成功・失敗・skip理由を残し、どの候補を経由したか追跡可能とする。

### 6.5 検証
外部Release Gateで以下を確認する。
- ISBN照会でGoogle Books障害→次の有効なISBN Provider（既定ではopenBD）への自動移行
- 検索でGoogle Books障害→楽天Booksへの自動移行
- timeout→次Providerへの移行
- 連続障害Providerのtemporary cooldown
- 既存Providerが復帰可能な状態を維持


## Phase 7 — Resolver Cache / Critical Field Protection / Provider Contract運用化 (v4.13.43)
### 7.1 Resolver session cache
- ISBN解決結果はセッション内で再利用する。
- キャッシュTTLは10分、最大200件とする。
- Providerのenabled状態またはpriorityが変化した場合、旧キャッシュは使用しない。
- 明示的に `clearResolverCache()` で破棄できる。
- キャッシュは深いコピーを返し、呼び出し側の変更で保存値を汚染しない。

### 7.2 Critical field non-downgrade
- `seriesId / seriesName / volumeNumber / listPrice / taxIncluded` はHIGH以上を採用条件とする。
- Resolverが不十分な値を返した場合、既存の確定済み蔵書データを上書きしない。
- 定価は税込確認済みの値だけを正式な定価として反映する。
- シリーズ情報も `seriesAcceptable()` を通過した場合だけ既存情報を更新する。

### 7.3 Provider contract
- Adapter実装とProvider capabilityの組み合わせをRelease Gateで検査する。
- `isbnSearch:true` のProviderは `adapters.<provider>.isbn()` を持つ。
- `titleSearch:true` のProviderは `adapters.<provider>.search()` を持つ。
- これにより設定だけ先に有効化され、実装されていないAdapterへ到達する状態を配布前に検出する。

### 7.4 検証
外部Release Gateで以下を確認する。
- 同一ISBNの2回目照会がセッションキャッシュを利用する
- Provider設定変更後に旧キャッシュを利用しない
- 拒否されたCritical情報が既存の確定値を上書きしない
- capabilityとAdapter実装の契約が一致する
