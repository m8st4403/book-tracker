# v4.13.90

## 無課金キーワード検索の復旧
- Google Booksを既定OFFとする方針を維持。
- NDL Search OpenSearch Adapterを通常のキーワード・タイトル・著者検索で実働化。
- 検索優先順位を `NDL → 楽天Books → Google Books` に変更。楽天Booksは認証情報が設定されている場合のみ実行。
- NDLのProvider内通信計測へ `fetch` / `body` 等を渡し、検索結果から「何の通信を行ったか」を確認できるよう維持。
- ISBN検索は引き続き `openBD → 楽天Books → NDL → Google Books`。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / キャッシュバスターを4.13.90へ統一。

---

## v4.13.88
- 無料トライアル終了後もGoogle Cloud課金なしで継続できる構成を優先し、Google Booksを既定OFFへ変更。
- ISBN検索はopenBDを最優先とし、タイトル・著者検索は楽天Books Adapterを候補に変更。
- 楽天Booksは公式仕様のJSONPを使うブラウザ向けAdapterを追加し、App ID / Access KeyをGitHubへ保存せず端末設定へ保存できる設定UIを追加。
- NDL Search Adapterは保持するが、ブラウザ直結CORS未検証のため既定OFFを継続。
- 無料運用API構成のRelease Guardを追加。

## v4.13.87
- Google Booksの `Queries per day` 日次クォータ超過時、検索失敗を汎用エラーにせず原因を明示するよう改善。
- 検索attemptに `GOOGLE_BOOKS_DAILY_QUOTA_EXCEEDED` を保持し、Provider停止状態を追跡可能にした。
- 日次クォータ超過の計測に `daily-quota-no-retry` を分類直後から記録し、短時間再試行を行っていないことを明示。

## v4.13.86
- Google Books APIの `rateLimitExceeded` + `Queries per day` を日次クォータ超過として明示的に分類。短時間の429再試行を行わず、Providerを一時停止してフェイルオーバーへ進む。
- 日次クォータ超過時はProvider状態を約24時間停止し、同じ端末からの無意味な再試行を抑制。
- 検索計測に `daily-quota-exceeded` / `daily-quota-no-retry` を追加。

# v4.13.86

- 実機計測でHTTP 429後に2回目のHTTPステータスが記録されない事象を追加診断。
- 429レスポンスのbodyを再試行前に明示的に解放し、WebKit系ブラウザで次のfetchが進まない可能性を対策。
- `retry-extend-ok/failed`、`retry-response-body-cancel`、`retry-attempt-2`、`retry-aborted-before-fetch`を計測し、2回目通信が実際に開始されたかを判定可能にした。

# v4.13.81

- HTTP 429後の専用再試行が通信エラー時に通常の内部再試行へ戻らないよう修正。
- `retry-failed` を追加し、429後の再試行がどのように終了したかを明示計測。
- ヘッダーに `v4.13.81` と「複数ISBN・詳細/関連検索・発売日カレンダー対応」を表示。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.81へ統一。

# v4.13.78

- Google Books AdapterがHTTP 429再試行用の`onRetry`を`getJSON()`へ伝播していなかった実装漏れを修正。
- 429後の再試行でProviderタイムアウトを追加延長する処理を実通信経路まで接続。
- Release GuardにAdapter→getJSONの`onRetry`伝播チェックを追加。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.78へ統一。

# v4.13.76

## Google Books 429再試行時のProviderタイムアウト延長

- 実機v4.13.75で、429待機後の再試行が元の4秒Providerタイムアウトに巻き込まれることを確認。
- HTTP 429発生時、再試行待ち時間に加えて4秒の追加Provider時間枠を確保。
- `withTimeout` に再試行時のタイムアウト延長機構を追加し、初回4秒の期限をそのまま再試行へ持ち越さないよう修正。
- 429の待機時間・再試行通信・再試行後のHTTPステータスを同一計測記録で確認可能に維持。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.76へ統一。

