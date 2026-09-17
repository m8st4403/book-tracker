# v4.13.52

## Google Books 約12秒問題のコード調査・ISBNフォールバック修正

### 確定した原因
- `runtimePolicy.requestTimeoutMs` は12,000ms。
- ISBN照会 `resolveIsbn()` は従来 `priority.search` をそのままISBN照会にも使用していた。
- `priority.search` は `googleBooks → rakuten → ndl` で、既定OFFの楽天/NDLしか後続候補がなく、`openBD` がISBN照会の候補から漏れていた。
- Google Booksの1回のISBN照会が12秒でタイムアウトした場合、実機計測では `API回数:1 / googleBooks:12004ms` となる。
- さらに `getJSON()` 自体が最大4回のリトライを持つ一方、外側の `withTimeout()` はPromiseをキャンセルしないため、タイムアウト後も内部処理が継続し得る。この点は別途キャンセル対応を行うべき課題として残す。

### 今回の変更
- ISBN照会専用の `priority.isbnSearch` を追加。
- 優先順位を `googleBooks → openBD → rakuten → ndl` とした。
- `resolveIsbn()` は `priority.isbnSearch` を使用するよう変更。
- 既存のタイトル検索用 `priority.search` は変更しない。
- ISBNフォールバック優先順位の回帰ガードを追加。

### 次の調査
- Google Booksタイムアウト時に、外側の12秒タイムアウトだけでなく内部fetch/リトライも確実に停止するAbortController対応。
- `9784088720715` の追加タブ検索失敗は、今回のGoogle Booksタイムアウト問題と分離して調査する。
