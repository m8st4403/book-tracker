**v4.13.66**

- ISBN検索のAPI実測計測を修正
- Google Books → openBD等のフェイルオーバー時にAPI通信時間・回数・Provider別時間を正確に記録
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブのバージョン情報を統一
- 設定保存失敗時のメモリ／UIロールバック
- カレンダー追加失敗時のロールバック
- ICSを発売日ベースのVALUE=DATE、値エスケープ、安定UIDへ統一


- ISBN検索のProvider別タイムアウトを導入（Google Booksは最大4秒、共通上限12秒を超えない）
- Google Booksのタイムアウト時にopenBD等へのフェイルオーバーを早め、AbortControllerによる通信キャンセルと連動

# Book Tracker

iPhone向けの書籍管理アプリのプロトタイプです。

## 現在のバージョン

**v4.13.92**

v4.13.92では、NDL SearchのSRU検索条件を現行仕様に合わせ、`dpgroupid=book` + `dpid=iss-ndl-opac` + `mediatype=books` で図書書誌を取得します。`dcndl` / `onlyBib=true` を指定してシリーズ名・巻数・ISBNを取得し、楽譜などの非図書資料が通常検索結果へ混入しにくい構成にしています。検索結果カードはAPIから得た巻数も表示します。Google Booksは既定OFF、楽天Booksは認証情報が設定されている場合のみ候補です。
v4.13.36では、全タブのデータ変更操作を共通排他制御し、検索中も登録・削除などのデータ変更を開始できないようにしました。また蔵書の並び順は、選択した並び順を最優先キーとし、同値時は「作品名 → 巻数 → 登録順」で統一しました。

**v4.13.39**では、蔵書の縮小横一列表示で統計パネル名称がCSSの高い優先度で隠れる回帰を修正し、実ブラウザの表示状態まで検査する回帰テストを追加します。

---

**v4.13.31**

登録・検索の連打防止、ISBN単位の登録ロック、検索結果の正式シリーズ情報保持を追加しています。シリーズ情報が不足する場合のみAPI Resolverで補完し、不要な再問い合わせを避けます。

Phase 4で定価（税込）の正式取得・保存モデル（`price.listPrice`）へ移行しました。

v4.10.0は新機能追加ではなく、今後の開発を安全に進めるための
「仕様ガード＋頻発バグ回帰チェック」を中心とした開発基盤版です。

## API管理・自動フェイルオーバー仕様 v1.5

外部APIは固定順ではなく情報項目単位で管理し、Provider Adapter、Capability、schema/値/意味の検証、Evidenceベースの信頼度判定を経て自動フェイルオーバーする。詳細は `API_MANAGEMENT_SPEC.md`。

重要項目であるシリーズ統合と定価（税込）は低信頼情報を自動確定しない。未知APIの自動コード取得・実行は行わず、Adapter実装済みAPIのみリモート設定で後から有効化・優先順位変更できる。ResolverキャッシュはTTL・上限・Provider設定変更検知を持ち、既存の確定済みCritical情報は低信頼なResolver結果で上書きしない。


## 主な機能

- ISBN / バーコードによる本の登録
- 作品名・巻数・著者による検索
- 蔵書管理
- 発売予定日の管理・カレンダー表示
- 本の詳細・紹介ページ
- Amazon / 出版社への情報・購入リンク
- 類似作品検索
- ISBNによる複数冊検索
- 一括選択・登録・削除
- 開発用サンプルデータ

## v4.10.0 開発安全機構

今後の機能追加で過去の不具合を再発させないため、以下を導入しています。

- `SPEC.md`：守るべき仕様・不変条件
- `DEV_GUARD.md`：仕様ガードと回帰チェックの説明
- `dev_guard.js`：配布前の外部静的・ブラウザ回帰チェック用スクリプト
- `LOGIC_TEST_MATRIX.md`：現在の仕様を母集団にしたロジックテスト契約
- `ROADMAP_TEST_MATRIX.md`：将来機能を先行定義したテスト契約
- `RELEASE_TEST_GATE.md`：配布前リリースゲート
- アプリ内の開発用「仕様・回帰チェック」
- 蔵書状態・購入状態・ISBN重複・チェックボックス等の検査