# v4.13.75

- 実機計測でGoogle BooksのHTTP 429（レート制限）を確認したため、429処理を再構成。
- `Retry-After` を読み取り、Provider内の再試行待ちを最大1秒に制限。
- 429再試行待ち時間を検索計測へ明示記録し、長い指数バックオフが4秒のProviderタイムアウトに隠れないよう修正。
- 429は最大1回だけ再試行し、継続する場合は `HTTP 429` として終了。
- Settings / README / package.json / cache bust / DEV_GUARD_VERSION を4.13.75へ統一。

# v4.13.74

- Google Books検索のProvider計測にHTTPステータスを追加。fetch後にJSON工程へ進まず停止している場合でも、HTTPステータス（例：HTTP 429）を実機計測で識別できるようにした。
- HTTP 429時のリトライ発生も `retry-after-429` として明示。
- v4.13.73で追加したresponse/json工程計測とAbort監視を維持。
- バージョン情報を4.13.74へ統一。

# v4.13.74

## Google Booksの応答・JSON工程を明示計測しAbort監視を強化
- `fetch` 完了後にHTTP応答到達を明示する `response` 工程を追加。
- JSON処理開始を `json-start` として計測し、`fetch` 後のどこで待機しているかを切り分け可能にした。
- `AbortSignal` のイベント監視に加えて25ms周期の状態監視を追加し、iOS/WebKitでabortイベントが遅延する場合も `json()` 待機を解除できるようにした。
- Response body cancellationを継続し、タイムアウト後に検索処理が次Providerへ進めるようにした。
- バージョン情報を4.13.74へ統一。


# v4.13.72

## Google Booksのjson工程をタイムアウト時に確定
- Google Booksレスポンスの`json()`をAbortSignalと競争させ、Providerタイムアウト時に本文読み取りを即時終了できるよう修正。
- `fetch`後に残っていた未計測の待ち時間を`json`工程として確定し、検索計測へ反映。
- タイムアウト後に次のProviderへ移るまでの処理継続を防止。
- `APP_VERSION` / `DEV_GUARD_VERSION` / package.json / README / 設定タブ / キャッシュバスターを4.13.72へ統一。

# v4.13.71

## Google Books本文処理のタイムアウト対応と検索計測の確定表示

- Google Books検索で `fetch` 完了後の `Response.json()` が本文待ちになった場合も、Providerタイムアウト時にResponse bodyをキャンセルするよう修正。
- Provider内工程の `json` 計測がタイムアウト後に確定した場合も、完了した検索記録へ再描画して表示できるよう修正。
- これにより「Google Books 4003ms」のうち `fetch` 以外で消費した時間を実機計測で確認できる状態にする。
- `APP_VERSION` / `DEV_GUARD_VERSION` / `package.json` / README / 設定タブ / キャッシュバスターを4.13.71へ統一。

---

# v4.13.63

## 書籍検索のタイムアウト・フェイルオーバー改善

- 通常の書籍検索でもProvider別タイムアウトを適用。
- Google BooksはISBN検索と同様に最大4秒で打ち切り、次順位のNDL Searchへフェイルオーバー。
- NDL Searchを通常検索のフォールバックProviderとして有効化。
- AbortControllerによるキャンセル後にHTTPリトライや待機を継続しないよう修正。
- 検索計測の操作ラベルはv4.13.62を継承。
- バージョン表記を4.13.63へ統一。

---

# v4.13.64

## 検索Provider一時停止時の計測・エラー表示改善

- 検索Providerが一時クールダウン中にスキップされた場合、検索計測へその状態を保持。
- 通信を行っていない0msの検索失敗を、実際のProvider通信失敗と区別できるよう改善。
- 一時停止中のProviderを計測結果に「スキップ」として表示。
- `api_management.js` のキャッシュバスターを4.13.64へ更新。
- README、設定画面、package.json、Dev Guardのバージョン情報を4.13.64へ統一。

