# v4.13.68

## Google Books等のProvider内通信工程を分解計測
- 検索計測にProvider内の通信工程を追加。
- `fetch` とレスポンス `body` の実測時間をProvider別に表示。
- Providerタイムアウト時に、どの工程で時間を消費したかを実機計測で判別できるようにした。
- 既存の検索全体/API通信/API回数/Provider別時間/スキップ理由は維持。
- NDLはv4.13.67の安全側デフォルト（通常ブラウザ検索では無効）を維持。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.68へ統一。
