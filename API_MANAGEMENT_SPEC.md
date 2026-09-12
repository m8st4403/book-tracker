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

1. 楽天Books / openBDの日本向け定価情報を、税区分まで検証できたもの
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
- openBD 書誌API仕様: https://openbd.jp/spec/
- NDL Search API仕様: https://ndlsearch.ndl.go.jp/help/api/specifications
- NDL Search API利用条件: https://ndlsearch.ndl.go.jp/help/api

Google Booksはシリーズの表示番号と実際の順序を分けて提供しており、`orderNumber`を実際の順序判定に使用する。Google Booksの`listPrice`はSuggested retail price、`retailPrice`は実際の販売価格として定義されるため、定価（税込）の判定では両者を混同しない。楽天Booksは`seriesName`、`isbn`、`salesDate`等を提供する。openBDはONIXのCollection/TitleDetailとPrice等を提供する。NDL Searchはシリーズタイトル等を含む書誌検索・APIを提供する。