---

# v4.13.65

## 通常の書籍検索フェイルオーバー

- Google Books のキーワード検索がタイムアウトした場合に、NDL Searchへ自動フェイルオーバーするよう検索Provider優先順位を更新。
- NDL Searchを通常検索のフォールバックProviderとして有効化。楽天Booksは認証情報が必要なため従来どおり無効。
- Google Books / NDL SearchにProvider別4秒タイムアウトを設定。
- 検索のtimeout→NDL fallbackを自動テストで固定化。
- アプリ、README、package.json、Dev Guard、キャッシュバスターのバージョン表記を4.13.65へ統一。

## 期待する動作

Google Booksが約4秒でタイムアウトした場合、NDL Searchへ進み、結果を取得できれば検索成功となる。各Providerの通信時間・API回数・結果件数は既存の検索計測へ記録する。

---

# v4.13.66

## NDL通常検索Adapter改善
- NDL Searchの通常キーワード検索をSRUからOpenSearchへ切り替え。NDL公式仕様で提供されているOpenSearch検索を使用。
- `intitle:` / `inauthor:` / 通常キーワードをOpenSearchの対応パラメータへ明示的に変換。
- OpenSearch RSS/XMLの書誌情報をアプリのBookRecord形式へ正規化。
- ISBN照会は既存のSRU経路を維持。
- Google Booksタイムアウト→NDLフォールバックの既存計測・排他制御・4秒上限を維持。
- バージョン表記を4.13.66へ統一。

---

# v4.13.67

## NDL直結検索の安全側デフォルト化
- NDL OpenSearch Adapter自体は維持し、XML/RSS正規化とfixtureテストも維持。
- ただしiPhoneのブラウザからNDLへ直接接続する経路は、実機で4秒タイムアウトする状態が確認されたため、既定では無効化。
- Google Booksがタイムアウトした検索で、未検証のNDL直結の追加4秒待ちを発生させない。
- 検索計測には無効化されたProviderを「スキップ：Provider無効」として残し、何を試した／試していないかを判別可能にする。
- NDL Adapterはテスト用に有効化でき、将来安全な通信経路を用意した時に再利用できる。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.67へ統一。

---

# v4.13.68

## Google Books等のProvider内通信工程を分解計測
- 検索計測にProvider内の通信工程を追加。
- `fetch` とレスポンス `body` の実測時間をProvider別に表示。
- Providerタイムアウト時に、どの工程で時間を消費したかを実機計測で判別できるようにした。
- 既存の検索全体/API通信/API回数/Provider別時間/スキップ理由は維持。
- NDLはv4.13.67の安全側デフォルト（通常ブラウザ検索では無効）を維持。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.68へ統一。

---

# v4.13.69

## バージョン表記の最終修正

- 設定タブ「このアプリについて」の表示を4.13.69へ修正。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.69へ統一。
- v4.13.67 / v4.13.68など過去バージョンのCHANGELOGは履歴として変更しない。
- v4.13.68で追加した検索Provider内通信工程の計測機能は維持。

---

# v4.13.70

## 検索Provider内通信工程の計測表示を修正

- 検索計測トークン自身に `addApiPhase` を接続し、Provider内の工程計測が実際の検索記録へ保存されるよう修正。
- 「待機 / fetch / json / body」など、どの工程で時間を消費したかを設定タブの検索計測に表示。
- 検索操作名・検索条件・Provider名・工程別時間を同じ計測記録で確認できるよう維持。
- 設定タブのバージョン表示を `APP_VERSION` から生成し、手動のハードコードによる表記ずれを防止。
- `APP_VERSION` / `DEV_GUARD_VERSION` / `package.json` / README / キャッシュバスターを4.13.70へ統一。
- GitHubアップロード側の変更履歴は `CHANGELOG.md` 1ファイルへ集約。旧バージョンの個別CHANGELOGは `アップロード不要/` に保管。