### 再発防止対象

- データは更新されているのに画面表示が古い
- 詳細画面と一覧画面で状態が一致しない
- 同じISBNが検索結果に重複する
- 全選択チェックボックスが通常の入力欄になる
- 新機能追加時に既存の登録処理を迂回して状態が壊れる
- 発売日と購入・所有状態を混同する
- サンプルデータが通常データとして扱われる

## ファイル構成

```text
book-tracker/
├── index.html       # アプリ本体
├── README.md        # プロジェクト概要・開発案内
├── SPEC.md          # 仕様・不変条件
├── DEV_GUARD.md     # 仕様ガードの説明
└── dev_guard.js     # 開発用静的チェック
```

## GitHub Pages

`index.html`をGitHub Pagesで公開することで、iPhoneのSafariからプロトタイプを利用できます。

## 開発時の基本ルール

機能を追加・変更するときは、まず `SPEC.md` と `DEV_GUARD.md` を確認します。

特に状態を変更する機能では、

**状態変更 → 正規化 → 保存 → 再描画**

の流れを崩さないことを基本とします。

既存仕様を変更する場合は、関連する仕様と回帰チェックも同時に見直します。

## 本番公開時

開発用サンプルデータを使用しない本番版では、`index.html`内の
`DEMO_ENABLED` を適切に変更してください。

---

詳細な仕様は `SPEC.md`、開発時のチェック方法は `DEV_GUARD.md` を参照してください。


## v4.13.8

蔵書管理を完成版へ整理し、読了／未読・お気に入りの絞り込みと一括変更、シリーズ表示・巻抜けチェック、既存の検索・削除・詳細管理を統合しています。5冊以上のシリーズの重ね表示は、前面カードのデザインを変えず、後ろ4枚を枠線のみ・縦5px刻みで表示し、前面を基準に右へ0.5pxずつ増やします。全巻表示のカード幅も5冊以下シリーズと統一します。


## v4.11.3

回帰修正版。フィルターリセット、蔵書の並び順、末尾が数字だけの巻数を使うシリーズ・巻抜けチェックを修正し、これらを開発時の自動回帰チェックに追加しています。

### v4.11.3
- 蔵書タブを開いた直後は従来の2列カード表示を維持。
- 蔵書一覧を下へスクロールし、サマリーが画面上端に到達すると、5項目をタイトル＋数値だけの横一列に縮小して固定表示。
- スクロールを戻すと元の表示へ復帰。


## v4.13.8

v4.11.3を蔵書タブのVisual Baselineとして固定し、v4.11.4〜v4.11.7で指定された機能だけを追加。タップ可能な要素も既存の表示言語を維持する。5冊以上のシリーズは「重ね表示→全巻表示→タイトル一覧」の循環表示、タイトル一覧では読了/未読とお気に入りを縦表示し、タイトルタップで該当巻だけを開く。蔵書カードでは蔵書・読了/未読・お気に入りをタップ操作可能とし、詳細ボタンをサムネイル下へ配置。チェックボックスはサムネイル上に重ねる。


## v4.13.14

- 背景画像を画面全体へ `cover` / 中央基準で表示。
- 主要パネルを約70%透明（パネル側の不透明度約30%）にして、背景画像を視認しやすく改善。
- 5冊以上シリーズの一枚表示・全巻表示カードを5冊以下シリーズと同一寸法に固定。
- シリーズ表示でも選択中の蔵書並び順を反映。
- 仕様に対して回帰テストが不足していた項目を棚卸しし、実DOM・実関数・localStorage経路を含む回帰テストを24項目へ拡張。


## v4.13.14

5冊以上シリーズのタイトル行背景を最終computed styleで回帰検査し、背景画像を固定ビューポートレイヤーへ移行しました。背景画像は全タブでcover/centerを維持し、パネルは約70%透明です。文字色自動補正は背景オーバーレイ＋パネル透過後の実効背景色を基準に4.5:1以上を確認します。

