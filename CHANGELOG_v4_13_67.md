# v4.13.67

## NDL直結検索の安全側デフォルト化
- NDL OpenSearch Adapter自体は維持し、XML/RSS正規化とfixtureテストも維持。
- ただしiPhoneのブラウザからNDLへ直接接続する経路は、実機で4秒タイムアウトする状態が確認されたため、既定では無効化。
- Google Booksがタイムアウトした検索で、未検証のNDL直結の追加4秒待ちを発生させない。
- 検索計測には無効化されたProviderを「スキップ：Provider無効」として残し、何を試した／試していないかを判別可能にする。
- NDL Adapterはテスト用に有効化でき、将来安全な通信経路を用意した時に再利用できる。
- APP_VERSION / DEV_GUARD_VERSION / package.json / README / 設定タブ / キャッシュバスターを4.13.67へ統一。