また、v4.10.0以降の明示仕様を再棚卸しし、ISBNなし複合キー重複、ISBN-10/13のメタデータ共有、削除時の購入意向リセット、固定UIの「詳細を見る」など、従来の回帰テストで弱かった条件を追加しました。現在の仕様カバレッジは29項目です。


### v4.13.14
シリーズ重なり表示の上端線、5冊以上タイトル背景の濃さ、初期タブのホーム固定を修正し、回帰テストを追加。


## v4.13.24
- 巻数表記を表示上「タイトル名 + 数字」に統一（元タイトルと既存ソートは維持）。
- スピンオフ・外伝・短編集・サブタイトル等は本編へ自動統合せず、別シリーズとして扱う。
- 書籍カードとカレンダー指定カード、ホーム「近日発売の注目書籍」の見出し文字サイズを「類似作品を探す」に統一。
- 詳細画面の背景を透過なし（100%不透明）に固定。


### v4.13.24 追加修正
- 蔵書の5冊以上表示で1冊を展開した際の「‹ タイトル一覧に戻る」は、ボタン枠・背景・ボタン風パディングを持たないテキスト操作表示とする。
- キーボード操作（Enter/Space）は維持する。
- 回帰テストでは実DOM要素がBUTTONではないこと、および背景・枠線・パディングがボタン風でないことを確認する。


### v4.13.24 冊数別シリーズ表示
- 1冊：現状維持。
- 2〜4冊：シリーズ見出しをタップして「全巻表示」と「タイトルだけ表示」を切替。初期状態は全巻表示。
- 5冊以上：従来どおり「重ね表示 → 全巻表示 → タイトル一覧」の3状態循環。
- 2〜4冊の全巻表示カードも従来の単巻カード寸法を維持。


## API Management v1.0
API管理・自動フェイルオーバー仕様を正式化し、Phase 1の管理基盤に続き、Phase 2では既存Google Books/openBDのISBN照会・検索をAdapter経由へ移行しました。既存の検索・登録UIの挙動は維持し、Provider固有処理をAdapter層へ隔離しています。詳細は `API_MANAGEMENT_SPEC.md` を参照してください。

## v4.13.35
既存蔵書のシリーズ再整理を追加。APIで確実にシリーズ情報を再確認し、既存蔵書の `series` だけを更新する。外伝・スピンオフ・短編集などは保守的に自動統合しない。


## v4.13.35
Registration/search hardening and performance refinement: fixed result thumbnails, immediate async action locks, fast/concurrent ISBN lookup, series metadata reuse, and safer existing-series repair.

## v4.13.34 release notes
- Search/add result thumbnails are fixed at 68x96 CSS px and cannot flex-shrink due to status badges.
- Individual registration buttons disable immediately and share ISBN-scoped registration locks with bulk registration.
- All selected-ISBN registration is single-flight.
- ISBN batch lookup uses the fast Google-first path and resolves independent rows concurrently; full resolver remains available for repair/audit.
- Registration reuses complete series metadata from search results instead of re-resolving every book.
- Existing-series repair safely recognizes titles such as `レベルE vol.1 (An alien on the planet)` when the trusted API series name is an exact prefix; variant titles remain separate.


## v4.13.34
- 登録処理を個別／一括／詳細／カレンダー間で共有するグローバル登録ロックを導入。ボタン表示更新前の連打もロジック側で拒否する。
- 検索結果領域ごとの世代トークンを導入し、古い検索レスポンスが新しい検索結果を上書きしないようにした。追加タブの作品検索／ISBN検索、検索タブの書籍／作家／作家新刊／類似作品、詳細の関連書籍検索を対象とする。
- 連打・同時実行の回帰テストを追加。


## v4.13.35
- 既存蔵書シリーズ再整理はサンプル蔵書を対象外とし、通常蔵書だけを処理する。
- 正式series.idが信頼できる場合は表示タイトルの字幕・v.3等に左右されずシリーズ情報を採用する。
- シリーズ再整理中はデータ操作・検索操作をロックし、ボタンを「シリーズ再整理中…」表示にする。
- ISBN Resolverのセッション内キャッシュとfast経路を強化し、登録・再整理の不要なAPI待ちを削減する。
- 一括登録の準備処理を最大3件の並行処理にし、3冊以上の登録時間を短縮する。

### v4.13.38 検証
- ホーム／蔵書の統計5枚を共通レンダラー・共通CSSで生成し、実DOMで構造・寸法・主要computed styleを比較します。


## v4.13.40 検証体系
ルール台帳とルール→検証マトリクスを正本化。UIは存在だけでなく実寸・clip・overflow・viewportまで検証し、並び順は指定順→作品名→数値巻数→登録順を全sort modeで直接検証する。


## v4.13.40 データ操作カタログ
`OPERATION_CATALOG_v4_13_40.md` をデータ変更操作の正本とし、UI入口と関数入口の二重ロックで排他制御する。


## v4.13.45 — Phase 7 API management operational stabilization
- Rakuten Books / NDL Search adapters are part of the installed Provider layer.
- ISBN resolution now follows the configured `priority.search` Provider order instead of a hard-coded Provider list.
- Search requests use the same Provider failover path and return normalized results.
- Provider runtime health tracks repeated request failures and temporarily cools down unhealthy Providers before retrying later.
- Provider request timeout is enforced by the API manager.
- Rakuten `itemPrice` remains sale price only; it is never promoted to the app's formal list price.
- Release verification includes deterministic ISBN/search failover, timeout, and temporary-cooldown tests.

## Phase 7 — API管理の実運用安定化
- Resolver session cache: 10分TTL / 最大200件 / Provider設定変更時は自動無効化
- Critical field non-downgrade: 確定済みシリーズ・定価を低信頼結果で上書きしない
- Provider capability と Adapter実装の契約をRelease Gateで検査

## v4.13.45 — ルール／検証体系監査・永続化安定化

本バージョンでは、次期機能の優先順位付けと並行して、既存ルールに対する検証フローの抜け漏れを監査しました。特に保存→reload、バックアップ契約、複数storage更新時の失敗ロールバック、バージョン整合をCURRENTの検証契約へ追加しました。


## v4.13.45 — P0 永続化・バックアップ検証実運用化

- 保存→起動読込の全永続領域検証
- バックアップ export/import ラウンドトリップ
- schemaVersion / 許可キー検証
- バックアップ復元失敗時のatomic rollback
- バージョン整合のRelease Gate化
- 詳細な検証契約：`PERSISTENCE_TEST_CONTRACT_v4_13_45.md`
- Release Gate：152/152 PASS、Mutation Test 3/3 PASS


## v4.13.58

ISBN検索のAPI実測計測を修正し、Provider別の通信時間とAPI回数を正確に表示します。あわせて、アプリ内部・設定タブ・README・package.json・開発ガードのバージョン情報を4.13.58へ統一します。

## v4.13.51
- 単冊登録の完了/失敗通知を計測 `finish()` 後に表示し、alert待ち時間を登録全体の計測から除外。



## v4.13.64

- 検索Providerが一時クールダウン中にスキップされた場合、その状態を検索計測へ保持。
- Providerが一時停止中で通信していないのに「APIから結果を取得できませんでした」とだけ表示される問題を改善。
- 計測結果にスキップされたProviderを明示。
- api_management.js のキャッシュバスターを4.13.64へ更新。
- バージョン表記を4.13.64へ統一。

## v4.13.63

- v4.13.59で発生した `timeoutMs` のスコープ不具合を修正。
- ISBN検索でGoogle Booksが個別タイムアウトした後も、openBD等の次順位Providerへ正常にフェイルオーバーできるようにしました。
- Google Booksの個別タイムアウト上限4秒は維持しています。


## v4.13.66

- 通常のキーワード検索でGoogle Booksがタイムアウトした場合、NDL Searchへ自動フェイルオーバーするよう検索Provider優先順位を更新。
- NDL Searchを通常検索のフォールバックProviderとして有効化。楽天Booksは認証情報が必要なため従来どおり無効。
- Google Books / NDL SearchにProvider別4秒タイムアウトを設定。
- 検索のtimeout→NDL fallbackを自動テストで固定化。
- アプリ、README、package.json、Dev Guard、キャッシュバスターのバージョン表記を4.13.66へ統一。
